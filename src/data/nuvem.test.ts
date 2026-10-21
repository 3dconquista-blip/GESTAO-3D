// Sincronização com a nuvem contra um Supabase simulado (Auth + tabela octa_registros com RLS por usuário).
// Garante que um aparelho novo, ao entrar, recebe tudo da nuvem e não sobrescreve a configuração que já existe.
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// nuvem.ts usa preact/hooks (useNuvem); no Node os imports do Preact apontam para a cópia em vendor/.
const vendor = new URL('../../vendor/preact/', import.meta.url).href;
register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(especificador, contexto, proximo) {
      if (especificador === 'preact') return { url: '${vendor}dist/preact.mjs', shortCircuit: true };
      if (especificador === 'preact/hooks') return { url: '${vendor}hooks/dist/hooks.mjs', shortCircuit: true };
      return proximo(especificador, contexto);
    }`)}`,
);

// ---------------------------------------------------------------- localStorage por aparelho

class Armazenamento {
  dados = new Map<string, string>();
  get length() {
    return this.dados.size;
  }
  key(i: number) {
    return Array.from(this.dados.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.dados.has(k) ? (this.dados.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.dados.set(k, String(v));
  }
  removeItem(k: string) {
    this.dados.delete(k);
  }
}
const g = globalThis as unknown as { localStorage: Armazenamento; fetch: unknown };

// ---------------------------------------------------------------- Supabase simulado

interface Linha {
  user_id: string;
  col: string;
  id: string;
  rec: unknown;
  excluido: boolean;
  atualizado_em: string | null;
  servidor_em: string;
}

class SupabaseFalso {
  usuarios = new Map<string, { id: string; senha: string }>();
  linhas = new Map<string, Linha>();
  relogio = Date.parse('2026-10-19T12:00:00Z');
  /** Proteção do trigger do NUVEM.md (versão mais velha não sobrescreve). false = SQL antigo, sem a proteção. */
  protegerVersao = true;

  private agora() {
    this.relogio += 1;
    return new Date(this.relogio).toISOString();
  }
  private resposta(status: number, corpo?: unknown) {
    const txt = corpo === undefined ? '' : JSON.stringify(corpo);
    return { ok: status < 400, status, json: async () => (txt ? JSON.parse(txt) : {}), text: async () => txt };
  }
  private sessao(email: string) {
    const u = this.usuarios.get(email)!;
    return { access_token: `token:${u.id}`, refresh_token: `refresh:${u.id}`, expires_in: 3600, user: { id: u.id, email } };
  }

  fetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const u = new URL(url);
    const corpo = init.body ? JSON.parse(init.body) : undefined;
    if (u.pathname === '/auth/v1/signup') {
      if (this.usuarios.has(corpo.email)) return this.resposta(422, { msg: 'User already registered' });
      this.usuarios.set(corpo.email, { id: `usuario-${this.usuarios.size + 1}`, senha: corpo.password });
      return this.resposta(200, this.sessao(corpo.email));
    }
    if (u.pathname === '/auth/v1/token') {
      const usuario = this.usuarios.get(corpo.email);
      if (!usuario || usuario.senha !== corpo.password) return this.resposta(400, { error_description: 'Invalid login credentials' });
      return this.resposta(200, this.sessao(corpo.email));
    }
    if (u.pathname === '/rest/v1/octa_registros') {
      const userId = (init.headers?.Authorization ?? '').replace('Bearer token:', '');
      if (!userId) return this.resposta(401, { message: 'JWT expected' });
      if (init.method === 'POST') {
        for (const l of corpo as Linha[]) {
          if (l.user_id !== userId) return this.resposta(403, { message: 'new row violates row-level security policy' });
          const k = `${l.user_id}|${l.col}|${l.id}`;
          const velha = this.linhas.get(k);
          // Mesma proteção do trigger do NUVEM.md: versão mais velha não sobrescreve a mais nova.
          if (this.protegerVersao && velha && velha.atualizado_em && l.atualizado_em && l.atualizado_em < velha.atualizado_em) continue;
          this.linhas.set(k, { ...l, servidor_em: this.agora() });
        }
        return this.resposta(201);
      }
      const desde = decodeURIComponent(/servidor_em=gt\.([^&]+)/.exec(u.search)?.[1] ?? '');
      const limite = Number(/limit=(\d+)/.exec(u.search)?.[1] ?? 1000);
      const lista = Array.from(this.linhas.values())
        .filter((l) => l.user_id === userId && l.servidor_em > desde)
        .sort((a, b) => a.servidor_em.localeCompare(b.servidor_em))
        .slice(0, limite);
      return this.resposta(200, lista);
    }
    return this.resposta(404, { message: 'rota desconhecida' });
  };

  /** Registro guardado na nuvem para o usuário. */
  registro(email: string, col: string, id: string) {
    return this.linhas.get(`${this.usuarios.get(email)!.id}|${col}|${id}`)?.rec as Record<string, unknown> | undefined;
  }
}

// Módulos do app (carregados depois do registro acima).
let db: typeof import('./db.ts').db;
let nuvem: typeof import('./nuvem.ts');
let exemplo: typeof import('../services/exemplo.ts');
let config: typeof import('../services/config.ts');

const URL_PROJETO = 'https://projeto-teste.supabase.co';
const CHAVE = 'sb_publishable_chave_de_teste_123456';
let supa: SupabaseFalso;

/** Liga um "aparelho": banco vazio e localStorage próprio. */
function aparelhoNovo() {
  g.localStorage = new Armazenamento();
  db.resetar();
}

before(async () => {
  g.localStorage = new Armazenamento();
  ({ db } = await import('./db.ts'));
  nuvem = await import('./nuvem.ts');
  exemplo = await import('../services/exemplo.ts');
  config = await import('../services/config.ts');
});

beforeEach(() => {
  supa = new SupabaseFalso();
  g.fetch = supa.fetch;
});

describe('nuvem — vários aparelhos', () => {
  for (const protegerVersao of [true, false]) {
  it(`aparelho novo entra e recebe tudo, sem sobrescrever a configuração da nuvem${protegerVersao ? '' : ' (mesmo sem a proteção do servidor)'}`, async () => {
    supa.protegerVersao = protegerVersao;
    // Aparelho A: dados de exemplo, empresa configurada, cria a conta (tudo sobe).
    aparelhoNovo();
    exemplo.carregarExemplo();
    config.atualizarEmpresa({ nome: 'Ateliê da Ana' });
    nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: CHAVE });
    const r = await nuvem.criarConta('ana@exemplo.com', 'segredo123');
    assert.equal(r.precisaConfirmar, false);
    assert.equal(nuvem.estadoNuvem().pendentes, 0);
    const produtosA = db.all('produtos').length;
    assert.equal((supa.registro('ana@exemplo.com', 'config', 'config')?.empresa as { nome: string }).nome, 'Ateliê da Ana');

    // Aparelho B: vazio, ainda no assistente (configuração padrão). Entra na mesma conta.
    aparelhoNovo();
    assert.equal(db.config.onboardingConcluido, false);
    nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: CHAVE });
    await nuvem.entrar('ana@exemplo.com', 'segredo123');

    assert.equal(db.config.empresa.nome, 'Ateliê da Ana');
    assert.equal(db.config.onboardingConcluido, true);
    assert.equal(db.all('produtos').length, produtosA);
    // A nuvem continua com a configuração do aparelho A (o padrão do aparelho B não subiu por cima).
    const naNuvem = supa.registro('ana@exemplo.com', 'config', 'config') as { empresa: { nome: string }; onboardingConcluido: boolean };
    assert.equal(naNuvem.empresa.nome, 'Ateliê da Ana');
    assert.equal(naNuvem.onboardingConcluido, true);
    assert.equal(nuvem.estadoNuvem().pendentes, 0);
  });
  }

  it('o que muda num aparelho chega no outro', async () => {
    aparelhoNovo();
    exemplo.carregarExemplo();
    nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: CHAVE });
    await nuvem.criarConta('ana@exemplo.com', 'segredo123');
    const armazenamentoA = g.localStorage;
    const bancoA = db.snapshot();

    aparelhoNovo();
    nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: CHAVE });
    await nuvem.entrar('ana@exemplo.com', 'segredo123');
    const kb = db.all('produtos').find((p) => p.nome === 'Chaveiro Kettlebell')!;
    db.tx((t) => t.update('produtos', kb.id, { precoEtiquetaCentavos: 1990 }));
    await nuvem.sincronizar();

    // Volta ao aparelho A e sincroniza.
    g.localStorage = armazenamentoA;
    db.aplicarSnapshot(bancoA);
    await nuvem.sincronizar();
    assert.equal(db.get('produtos', kb.id)!.precoEtiquetaCentavos, 1990);
  });

  it('link de configuração leva só a URL e a chave pública', () => {
    aparelhoNovo();
    nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: CHAVE });
    const link = nuvem.linkConfiguracao('https://ana.github.io/GESTAO-3D/#/config/dados')!;
    assert.match(link, /^https:\/\/ana\.github\.io\/GESTAO-3D\/#\/\?nuvem=[A-Za-z0-9_-]+$/);

    aparelhoNovo();
    assert.equal(nuvem.configNuvem(), null);
    assert.equal(nuvem.aplicarLinkConfiguracao(link.slice(link.indexOf('#'))), true);
    assert.deepEqual(nuvem.configNuvem(), { url: URL_PROJETO, chave: CHAVE });
    assert.equal(nuvem.aplicarLinkConfiguracao('#/estoque'), false);
    assert.equal(nuvem.aplicarLinkConfiguracao('#/?nuvem=@@@'), false);
  });

  it('recusa a chave secreta', () => {
    aparelhoNovo();
    assert.throws(() => nuvem.salvarConfigNuvem({ url: URL_PROJETO, chave: 'sb_secret_abcdefghijklmnopqrstuvwxyz' }), /secreta/);
  });
});
