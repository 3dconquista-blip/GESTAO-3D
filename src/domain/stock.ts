// Saldos de estoque e de materiais. O saldo é sempre a soma das movimentações.
import type { ID, LocalId, MovEstoque, MovMaterial } from '../data/types.ts';
import { CASA } from '../data/types.ts';

export interface SaldosProduto {
  casa: number;
  /** parceiroLocal ('p:<id>') -> saldo */
  porLocal: Map<LocalId, number>;
  /** Soma nos parceiros. */
  parceiros: number;
  total: number;
}

/** Saldo por produto e local: Map<produtoId, Map<local, qtd>> */
export function calcularSaldos(movs: MovEstoque[]): Map<ID, Map<LocalId, number>> {
  const out = new Map<ID, Map<LocalId, number>>();
  const add = (produtoId: ID, local: LocalId, q: number) => {
    let m = out.get(produtoId);
    if (!m) out.set(produtoId, (m = new Map()));
    m.set(local, (m.get(local) || 0) + q);
  };
  for (const mv of movs) {
    if (mv.destino) add(mv.produtoId, mv.destino, mv.quantidade);
    if (mv.origem) add(mv.produtoId, mv.origem, -mv.quantidade);
  }
  return out;
}

export function resumoSaldos(porLocal: Map<LocalId, number> | undefined): SaldosProduto {
  const m = porLocal ?? new Map<LocalId, number>();
  let parceiros = 0;
  for (const [local, q] of m) if (local !== CASA) parceiros += q;
  const casa = m.get(CASA) || 0;
  return { casa, porLocal: m, parceiros, total: casa + parceiros };
}

/** Saldo de um produto num local. */
export function saldoNoLocal(movs: MovEstoque[], produtoId: ID, local: LocalId): number {
  let s = 0;
  for (const mv of movs) {
    if (mv.produtoId !== produtoId) continue;
    if (mv.destino === local) s += mv.quantidade;
    if (mv.origem === local) s -= mv.quantidade;
  }
  return s;
}

/** Saldo de materiais: Map<materialId, gramas ou unidades>. */
export function calcularSaldosMateriais(movs: MovMaterial[]): Map<ID, number> {
  const out = new Map<ID, number>();
  for (const mv of movs) out.set(mv.materialId, (out.get(mv.materialId) || 0) + mv.quantidade);
  return out;
}

/** IDs de movimentos já estornados. */
export function idsEstornados(movs: { id: ID; estornoDe?: ID }[]): Set<ID> {
  const s = new Set<ID>();
  for (const m of movs) if (m.estornoDe) s.add(m.estornoDe);
  return s;
}
