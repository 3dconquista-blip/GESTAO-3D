// Datas no formato ISO 'YYYY-MM-DD' (dia civil no fuso de Brasília).
// Cálculos de dias são feitos em UTC para não sofrer com fuso/horário de verão.

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // ISO completo com hora

export const FUSO = 'America/Sao_Paulo';

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia de hoje em Brasília. */
export function hojeISO(agora: Date = new Date()): ISODate {
  return fmtDia.format(agora);
}

/** Data e hora atuais (ISO UTC) para carimbos de criação/atualização. */
export function agoraISO(): ISODateTime {
  return new Date().toISOString();
}

/** Converte data-hora ISO para o dia civil de Brasília. */
export function diaDe(dataHora: ISODateTime): ISODate {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataHora)) return dataHora;
  return fmtDia.format(new Date(dataHora));
}

function toUTC(iso: ISODate): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDias(iso: ISODate, dias: number): ISODate {
  return fromUTC(toUTC(iso) + dias * 86400000);
}

/** Quantos dias de `de` até `ate` (ate - de). */
export function diffDias(de: ISODate, ate: ISODate): number {
  return Math.round((toUTC(ate) - toUTC(de)) / 86400000);
}

export function mesDe(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function inicioDoMes(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function fimDoMes(iso: ISODate): ISODate {
  const [y, m] = iso.split('-').map(Number);
  return fromUTC(Date.UTC(y, m, 0));
}

export function addMeses(iso: ISODate, meses: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimo)));
}

/** Está entre de e ate (inclusive)? */
export function entre(iso: ISODate, de: ISODate, ate: ISODate): boolean {
  const d = iso.slice(0, 10);
  return d >= de && d <= ate;
}

export interface Periodo {
  de: ISODate;
  ate: ISODate;
  rotulo: string;
}

export type PeriodoChave = 'quinzena' | 'quinzena_anterior' | 'mes' | 'mes_anterior' | 'ano' | 'personalizado';

/** Quinzena: dias 1 a 15, ou 16 ao fim do mês. */
export function quinzenaDe(iso: ISODate): Periodo {
  const dia = Number(iso.slice(8, 10));
  if (dia <= 15) return { de: inicioDoMes(iso), ate: `${iso.slice(0, 7)}-15`, rotulo: 'Esta quinzena' };
  return { de: `${iso.slice(0, 7)}-16`, ate: fimDoMes(iso), rotulo: 'Esta quinzena' };
}

export function periodoPorChave(chave: Exclude<PeriodoChave, 'personalizado'>, hoje: ISODate): Periodo {
  switch (chave) {
    case 'quinzena':
      return quinzenaDe(hoje);
    case 'quinzena_anterior': {
      const atual = quinzenaDe(hoje);
      const q = quinzenaDe(addDias(atual.de, -1));
      return { ...q, rotulo: 'Quinzena anterior' };
    }
    case 'mes':
      return { de: inicioDoMes(hoje), ate: fimDoMes(hoje), rotulo: 'Este mês' };
    case 'mes_anterior': {
      const ref = addDias(inicioDoMes(hoje), -1);
      return { de: inicioDoMes(ref), ate: fimDoMes(ref), rotulo: 'Mês anterior' };
    }
    case 'ano':
      return { de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31`, rotulo: 'Este ano' };
  }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-10' -> 'out/2026' */
export function rotuloMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
}

/** Últimos n meses terminando no mês de `hoje`, do mais antigo ao mais recente: ['2026-05', ..., '2026-10'] */
export function ultimosMeses(hoje: ISODate, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(mesDe(addMeses(inicioDoMes(hoje), -i)));
  return out;
}
