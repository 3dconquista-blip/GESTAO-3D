// Sincronização na nuvem (opcional) com um projeto Supabase do próprio dono.
// - Login por e-mail e senha (Supabase Auth); cada registro é protegido por usuário (Row Level Security).
// - Local primeiro: o app sempre grava no aparelho; a nuvem recebe as alterações quando há internet.
// - Conflito: vale a versão com `atualizadoEm` mais recente.
// Sem nuvem configurada, os dados ficam só no aparelho e o app mostra o aviso fixo de backup.
// Instruções de configuração (SQL da tabela e das políticas): NUVEM.md.
import { useEffect, useState } from 'preact/hooks';
import { db, type Alteracao } from './db.ts';
import { apagarLocal, lerLocal, salvarLocal } from './local.ts';
import type { Base } from './types.ts';

export interface EstadoNuvem {
  /** URL e chave do projeto preenchidas. */
  configurada: boolean;
  logado: boolean;
  email: string | null;
  status: 'desligada' | 'sincronizando' | 'ok' | 'offline' | 'erro';
  ultimaSincronizacao: string | null;
  erro: string | null;
  /** Alterações deste aparelho ainda não enviadas. */
  pendentes: number;
}

export interface ConfigNuvem {
  url: string;
  chave: string;
}

interface Sessao {
  accessToken: string;
  refreshToken: string;
  /** Epoch em ms. */
  expiraEm: number;
  email: string;
  userId: string;
}

const TABELA = 'octa_registros';
const K_CONFIG = 'nuvem:config';
const K_SESSAO = 'nuvem:sessao';
const K_PENDENTES = 'nuvem:pendentes';
const kCursor = (userId: string) => `nuvem:cursor:${userId}`;
const LOTE = 400;

let estado: EstadoNuvem = {
  configurada: false,
  logado: false,
  email: null,
  status: 'desligada',
  ultimaSincronizacao: null,
  erro: null,
  pendentes: 0,
};
const ouvintes = new Set<() => void>();

export function estadoNuvem(): EstadoNuvem {
  return estado;
}

export function definirEstadoNuvem(patch: Partial<EstadoNuvem>) {
  estado = { ...estado, ...patch };
  for (const fn of Array.from(ouvintes)) fn();
}

export function useNuvem(): EstadoNuvem {
  const [, set] = useState(0);
  useEffect(() => {
    const fn = () => set((v) => v + 1);
    ouvintes.add(fn);
    fn();
    return () => {
      ouvintes.delete(fn);
    };
  }, []);
  return estado;
}

// ---------------------------------------------------------------- Configuração e sessão

export function configNuvem(): ConfigNuvem | null {
  const c = lerLocal<ConfigNuvem>(K_CONFIG);
  return c && c.url && c.chave ? c : null;
}

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Salva URL e chave do projeto (ou null para voltar a usar só o aparelho). */
export function salvarConfigNuvem(c: ConfigNuvem | null) {
  if (!c) {
    apagarLocal(K_CONFIG);
    apagarLocal(K_SESSAO);
    pararRotinas();
    definirEstadoNuvem({ configurada: false, logado: false, email: null, status: 'desligada', erro: null });
    return;
  }
  const url = normalizarUrl(c.url);
  if (!/^https:\/\/.+/.test(url)) throw new Error('Informe a URL do projeto, começando com https://');
  if (c.chave.trim().length < 20) throw new Error('Informe a chave pública do projeto (publishable ou anon).');
  if (/^sb_secret_/.test(c.chave.trim())) throw new Error('Essa é a chave secreta. Use a chave pública (publishable, começa com sb_publishable_).');
  // Outro projeto: a sessão do projeto antigo não vale mais.
  const anterior = configNuvem();
  if (anterior && anterior.url !== url) apagarLocal(K_SESSAO);
  salvarLocal(K_CONFIG, { url, chave: c.chave.trim() });
  definirEstadoNuvem({ configurada: true, logado: !!sessao(), status: 'desligada', erro: null });
}

/**
 * Link que abre o app em outro aparelho já com a nuvem configurada (só falta entrar com e-mail e senha).
 * Leva apenas a URL e a chave pública do projeto, que são públicas por natureza (quem protege os dados é o login).
 */
