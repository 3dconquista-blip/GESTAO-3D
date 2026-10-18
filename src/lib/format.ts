// Formatação e leitura de números no padrão brasileiro.
import type { Cents } from './money.ts';
import { roundTo, toCents } from './money.ts';
import type { ISODate, ISODateTime } from './dates.ts';
import { diaDe } from './dates.ts';

function agrupar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 1234.5 -> '1.234,50' (com `decimais` casas). */
export function formatNumero(valor: number, decimais = 2): string {
  if (!Number.isFinite(valor)) return '—';
  const r = roundTo(valor, decimais);
  const neg = r < 0;
  const [int, dec] = Math.abs(r).toFixed(decimais).split('.');
  return `${neg ? '−' : ''}${agrupar(int)}${dec ? ',' + dec : ''}`;
}

/** Número com casas decimais só quando precisa: 2 -> '2', 2.5 -> '2,5' (até `max` casas). */
export function formatQtd(valor: number, max = 2): string {
  if (!Number.isFinite(valor)) return '—';
  const r = roundTo(valor, max);
  const neg = r < 0;
  let s = Math.abs(r).toFixed(max);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  const [int, dec] = s.split('.');
  return `${neg ? '−' : ''}${agrupar(int)}${dec ? ',' + dec : ''}`;
}

/** Centavos -> 'R$ 1.234,56' */
export function formatBRL(cents: Cents): string {
  if (!Number.isFinite(cents)) return '—';
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100).toString();
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '−' : ''}R$ ${agrupar(int)},${dec}`;
}

/** Reais (custo com casas extras) -> 'R$ 2,49' (2 casas) ou 'R$ 2,4873' (decimais=4). */
export function formatReais(reais: number, decimais = 2): string {
  if (!Number.isFinite(reais)) return '—';
  if (decimais === 2) return formatBRL(toCents(reais));
  const neg = reais < 0;
  return `${neg ? '−' : ''}R$ ${formatNumero(Math.abs(reais), decimais)}`;
}

/** 83.42 -> '83,4%' */
export function formatPct(pct: number, decimais = 1): string {
  if (!Number.isFinite(pct)) return '—';
  return `${formatNumero(pct, decimais)}%`;
}

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa' */
export function formatData(iso: ISODate | ISODateTime | null | undefined): string {
  if (!iso) return '—';
  const d = diaDe(iso);
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

/** Data e hora em Brasília: 'dd/mm/aaaa hh:mm' */
export function formatDataHora(iso: ISODateTime | null | undefined): string {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatData(iso);
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return f.format(new Date(iso)).replace(',', '');
}

/** Minutos -> '4 h 30 min' */
export function formatDuracao(minutos: number): string {
  const m = Math.round(minutos);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h} h ${r} min`;
  if (h) return `${h} h`;
  return `${r} min`;
}

/** Gramas -> '1.250 g' (saldo de filamento é sempre em gramas, como na especificação). */
export function formatGramas(g: number): string {
  return `${formatQtd(g, 1)} g`;
}

/** Gramas -> '1,25 kg' (relatórios de consumo). */
export function formatKg(g: number): string {
  return `${formatQtd(g / 1000, 2)} kg`;
}

/**
 * Lê número digitado no padrão brasileiro. Aceita '1.234,56', '1234,56', '1234.56', '0,5'.
 * Retorna null se vazio ou inválido.
 */
export function parseDecimal(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  let s = String(texto).trim().replace(/\s/g, '').replace(/^R\$/i, '').replace('−', '-');
  if (s === '' || s === '-' || s === ',' || s === '.') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const pontos = (s.match(/\./g) || []).length;
    if (pontos > 1) s = s.replace(/\./g, '');
    else if (pontos === 1 && /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Lê dinheiro digitado ('12,90', 'R$ 1.234,56') e devolve centavos, ou null. */
export function parseCents(texto: string | null | undefined): Cents | null {
  const n = parseDecimal(texto);
  return n == null ? null : toCents(n);
}

/** Centavos -> texto para campo de edição: 1290 -> '12,90' */
export function centsParaCampo(cents: Cents | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return formatNumero(cents / 100, 2).replace('−', '-');
}

/** Número -> texto para campo de edição, sem separador de milhar: 0.95 -> '0,95' */
export function numeroParaCampo(valor: number | null | undefined, maxDecimais = 4): string {
  if (valor == null || !Number.isFinite(valor)) return '';
  return formatQtd(valor, maxDecimais).replace(/\./g, '').replace('−', '-');
}

/** Normaliza texto para busca (sem acento, minúsculo). */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Busca simples: todas as palavras do termo aparecem em algum dos campos. */
export function combinaBusca(termo: string, ...campos: (string | null | undefined)[]): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  const alvo = normalizarBusca(campos.filter(Boolean).join(' '));
  return t.split(/\s+/).every((p) => alvo.includes(p));
}
