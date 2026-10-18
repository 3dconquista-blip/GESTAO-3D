// Regras puras de materiais e insumos (seção 7.3): custo médio, compra, pesagem do carretel e status.
// Unidades: filamento tem saldo em gramas e custo em R$/kg; insumo tem saldo e custo por unidade.
// O custo médio é uma média ponderada, então só precisa de unidades coerentes entre saldo e quantidade
// (gramas com gramas, kg com kg); o custo sai na mesma unidade do custo atual e do custo da compra.
import type { Cents } from '../lib/money.ts';
import { roundTo, shift, toReais } from '../lib/money.ts';
import type { Material } from '../data/types.ts';

/**
 * Novo custo médio após uma compra (7.3):
 * (saldo × custo_atual + qtd × custo_compra) ÷ (saldo + qtd). Se o saldo for zero ou negativo, vale o custo da compra.
 * Sem arredondar (grave com round4).
 */
export function novoCustoMedio(saldoAtual: number, custoAtual: number, qtdComprada: number, custoCompra: number): number {
  if (!(saldoAtual > 0) || !(qtdComprada > 0)) return custoCompra;
  return (saldoAtual * (custoAtual || 0) + qtdComprada * custoCompra) / (saldoAtual + qtdComprada);
}

/** Unidade em que a compra é digitada: 'kg' para filamento, a unidade do insumo para os demais. */
export function unidadeCompra(material: Pick<Material, 'tipo' | 'unidade'>): string {
  return material.tipo === 'filamento' ? 'kg' : material.unidade || 'un';
}

/** Quantidade comprada convertida para a unidade do saldo: filamento kg → gramas (× 1000); insumo fica igual. */
export function qtdCompraNoSaldo(material: Pick<Material, 'tipo'>, quantidade: number): number {
  return material.tipo === 'filamento' ? shift(quantidade, 3) : quantidade;
}

/**
 * Custo da compra por unidade de custo: R$/kg para filamento (quantidade em kg) ou R$/unidade para insumo.
 * Retorna NaN se a quantidade não for maior que zero (a tela mostra "—").
 */
export function custoDaCompra(material: Pick<Material, 'tipo'>, quantidade: number, valorTotalCentavos: Cents): number {
  if (!(quantidade > 0)) return Number.NaN;
  return toReais(valorTotalCentavos || 0) / quantidade;
}

export interface ResumoCompra {
  /** Quantidade que entra no saldo (gramas ou unidades). */
  qtdNoSaldo: number;
  /** R$/kg ou R$/un pagos nesta compra (sem arredondar). */
  custoCompra: number;
  custoAtual: number;
  /** Custo médio depois da compra (sem arredondar). */
  custoNovo: number;
  saldoAntes: number;
  saldoDepois: number;
}

/** Resumo de uma "Compra de material" (para a confirmação e para gravar). Quantidade em kg (filamento) ou unidades. */
export function resumoCompra(
  material: Pick<Material, 'tipo' | 'custoMedio'>,
  saldoAntes: number,
  quantidade: number,
  valorTotalCentavos: Cents,
): ResumoCompra {
  const qtdNoSaldo = qtdCompraNoSaldo(material, quantidade);
  const custoCompra = custoDaCompra(material, quantidade, valorTotalCentavos);
  const custoAtual = material.custoMedio || 0;
  return {
    qtdNoSaldo,
    custoCompra,
    custoAtual,
    custoNovo: novoCustoMedio(saldoAntes, custoAtual, qtdNoSaldo, custoCompra),
    saldoAntes,
    saldoDepois: roundTo(saldoAntes + qtdNoSaldo, 4),
  };
}

/**
 * Custo médio ao desfazer uma compra pelo custo dela (devolução):
 * (saldo × custo_atual − qtd × custo_compra) ÷ (saldo − qtd). null quando não dá para calcular
 * (sobra zero ou negativa, ou resultado negativo) — aí quem chama decide o custo.
 */
export function custoMedioSemCompra(saldoAtual: number, custoAtual: number, qtdCompra: number, custoCompra: number): number | null {
  const resto = saldoAtual - qtdCompra;
  if (!(resto > 0)) return null;
  const v = (saldoAtual * (custoAtual || 0) - qtdCompra * custoCompra) / resto;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** "Pesei o carretel": peso na balança − peso do carretel vazio = gramas restantes (nunca menor que zero). */
export function gramasRestantes(pesoBalancaG: number, taraCarretelG: number | undefined): number {
  return Math.max(0, roundTo((pesoBalancaG || 0) - (taraCarretelG || 0), 2));
}

export type StatusMaterial = 'ok' | 'baixo' | 'negativo';

/** Status do saldo: 'negativo' (vermelho, com a dica "Pese o carretel"), 'baixo' (abaixo do mínimo) ou 'ok'. */
export function statusMaterial(saldo: number, minimo: number): StatusMaterial {
  if (saldo < 0) return 'negativo';
  if (saldo < (minimo || 0)) return 'baixo';
  return 'ok';
}