export function linkConfiguracao(enderecoApp: string): string | null {
  const c = configNuvem();
  if (!c) return null;
  const dados = btoa(JSON.stringify({ u: c.url, k: c.chave })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${enderecoApp.split('#')[0]}#/?nuvem=${dados}`;
}

/** Lê o link de configuração (`#/?nuvem=...`), se houver, e liga a nuvem. Devolve true se aplicou. */
export function aplicarLinkConfiguracao(hash: string): boolean {
  const m = /[?&]nuvem=([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const { u, k } = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { u?: string; k?: string };
    if (!u || !k) return false;
    salvarConfigNuvem({ url: u, chave: k });
    return true;
  } catch {
    return false;
  }
}

function sessao(): Sessao | null {
  return lerLocal<Sessao>(K_SESSAO);
}

function mensagemErro(corpo: unknown, padrao: string): string {
  const c = corpo as { error_description?: string; msg?: string; message?: string; error?: string } | null;
  const t = (c && (c.error_description || c.msg || c.message || c.error)) || '';
  if (/invalid login credentials/i.test(t)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(t)) return 'Confirme seu e-mail (veja a caixa de entrada) e tente de novo.';
  if (/already registered|already exists/i.test(t)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/password/i.test(t) && /6/.test(t)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/permission denied|42501/i.test(t)) return 'O projeto não liberou a tabela para o app. Rode de novo o SQL do arquivo NUVEM.md (ele tem o GRANT).';
  if (/signups? not allowed|signup.*disabled/i.test(t)) return 'Este projeto não aceita contas novas. Use "Entrar" com a conta que já existe.';
  if (/relation .* does not exist|could not find the table/i.test(t)) return 'A tabela octa_registros não existe no projeto. Rode o SQL do arquivo NUVEM.md.';
  return t || padrao;
}

async function chamarAuth(caminho: string, corpo: unknown): Promise<Record<string, unknown>> {
  const cfg = configNuvem();
  if (!cfg) throw new Error('Nuvem não configurada.');
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/${caminho}`, {
      method: 'POST',
      headers: { apikey: cfg.chave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Sem conexão com a internet.');
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(mensagemErro(json, 'Não foi possível entrar.'));
  return json;
}

function guardarSessao(json: Record<string, unknown>): Sessao {
  const user = json.user as { id: string; email: string };
  const s: Sessao = {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    expiraEm: Date.now() + Number(json.expires_in || 3600) * 1000,
    email: user.email,
    userId: user.id,
  };
  salvarLocal(K_SESSAO, s);
  return s;
}

/** Entra com e-mail e senha e sincroniza. */
export async function entrar(email: string, senha: string): Promise<void> {
  const json = await chamarAuth('token?grant_type=password', { email: email.trim(), password: senha });
  const s = guardarSessao(json);
  // Primeiro login neste aparelho: envia tudo o que já existe aqui.
  marcarTudoPendente();
  definirEstadoNuvem({ logado: true, email: s.email, erro: null });
  iniciarRotinas();
  await sincronizar();
}

/** Cria a conta. Se o projeto exigir confirmação de e-mail, devolve precisaConfirmar. */
export async function criarConta(email: string, senha: string): Promise<{ precisaConfirmar: boolean }> {
  const json = await chamarAuth('signup', { email: email.trim(), password: senha });
  if (json.access_token) {
    const s = guardarSessao(json);
    marcarTudoPendente();
    definirEstadoNuvem({ logado: true, email: s.email, erro: null });
    iniciarRotinas();
    await sincronizar();
    return { precisaConfirmar: false };
  }
  return { precisaConfirmar: true };
}

/** Sai da conta (os dados continuam no aparelho). */
export function sair() {
  apagarLocal(K_SESSAO);
  pararRotinas();
  definirEstadoNuvem({ logado: false, email: null, status: 'desligada' });
}

async function tokenValido(): Promise<Sessao> {
  let s = sessao();
  if (!s) throw new Error('Sessão encerrada. Entre de novo.');
  if (s.expiraEm - Date.now() < 60_000) {
    try {
      const json = await chamarAuth('token?grant_type=refresh_token', { refresh_token: s.refreshToken });
      s = guardarSessao(json);
    } catch (e) {
      if (e instanceof Error && /conexão/.test(e.message)) throw e;
      sair();
      throw new Error('Sua sessão expirou. Entre de novo.');
    }
  }
  return s;
}

async function rest(metodo: string, consulta: string, corpo?: unknown, prefer?: string): Promise<unknown> {
  const cfg = configNuvem();
  if (!cfg) throw new Error('Nuvem não configurada.');
  const s = await tokenValido();
  const headers: Record<string, string> = {
    apikey: cfg.chave,
    Authorization: `Bearer ${s.accessToken}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/rest/v1/${TABELA}${consulta}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  } catch {
    throw new Error('Sem conexão com a internet.');
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(mensagemErro(json, `Erro da nuvem (${res.status}).`));
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------------------------------------------------------------- Fila de envio

function lerPendentes(): Set<string> {
  return new Set(lerLocal<string[]>(K_PENDENTES) || []);
}

function salvarPendentes(p: Set<string>) {
  salvarLocal(K_PENDENTES, Array.from(p));
  definirEstadoNuvem({ pendentes: p.size });
}

function marcarTudoPendente() {
  const p = lerPendentes();
  for (const k of db.todasAsChaves()) p.add(k);
  salvarPendentes(p);
}

function aoGravarLocal(alteracoes: Alteracao[]) {
  const p = lerPendentes();
  for (const a of alteracoes) p.add(`${a.col}/${a.id}`);
  salvarPendentes(p);
  agendarEnvio();
}

let timerEnvio: ReturnType<typeof setTimeout> | null = null;
function agendarEnvio() {
  if (timerEnvio) clearTimeout(timerEnvio);
  timerEnvio = setTimeout(() => {
    timerEnvio = null;
    sincronizar().catch(() => {});
  }, 1500);
}

// ---------------------------------------------------------------- Sincronização

interface Linha {
  col: string;
  id: string;
  rec: Base | null;
  excluido: boolean;
  atualizado_em: string | null;
  servidor_em: string;
}

let emAndamento: Promise<void> | null = null;

/**
 * Busca as alterações dos outros aparelhos e depois envia as deste. Buscar antes é o que impede um aparelho
 * novo (ainda com a configuração padrão) de sobrescrever na nuvem uma versão mais recente: na busca, a versão
 * mais nova vence e a pendência local mais velha é descartada; só o que é mais novo aqui é enviado.
 */
export function sincronizar(): Promise<void> {
  if (!configNuvem() || !sessao()) return Promise.resolve();
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    definirEstadoNuvem({ status: 'sincronizando', erro: null });
    try {
      await buscar();
      await enviar();
      definirEstadoNuvem({ status: 'ok', ultimaSincronizacao: new Date().toISOString(), erro: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const offline = /conexão/.test(msg) || (typeof navigator !== 'undefined' && !navigator.onLine);
      definirEstadoNuvem({ status: offline ? 'offline' : 'erro', erro: offline ? null : msg });
      if (!offline) throw e;
    } finally {
      emAndamento = null;
    }
  })();
  return emAndamento;
}

async function enviar() {
  const s = sessao();
  if (!s) return;
  const pendentes = lerPendentes();
  if (!pendentes.size) return;
  const chaves = Array.from(pendentes);
  for (let i = 0; i < chaves.length; i += LOTE) {
    const lote = chaves.slice(i, i + LOTE);
    const linhas = lote.map((k) => {
      const barra = k.indexOf('/');
      const rec = db.porChave(k) ?? null;
      return {
        user_id: s.userId,
        col: k.slice(0, barra),
        id: k.slice(barra + 1),
        rec,
        excluido: !rec,
        atualizado_em: rec?.atualizadoEm ?? new Date().toISOString(),
      };
    });
    await rest('POST', '?on_conflict=user_id,col,id', linhas, 'resolution=merge-duplicates,return=minimal');
    const atual = lerPendentes();
    for (const k of lote) atual.delete(k);
    salvarPendentes(atual);
  }
}

async function buscar() {
  const s = sessao();
  if (!s) return;
  let cursor = lerLocal<string>(kCursor(s.userId)) || '1970-01-01T00:00:00Z';
  for (;;) {
    const linhas = (await rest(
      'GET',
      `?select=col,id,rec,excluido,atualizado_em,servidor_em&servidor_em=gt.${encodeURIComponent(cursor)}&order=servidor_em.asc&limit=1000`,
    )) as Linha[];
    if (!linhas?.length) break;
    const pendentes = lerPendentes();
    const aplicar: Alteracao[] = [];
    for (const l of linhas) {
      const chave = `${l.col}/${l.id}`;
      const local = db.porChave(chave);
      const remotoEm = l.rec?.atualizadoEm ?? l.atualizado_em ?? '';
      // Alteração local ainda não enviada e mais nova: mantém a local (ela será enviada).
      if (pendentes.has(chave) && local && local.atualizadoEm > remotoEm) continue;
      if (local && !l.excluido && local.atualizadoEm === remotoEm) {
        pendentes.delete(chave);
        continue;
      }
      pendentes.delete(chave);
      aplicar.push({ col: l.col as Alteracao['col'], id: l.id, rec: l.excluido ? null : l.rec });
    }
    salvarPendentes(pendentes);
    db.aplicarExternos(aplicar);
    cursor = linhas[linhas.length - 1].servidor_em;
    salvarLocal(kCursor(s.userId), cursor);
    if (linhas.length < 1000) break;
  }
}

// ---------------------------------------------------------------- Rotinas

let intervalo: ReturnType<typeof setInterval> | null = null;
const aoVoltar = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') sincronizar().catch(() => {});
};

function iniciarRotinas() {
  db.aoGravar = aoGravarLocal;
  if (typeof window === 'undefined') return;
  if (!intervalo) intervalo = setInterval(aoVoltar, 60_000);
  document.addEventListener('visibilitychange', aoVoltar);
  window.addEventListener('online', aoVoltar);
}

function pararRotinas() {
  db.aoGravar = null;
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
  if (typeof window === 'undefined') return;
  document.removeEventListener('visibilitychange', aoVoltar);
  window.removeEventListener('online', aoVoltar);
}

// Estado inicial lido do aparelho (evita mostrar o app antes da tela de login).
{
  const s = sessao();
  const cfg = configNuvem();
  estado = { ...estado, configurada: !!cfg, logado: !!(cfg && s), email: s?.email ?? null };
}

/** Chamado no início do app, depois de carregar o banco local. */
export async function iniciarNuvem(): Promise<void> {
  const cfg = configNuvem();
  if (!cfg) {
    definirEstadoNuvem({ configurada: false, logado: false, status: 'desligada' });
    return;
  }
  const s = sessao();
  definirEstadoNuvem({ configurada: true, logado: !!s, email: s?.email ?? null, pendentes: lerPendentes().size });
  if (!s) return;
  iniciarRotinas();
  await sincronizar().catch(() => {});
}
