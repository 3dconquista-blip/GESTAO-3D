// Exportação CSV pensada para o Excel em português (seção 11.2: "Exportar CSV de cada relatório").
// - Separador ';' (o Excel pt-BR usa vírgula como decimal), quebra de linha CRLF e BOM UTF-8
//   (sem o BOM o Excel mostra acentos quebrados).
// - Números com vírgula decimal e sem separador de milhar ("1234,56"); datas como dd/mm/aaaa.
// - Campos com ';', aspas ou quebra de linha vão entre aspas (aspas internas duplicadas).
// - Texto que começa com = + - @ ganha um apóstrofo na frente, para o Excel não executar fórmula.
// Funções puras: devolvem o texto; quem baixa o arquivo é a interface
// (new Blob([texto], { type: 'text/csv;charset=utf-8' })).
import type { Cents } from '../lib/money.ts';
import { roundTo, toReais } from '../lib/money.ts';
import type { ISODate } from '../lib/dates.ts';
import { formatData, formatDataHora } from '../lib/format.ts';

export const SEPARADOR_CSV = ';';
export const QUEBRA_CSV = '\r\n';
export const BOM_UTF8 = '﻿';

export type ValorCSV = string | number | boolean | null | undefined;

/**
 * Como a célula é formatada:
 * - 'auto' (padrão): número com vírgula, true/false como Sim/Não, 'YYYY-MM-DD' como data, resto como texto.
 * - 'centavos': número em centavos exportado em reais com 2 casas (8820 -> "88,20").
 * - 'numero': número com vírgula (use `decimais` para fixar as casas).
 * - 'data': 'YYYY-MM-DD' ou ISO completo -> dd/mm/aaaa (com hora, se houver).
 * - 'texto': sempre texto, sem conversão.
 */
export type TipoColunaCSV = 'auto' | 'texto' | 'numero' | 'centavos' | 'data';

export interface ColunaCSV<T> {
  titulo: string;
  valor: (linha: T) => ValorCSV;
  tipo?: TipoColunaCSV;
  /** Casas decimais fixas (tipo 'numero' ou 'auto'). Sem isso, até 4 casas, sem zeros sobrando. */
  decimais?: number;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Número no formato do Excel pt-BR, sem separador de milhar: 1234.5 -> '1234,5'; numeroCSV(88.2, 2) -> '88,20'. */
export function numeroCSV(valor: number, decimais?: number): string {
  if (!Number.isFinite(valor)) return '';
  let s: string;
  if (decimais != null) {
    s = roundTo(valor, decimais).toFixed(decimais);
  } else {
    s = roundTo(valor, 4).toFixed(4);
    s = s.replace(/\.?0+$/, '');
  }
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  return s.replace('.', ',');
}

/** Centavos -> reais com vírgula e 2 casas: 8820 -> '88,20'; -150 -> '-1,50'. */
export function centavosCSV(cents: Cents): string {
  if (!Number.isFinite(cents)) return '';
  return numeroCSV(toReais(cents), 2);
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa'; ISO completo -> 'dd/mm/aaaa hh:mm' (Brasília). Outro texto volta igual. */
export function dataCSV(valor: string): string {
  if (RE_DATA.test(valor)) return formatData(valor);
  if (RE_DATA_HORA.test(valor)) return formatDataHora(valor);
  return valor;
}

/** Escapa um texto para uma célula: protege contra fórmula (opcional) e põe aspas quando precisa. */
export function escaparCSV(texto: string, protegerFormula = true): string {
  let s = texto;
  if (protegerFormula && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Formata e escapa um valor como célula CSV. */
export function celulaCSV(valor: ValorCSV, tipo: TipoColunaCSV = 'auto', decimais?: number): string {
  if (valor == null) return '';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'number') {
    if (tipo === 'texto') return escaparCSV(String(valor));
    if (tipo === 'centavos') return centavosCSV(valor);
    return numeroCSV(valor, decimais);
  }
  const texto = String(valor);
  if (tipo === 'texto') return escaparCSV(texto);
  if (tipo === 'data' || (tipo === 'auto' && (RE_DATA.test(texto) || RE_DATA_HORA.test(texto)))) {
    const d = dataCSV(texto);
    if (d !== texto) return escaparCSV(d, false);
  }
  return escaparCSV(texto);
}

/**
 * Monta o CSV (com BOM, ';' e CRLF) a partir das linhas e das colunas.
 * Ex.: paraCSV(vendas, [{ titulo: 'Data', valor: (v) => v.data }, { titulo: 'Total (R$)', valor: (v) => v.totalCentavos, tipo: 'centavos' }])
 */
export function paraCSV<T>(linhas: readonly T[], colunas: readonly ColunaCSV<T>[]): string {
  const cabecalho = colunas.map((c) => escaparCSV(c.titulo)).join(SEPARADOR_CSV);
  const corpo = linhas.map((l) => colunas.map((c) => celulaCSV(c.valor(l), c.tipo, c.decimais)).join(SEPARADOR_CSV));
  return BOM_UTF8 + [cabecalho, ...corpo].map((linha) => linha + QUEBRA_CSV).join('');
}

/** Nome de arquivo seguro: nomeArquivoCSV('Vendas por canal', '2026-10-16') -> 'octa-vendas-por-canal-2026-10-16.csv' */
export function nomeArquivoCSV(nome: string, data: ISODate): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `octa-${slug || 'dados'}-${data}.csv`;
}
