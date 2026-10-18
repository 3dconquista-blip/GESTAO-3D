// "Venda rápida" (seção 10): sai do estoque de Casa e grava receita, taxa, custo do momento e lucro.
// Saída maior que o saldo é permitida com aviso (7.2): o saldo fica negativo em vermelho até o próximo ajuste.
// A venda gera um pagamento recebido (origem 'venda'). "Cancelar uma venda gera estorno."
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa } from '../data/selectors.ts';
import type { CanalVenda, Cents, FormaPagamento, ID, ISODate, Venda, VendaItem } from '../data/types.ts';
import { CASA } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { pctOfCents, round4, roundTo, toCents } from '../lib/money.ts';
import { idsEstornados } from '../domain/stock.ts';
import { ErroNegocio, estornarMov, lancarMov } from './estoque.ts';

const FORMAS: FormaPagamento[] = ['pix', 'dinheiro', 'cartao'];
const CANAIS: CanalVenda[] = ['presencial', 'whatsapp', 'instagram', 'feira'];

export interface ItemVendaEntrada {
  produtoId: ID;
  /** Inteiro, 0 ou mais (itens com 0 são ignorados ao registrar). */
  quantidade: number;
  /** Preço unitário cobrado (padrão = etiqueta), em centavos. */
  precoUnitCentavos: Cents;
}

export interface DescontoVenda {
  tipo: 'reais' | 'pct';
  /** tipo 'reais': valor em CENTAVOS (R$ 2,00 = 200). tipo 'pct': percentual de 0 a 100. */
  valor: number;
}

export interface EntradaVenda {
  itens: ItemVendaEntrada[];
  desconto?: DescontoVenda | null;
  forma: FormaPagamento;
}

export interface FaltaVenda {
  produtoId: ID;
  /** Saldo atual em Casa (pode ser negativo). */
  saldoCasa: number;
  /** Unidades vendidas sem estoque em Casa: "faltam N unidades". */
  falta: number;
}

export interface CalculoVenda {
  /** Itens com o custo unitário do momento (reais, 4 casas). */
  itens: VendaItem[];
  subtotalCentavos: Cents;
  descontoCentavos: Cents;
  totalCentavos: Cents;
  /** Taxa do cartão sobre o total (0 em PIX e dinheiro). */
  taxaCentavos: Cents;
  /** Imposto sobre o que você recebe (total − taxa). */
  impostoCentavos: Cents;
  /** Σ quantidade × custo (reais, 4 casas). */
  custoTotal: number;
  /** total − taxa − imposto − custo. */
  lucroCentavos: Cents;
  /** Produtos vendidos acima do saldo em Casa (aviso; a venda é permitida). */
  faltas: FaltaVenda[];
}

export interface DadosVenda extends EntradaVenda {
  canal: CanalVenda;
  /** Opcional: null ou ausente = "Cliente avulso". */
  clienteId?: ID | null;
  data?: ISODate;
}

function dataOuHoje(data?: ISODate | null): ISODate {
  if (data == null || data === '') return hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroNegocio('Data inválida.');
  return data;
}

function calcularDesconto(subtotal: Cents, desconto: DescontoVenda | null | undefined): Cents {
  if (!desconto || !desconto.valor) return 0;
  if (!Number.isFinite(desconto.valor) || desconto.valor < 0) throw new ErroNegocio('O desconto não pode ser negativo.');
  const d = desconto.tipo === 'pct' ? pctOfCents(subtotal, desconto.valor) : roundTo(desconto.valor, 0);
  return Math.min(d, subtotal);
}

/**
 * Calcula a venda com a configuração e os custos atuais (não grava): subtotal, desconto (% com metade para cima,
 * nunca acima do subtotal), total, taxa do cartão, imposto, custo, lucro e faltas em Casa.
 */
export function calcularVenda(entrada: EntradaVenda): CalculoVenda {
  if (!FORMAS.includes(entrada.forma)) throw new ErroNegocio('Escolha a forma de pagamento.');
  const custos = db.config.custos;
  const itens: VendaItem[] = [];
  const qtdPorProduto = new Map<ID, number>();
  let subtotal = 0;
  let custoTotal = 0;
  for (const it of entrada.itens) {
    const produto = db.get('produtos', it.produtoId);
    if (!produto) throw new ErroNegocio('Produto não encontrado.');
    if (!Number.isInteger(it.quantidade) || it.quantidade < 0) {
      throw new ErroNegocio(`A quantidade de "${produto.nome}" precisa ser um número inteiro.`);
    }
    if (!Number.isInteger(it.precoUnitCentavos) || it.precoUnitCentavos < 0) {
      throw new ErroNegocio(`O preço de "${produto.nome}" não pode ser negativo.`);
    }
    const custoUnit = custoProduto(produto.id);
    itens.push({ produtoId: produto.id, quantidade: it.quantidade, precoUnitCentavos: it.precoUnitCentavos, custoUnit });
    subtotal += it.quantidade * it.precoUnitCentavos;
    custoTotal += it.quantidade * custoUnit;
    qtdPorProduto.set(produto.id, (qtdPorProduto.get(produto.id) || 0) + it.quantidade);
  }
  const desconto = calcularDesconto(subtotal, entrada.desconto);
  const total = subtotal - desconto;
  const taxa = entrada.forma === 'cartao' ? pctOfCents(total, custos.taxaCartaoPct) : 0;
  const imposto = pctOfCents(total - taxa, custos.impostoPct);
  const custo = round4(custoTotal);
  const faltas: FaltaVenda[] = [];
  for (const [produtoId, qtd] of qtdPorProduto) {
    const saldo = saldoCasa(produtoId);
    const falta = qtd - Math.max(0, saldo);
    if (qtd > 0 && falta > 0) faltas.push({ produtoId, saldoCasa: saldo, falta });
  }
  return {
    itens,
    subtotalCentavos: subtotal,
    descontoCentavos: desconto,
    totalCentavos: total,
    taxaCentavos: taxa,
    impostoCentavos: imposto,
    custoTotal: custo,
    lucroCentavos: total - taxa - imposto - toCents(custo),
    faltas,
  };
}

