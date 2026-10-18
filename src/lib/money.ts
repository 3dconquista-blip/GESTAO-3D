// Arredondamentos de dinheiro e custos.
// Regras do projeto:
// - Valores de transação (vendas, acertos, pagamentos) são centavos inteiros (tipo Cents).
// - Custos unitários são números em reais com até 4 casas decimais.
// - Arredondamento "metade para cima" só no resultado final.
// Para evitar erros de ponto flutuante (ex.: 4.485 * 100 = 448.49999...), o deslocamento
// de casas decimais é feito pela notação exponencial em texto.

export type Cents = number;

/** Desloca a vírgula decimal sem erro de ponto flutuante: shift(4.485, 2) = 448.5 */
export function shift(value: number, places: number): number {
  const [mantissa, exp] = String(value).split('e');
  return Number(`${mantissa}e${Number(exp ?? 0) + places}`);
}

/** Arredonda com "metade para cima" (para negativos, simétrico: afasta do zero). */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * shift(Math.round(shift(abs, decimals)), -decimals);
}

/** Custo unitário com até 4 casas decimais. */
export function round4(value: number): number {
  return roundTo(value, 4);
}

/** Reais (número) -> centavos inteiros, metade para cima. */
export function toCents(reais: number): Cents {
  return roundTo(shift(reais, 2), 0);
}

/** Centavos -> reais (número). */
export function toReais(cents: Cents): number {
  return shift(cents, -2);
}

/** Reais -> centavos, sempre para cima (usado no preço sugerido). Tolera ruído de ponto flutuante. */
export function ceilToCents(reais: number): Cents {
  return Math.ceil(roundTo(shift(reais, 2), 6));
}

/** Percentual de um valor em centavos, metade para cima: pctOfCents(1495, 30) = 449 */
export function pctOfCents(cents: Cents, pct: number): Cents {
  return roundTo((cents * pct) / 100, 0);
}

export type ModoArredondamento = 'noventa' | 'inteiro' | 'nenhum';

/**
 * Arredonda um preço (em reais) sempre para cima, conforme a configuração.
 * 'noventa': sobe até o próximo X,90 (4,97 -> 5,90; 5,90 -> 5,90; 117,67 -> 117,90).
 * 'inteiro': sobe até o próximo real inteiro. 'nenhum': só sobe ao centavo.
 * Retorna centavos.
 */
export function arredondarPreco(reais: number, modo: ModoArredondamento): Cents {
  const c = ceilToCents(reais);
  if (modo === 'noventa') return Math.max(0, Math.ceil((c - 90) / 100)) * 100 + 90;
  if (modo === 'inteiro') return Math.ceil(c / 100) * 100;
  return c;
}

/** Soma segura de centavos. */
export function sumCents(values: Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
