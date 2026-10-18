// Backup completo em JSON (Configurações > Dados): exportar e importar num banco vazio ou existente.
// Importar substitui TUDO o que está no aparelho pelo conteúdo do arquivo.
import { db, type Snapshot } from '../data/db.ts';
import type { Base, Config, NomeColecao } from '../data/types.ts';
import { COLECOES } from '../data/types.ts';
import { ErroNegocio } from './estoque.ts';

export interface ArquivoBackup {
  app: 'octa';
  versao: 1;
  exportadoEm: string;
  config: Config;
  colecoes: Partial<Record<NomeColecao, Base[]>>;
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

/** Nome sugerido do arquivo: octa-backup-2026-10-17.json */
export function nomeArquivoBackup(hoje: string): string {
  return `octa-backup-${hoje}.json`;
}

export interface ValidacaoBackup {
  ok: boolean;
  erros: string[];
  /** Quantidade de registros por coleção. */
  resumo: Partial<Record<NomeColecao, number>>;
  exportadoEm: string | null;
  arquivo: ArquivoBackup | null;
}

/** Confere se o texto é um backup do OCTA antes de importar. */
export function validarBackup(texto: string): ValidacaoBackup {
  const erros: string[] = [];
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erros: ['O arquivo não é um backup válido (não é JSON).'], resumo: {}, exportadoEm: null, arquivo: null };
  }
  const a = dados as Partial<ArquivoBackup>;
  if (!a || a.app !== 'octa') erros.push('Este arquivo não é um backup do OCTA.');
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
