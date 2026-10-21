// Backup completo em JSON (Configurações > Dados): exportar e importar num banco vazio ou existente.
// Importar substitui TUDO o que está no aparelho pelo conteúdo do arquivo.
import { db, type Snapshot } from '../data/db.ts';
import { NOME_APP } from '../data/defaults.ts';
import { lerLocal, salvarLocal } from '../data/local.ts';
import { diffDias, hojeISO } from '../lib/dates.ts';
import type { Base, Config, ISODate, NomeColecao } from '../data/types.ts';
import { COLECOES } from '../data/types.ts';
import { ErroNegocio } from './estoque.ts';

export interface ArquivoBackup {
  app: 'octa';
  versao: 1;
  exportadoEm: string;
  config: Config;
  colecoes: Partial<Record<NomeColecao, Base[]>>;
}

// ---------------------------------------------------------------- Lembrete (decisão 105)

/** De quantos em quantos dias o app lembra do backup (só sem a nuvem). */
export const DIAS_LEMBRETE_BACKUP = 7;
const CHAVE_ULTIMO = 'backup:ultimo';
const CHAVE_ADIADO = 'backup:adiado';

export interface LembreteBackup {
  mostrar: boolean;
  /** Dias desde o último backup neste aparelho (null = nunca). */
  dias: number | null;
}

/**
 * Lembrar do backup: só com dados, sem nuvem, quando nunca houve backup ou o último tem 7 dias ou mais, e se o
 * dono não pediu "Depois" nos últimos 7 dias.
 */
export function lembreteBackup(e: { ultimo: ISODate | null; adiadoEm: ISODate | null; hoje: ISODate; temDados: boolean; nuvem: boolean }): LembreteBackup {
  const dias = e.ultimo ? diffDias(e.ultimo, e.hoje) : null;
  if (e.nuvem || !e.temDados) return { mostrar: false, dias };
  if (e.adiadoEm && diffDias(e.adiadoEm, e.hoje) < DIAS_LEMBRETE_BACKUP) return { mostrar: false, dias };
  return { mostrar: dias == null || dias >= DIAS_LEMBRETE_BACKUP, dias };
}

/** Lembrete com o que está guardado neste aparelho. */
export function lembreteBackupAtual(nuvem: boolean, hoje: ISODate = hojeISO()): LembreteBackup {
  const temDados = db.all('produtos').length > 0 || db.all('vendas').length > 0 || db.all('materiais').length > 0;
  return lembreteBackup({ ultimo: lerLocal<ISODate>(CHAVE_ULTIMO), adiadoEm: lerLocal<ISODate>(CHAVE_ADIADO), hoje, temDados, nuvem });
}

/** Guarda neste aparelho o dia do último backup baixado. */
export function registrarBackupFeito(hoje: ISODate = hojeISO()): void {
  salvarLocal(CHAVE_ULTIMO, hoje);
}

/** "Depois": não lembra de novo por 7 dias. */
export function adiarLembreteBackup(hoje: ISODate = hojeISO()): void {
  salvarLocal(CHAVE_ADIADO, hoje);
}

/** Gera o texto JSON do backup com tudo o que está no aparelho. */
export async function exportarBackup(): Promise<string> {
  await db.aguardarGravacoes();
  const snap = db.snapshot();
  const arquivo: ArquivoBackup = {
    app: 'octa',
    versao: 1,
    exportadoEm: new Date().toISOString(),
    config: snap.config as Config,
    colecoes: snap.colecoes,
  };
  return JSON.stringify(arquivo);
}

/** Nome sugerido do arquivo: 3d-gestao-backup-2026-10-17.json */
export function nomeArquivoBackup(hoje: string): string {
  return `3d-gestao-backup-${hoje}.json`;
}

export interface ValidacaoBackup {
  ok: boolean;
  erros: string[];
  /** Quantidade de registros por coleção. */
  resumo: Partial<Record<NomeColecao, number>>;
  exportadoEm: string | null;
  arquivo: ArquivoBackup | null;
}

/** Confere se o texto é um backup do app antes de importar (o campo interno continua 'octa'). */
export function validarBackup(texto: string): ValidacaoBackup {
  const erros: string[] = [];
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erros: ['O arquivo não é um backup válido (não é JSON).'], resumo: {}, exportadoEm: null, arquivo: null };
  }
  const a = dados as Partial<ArquivoBackup>;
  if (!a || a.app !== 'octa') erros.push(`Este arquivo não é um backup do ${NOME_APP}.`);
  if (a && a.versao !== 1) erros.push('Versão de backup desconhecida.');
  if (!a?.config || typeof a.config !== 'object') erros.push('O backup não tem as configurações.');
  const resumo: Partial<Record<NomeColecao, number>> = {};
  for (const c of COLECOES) {
    const lista = a?.colecoes?.[c];
    if (lista == null) continue;
    if (!Array.isArray(lista) || lista.some((r) => !r || typeof r !== 'object' || typeof (r as Base).id !== 'string')) {
      erros.push(`A lista "${c}" do backup está danificada.`);
      continue;
    }
    resumo[c] = lista.length;
  }
  return { ok: erros.length === 0, erros, resumo, exportadoEm: a?.exportadoEm ?? null, arquivo: erros.length ? null : (a as ArquivoBackup) };
}

/** Substitui todos os dados do aparelho pelos do backup (depois de validar). */
export async function importarBackup(texto: string): Promise<ValidacaoBackup> {
  const v = validarBackup(texto);
  if (!v.ok || !v.arquivo) throw new ErroNegocio(v.erros.join(' '));
  const snap: Snapshot = { config: v.arquivo.config, colecoes: v.arquivo.colecoes };
  await db.substituirTudo(snap);
  return v;
}
