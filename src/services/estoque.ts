// Primitivas de movimentação de estoque (usadas por produção, vendas, parceiros e pedidos).
// Regra: o saldo é sempre a soma das movimentações; nunca edite saldo direto.
// Sempre chame dentro de db.tx((t) => ...), passando o `t`.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { custoProduto } from '../data/selectors.ts';
import type { Cents, ID, ISODate, LocalId, MovEstoque, TipoMovEstoque } from '../data/types.ts';
import { round4 } from '../lib/money.ts';
import { hojeISO } from '../lib/dates.ts';
import { idsEstornados } from '../domain/stock.ts';

export class ErroNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroNegocio';
  }
}

/** Saldo de um produto num local, incluindo o que já foi lançado nesta transação. */
export function saldoTx(t: Tx, produtoId: ID, local: LocalId): number {
  let s = 0;
  for (const mv of t.all('movEstoque')) {
    if (mv.produtoId !== produtoId) continue;
    if (mv.destino === local) s += mv.quantidade;
    if (mv.origem === local) s -= mv.quantidade;
  }
  return s;
}

export interface NovoMov {
  data?: ISODate;
  produtoId: ID;
  quantidade: number;
  origem: LocalId | null;
  destino: LocalId | null;
  tipo: TipoMovEstoque;
  motivo?: string;
  refTipo?: MovEstoque['refTipo'];
  refId?: ID;
  /** Padrão: custo unitário atual do produto. */
  custoUnit?: number;
  precoUnitCentavos?: Cents;
  estornoDe?: ID;
  exemplo?: boolean;
}

/**
 * Lança uma movimentação. Bloqueia saída maior que o saldo da origem, a menos que
 * `permitirNegativo` (venda rápida e pedidos permitem, com aviso na interface).
 */
export function lancarMov(t: Tx, mov: NovoMov, opts?: { permitirNegativo?: boolean }): MovEstoque {
  if (!(mov.quantidade > 0) || !Number.isInteger(mov.quantidade)) {
    throw new ErroNegocio('A quantidade precisa ser um número inteiro maior que zero.');
  }
  if (!mov.origem && !mov.destino) throw new ErroNegocio('Movimentação sem origem nem destino.');
  if (mov.origem === mov.destino) throw new ErroNegocio('Origem e destino iguais.');
  const produto = t.get('produtos', mov.produtoId);
  if (!produto) throw new ErroNegocio('Produto não encontrado.');
  if ((mov.tipo === 'ajuste' || mov.tipo === 'perda') && !mov.motivo) {
    throw new ErroNegocio('Informe o motivo do ajuste ou da perda.');
  }
  if (mov.origem && !opts?.permitirNegativo) {
    const saldo = saldoTx(t, mov.produtoId, mov.origem);
    if (mov.quantidade > saldo) {
      throw new ErroNegocio(`Saldo insuficiente de "${produto.nome}": há ${saldo} e a saída é de ${mov.quantidade}.`);
    }
  }
  return t.insert('movEstoque', {
    data: mov.data ?? hojeISO(),
    produtoId: mov.produtoId,
    quantidade: mov.quantidade,
    origem: mov.origem,
    destino: mov.destino,
    tipo: mov.tipo,
    motivo: mov.motivo,
    refTipo: mov.refTipo,
    refId: mov.refId,
    custoUnit: round4(mov.custoUnit ?? custoProduto(mov.produtoId)),
    precoUnitCentavos: mov.precoUnitCentavos,
    estornoDe: mov.estornoDe,
    ...(mov.exemplo ? { exemplo: true } : {}),
  });
}

/**
 * Estorna uma movimentação: lança o movimento inverso (destino -> origem) com tipo 'estorno'.
 * Não estorna duas vezes. O estorno pode deixar saldo negativo só se `permitirNegativo`.
 */
export function estornarMov(t: Tx, movId: ID, motivo: string, opts?: { permitirNegativo?: boolean; data?: ISODate }): MovEstoque {
  const orig = t.get('movEstoque', movId);
  if (!orig) throw new ErroNegocio('Movimentação não encontrada.');
  if (orig.tipo === 'estorno') throw new ErroNegocio('Não é possível estornar um estorno.');
  if (idsEstornados(t.all('movEstoque')).has(movId)) throw new ErroNegocio('Esta movimentação já foi estornada.');
  return lancarMov(
    t,
    {
      data: opts?.data,
      produtoId: orig.produtoId,
      quantidade: orig.quantidade,
      origem: orig.destino,
      destino: orig.origem,
      tipo: 'estorno',
      motivo,
      refTipo: orig.refTipo,
      refId: orig.refId,
      custoUnit: orig.custoUnit,
      precoUnitCentavos: orig.precoUnitCentavos,
      estornoDe: orig.id,
      exemplo: orig.exemplo,
    },
    { permitirNegativo: opts?.permitirNegativo ?? true },
  );
}

/** Movimentações (não estornadas) ligadas a uma referência. */
export function movsDaReferencia(refId: ID): MovEstoque[] {
  const est = idsEstornados(db.all('movEstoque'));
  return db.all('movEstoque').filter((m) => m.refId === refId && m.tipo !== 'estorno' && !est.has(m.id));
}
