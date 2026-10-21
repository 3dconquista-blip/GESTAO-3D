// Estoque mínimo automático (decisão 102): produto sem mínimo informado (0) usa o que vende direto em
// 15 dias, pela média dos últimos 30. A reposição dos parceiros já entra à parte em "O que imprimir".
import type { ID, ISODate, MovEstoque, Produto } from '../data/types.ts';
import { CASA } from '../data/types.ts';
import { addDias } from '../lib/dates.ts';
import { idsEstornados } from './stock.ts';

/** Janela de vendas observada (dias). */
export const JANELA_MINIMO_DIAS = 30;
/** Quantos dias de venda direta o mínimo automático cobre. */
export const COBERTURA_MINIMO_DIAS = 15;

/**
 * Peças vendidas direto de Casa (venda rápida e itens de catálogo entregues em pedidos) por produto nos
 * últimos `dias` até `hoje`, inclusive. Vendas canceladas (estornadas) não contam.
 */
export function vendasDiretasRecentes(movs: MovEstoque[], hoje: ISODate, dias = JANELA_MINIMO_DIAS): Map<ID, number> {
  const desde = addDias(hoje, -(dias - 1));
  const estornados = idsEstornados(movs);
  const out = new Map<ID, number>();
  for (const m of movs) {
    if (m.tipo !== 'venda_direta' || m.origem !== CASA || estornados.has(m.id)) continue;
    if (m.data < desde || m.data > hoje) continue;
    out.set(m.produtoId, (out.get(m.produtoId) || 0) + m.quantidade);
  }
  return out;
}

/** Mínimo automático: o que se vende direto em 15 dias (arredondado para cima). Sem vendas, 0. */
export function minimoAutomatico(vendidasNaJanela: number): number {
  if (!(vendidasNaJanela > 0)) return 0;
  return Math.ceil((vendidasNaJanela * COBERTURA_MINIMO_DIAS) / JANELA_MINIMO_DIAS);
}

/** Mínimo que vale para o produto: o informado (> 0) ou o automático. */
export function minimoEfetivo(p: Pick<Produto, 'estoqueMinimo'>, automatico: number): { minimo: number; automatico: boolean } {
  if (p.estoqueMinimo > 0) return { minimo: p.estoqueMinimo, automatico: false };
  return { minimo: automatico, automatico: true };
}