/**
 * Registra a venda rápida numa transação: grava a venda (fotografia de preço, custo, taxa e lucro),
 * tira os itens de Casa (permite saldo negativo) e lança o pagamento recebido.
 */
export function registrarVenda(dados: DadosVenda): Venda {
  if (!CANAIS.includes(dados.canal)) throw new ErroNegocio('Escolha o canal da venda.');
  const itensValidos = dados.itens.filter((i) => i.quantidade !== 0);
  if (itensValidos.length === 0) throw new ErroNegocio('Adicione pelo menos um produto.');
  const calc = calcularVenda({ itens: itensValidos, desconto: dados.desconto, forma: dados.forma });
  return db.tx((t) => {
    const clienteId = dados.clienteId || null;
    if (clienteId && !t.get('clientes', clienteId)) throw new ErroNegocio('Cliente não encontrado.');
    const data = dataOuHoje(dados.data);
    const venda = t.insert('vendas', {
      data,
      canal: dados.canal,
      formaPagamento: dados.forma,
      clienteId,
      itens: calc.itens,
      subtotalCentavos: calc.subtotalCentavos,
      descontoCentavos: calc.descontoCentavos,
      totalCentavos: calc.totalCentavos,
      taxaCentavos: calc.taxaCentavos,
      custoTotal: calc.custoTotal,
      lucroCentavos: calc.lucroCentavos,
    });
    for (const it of calc.itens) {
      lancarMov(
        t,
        {
          data,
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          origem: CASA,
          destino: null,
          tipo: 'venda_direta',
          refTipo: 'venda',
          refId: venda.id,
          custoUnit: it.custoUnit,
          precoUnitCentavos: it.precoUnitCentavos,
        },
        { permitirNegativo: true },
      );
    }
    if (calc.totalCentavos > 0) {
      t.insert('pagamentos', {
        origem: 'venda',
        refId: venda.id,
        clienteId,
        direcao: 'recebido',
        valorCentavos: calc.totalCentavos,
        forma: dados.forma,
        data,
        taxaCentavos: calc.taxaCentavos,
        tipo: 'venda',
      });
    }
    return venda;
  });
}

/**
 * Cancela uma venda (estorno): devolve os itens para Casa, lança a devolução do pagamento
 * (direção 'pago', tipo 'devolucao') e marca a venda como cancelada. Não cancela duas vezes.
 */
export function cancelarVenda(vendaId: ID, motivo: string, data?: ISODate): Venda {
  return db.tx((t) => {
    const venda = t.get('vendas', vendaId);
    if (!venda) throw new ErroNegocio('Venda não encontrada.');
    if (venda.cancelada) throw new ErroNegocio('Esta venda já foi cancelada.');
    const m = (motivo ?? '').trim();
    if (!m) throw new ErroNegocio('Informe o motivo do cancelamento.');
    const dataCanc = dataOuHoje(data);

    const movs = t.all('movEstoque');
    const movsEst = idsEstornados(movs);
    for (const mv of movs) {
      if (mv.refTipo !== 'venda' || mv.refId !== vendaId || mv.tipo === 'estorno' || movsEst.has(mv.id)) continue;
      estornarMov(t, mv.id, m, { data: dataCanc, permitirNegativo: true });
    }

    const pags = t.all('pagamentos');
    const pagsEst = idsEstornados(pags);
    for (const p of pags) {
      if (p.origem !== 'venda' || p.refId !== vendaId || p.estornoDe || pagsEst.has(p.id)) continue;
      t.insert('pagamentos', {
        origem: 'venda',
        refId: vendaId,
        clienteId: p.clienteId ?? null,
        direcao: p.direcao === 'recebido' ? 'pago' : 'recebido',
        valorCentavos: p.valorCentavos,
        forma: p.forma,
        data: dataCanc,
        taxaCentavos: p.taxaCentavos,
        tipo: 'devolucao',
        observacao: m,
        estornoDe: p.id,
      });
    }

    return t.update('vendas', vendaId, { cancelada: true, canceladaEm: dataCanc, motivoCancelamento: m });
  });
}
