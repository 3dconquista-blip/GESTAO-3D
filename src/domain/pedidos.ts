// Pedidos personalizados (seções 9.2 e 9.3): custo dos itens, orçamento, lucro,
// situação financeira, alertas, reservas de catálogo e números do cliente (9.1).
// Funções puras: recebem os dados por parâmetro.
// Custos em reais com precisão total durante a conta; round4() só ao guardar;
// centavos só no resultado final (toCents / arredondarPreco).
import type { Cents, ModoArredondamento } from '../lib/money.ts';
import { arredondarPreco, pctOfCents, round4, roundTo, toCents, toReais } from '../lib/money.ts';
import type { ISODate } from '../lib/dates.ts';
import { diffDias } from '../lib/dates.ts';
import { formatData } from '../lib/format.ts';
import type { Config, EtapaPedido, ID, Pagamento, Pedido, PedidoItem, Produto, Venda } from '../data/types.ts';
import type { ComposicaoCusto, ContextoCusto, FichaTecnica } from './pricing.ts';
import { composicaoCusto } from './pricing.ts';
import { idsEstornados } from './stock.ts';

// ---------------------------------------------------------------- Etapas

/** Fluxo normal do Kanban (sem 'cancelado'), na ordem. */
export const ETAPAS_FLUXO: EtapaPedido[] = ['orcamento', 'aprovado', 'producao', 'pronto', 'entregue'];

/** Todas as etapas, na ordem das colunas do Kanban. */
export const ETAPAS: EtapaPedido[] = [...ETAPAS_FLUXO, 'cancelado'];

/** Etapas em que o pedido não muda mais. */
export function etapaFinal(etapa: EtapaPedido): boolean {
  return etapa === 'entregue' || etapa === 'cancelado';
}

/** Próxima etapa do botão "Avançar" (null em Entregue e Cancelado). */
export function proximaEtapa(etapa: EtapaPedido): EtapaPedido | null {
  const i = ETAPAS_FLUXO.indexOf(etapa);
  return i >= 0 && i < ETAPAS_FLUXO.length - 1 ? ETAPAS_FLUXO[i + 1] : null;
}

/** O pedido pode ir de `de` para `para`? Só para frente, ou cancelar de qualquer etapa não final. */
export function podeMover(de: EtapaPedido, para: EtapaPedido): boolean {
  if (etapaFinal(de) || de === para) return false;
  if (para === 'cancelado') return true;
  return ETAPAS_FLUXO.indexOf(para) > ETAPAS_FLUXO.indexOf(de);
}

/** Rótulos do checklist da etapa "Em produção". */
export const ROTULO_CHECKLIST: Record<keyof Pedido['checklist'], string> = {
  modeloAprovado: 'Modelo aprovado pelo cliente',
  impresso: 'Impresso',
  acabamento: 'Acabamento',
};

/** Número do pedido para exibir: 1 -> '#0001'. */
export function numeroPedido(numero: number): string {
  return `#${String(numero).padStart(4, '0')}`;
}

// ---------------------------------------------------------------- Custo dos itens

/** O que custoItem precisa de um item (pedido salvo ou em edição). */
export type ItemParaCusto = Pick<PedidoItem, 'tipo' | 'quantidade' | 'mesas' | 'componentes' | 'maoDeObraMin'>;

export interface CustoItem {
  /** Custo por peça (reais, 4 casas). */
  custoUnit: number;
  /** Custo por peça × quantidade, calculado com precisão total e arredondado a 4 casas. */
  custoTotal: number;
  /** Custo por peça × quantidade sem arredondar (use no orçamento antes de gravar). */
  custoTotalExato: number;
  /** Composição do item inteiro (por peça × quantidade), sem arredondar. */
  composicao: ComposicaoCusto;
  avisos: string[];
}

/**
 * Custo de um item do pedido. 'catalogo' usa a ficha técnica do produto; 'personalizada' usa
 * as próprias mesas, componentes e mão de obra por peça. O total é por peça × quantidade em
 * precisão total, arredondado a 4 casas só no fim (Exemplo D: 1,94183… × 20 = 38,8367).
 */
export function custoItem(item: ItemParaCusto, ctx: ContextoCusto, produto?: Produto): CustoItem {
  const avisos: string[] = [];
  let ficha: FichaTecnica;
  if (item.tipo === 'catalogo') {
    if (!produto) avisos.push('Produto do catálogo não encontrado.');
    ficha = produto ?? { mesas: [], componentes: [], maoDeObraMin: 0 };
  } else {
    ficha = { mesas: item.mesas ?? [], componentes: item.componentes ?? [], maoDeObraMin: item.maoDeObraMin ?? 0 };
  }
  const porPeca = composicaoCusto(ficha, ctx);
  const q = item.quantidade > 0 ? item.quantidade : 0;
  const composicao: ComposicaoCusto = {
    material: porPeca.material * q,
    energia: porPeca.energia * q,
    maquina: porPeca.maquina * q,
    falhas: porPeca.falhas * q,
    impressao: porPeca.impressao * q,
    componentes: porPeca.componentes * q,
    maoDeObra: porPeca.maoDeObra * q,
    total: porPeca.total * q,
    avisos: porPeca.avisos,
  };
  return {
    custoUnit: round4(porPeca.total),
    custoTotal: round4(porPeca.total * q),
    custoTotalExato: porPeca.total * q,
    composicao,
    avisos: Array.from(new Set([...avisos, ...porPeca.avisos])),
  };
}

// ---------------------------------------------------------------- Orçamento

export interface EntradaOrcamento {
  /** Custo total de cada item (reais). Use a precisão total quando tiver. */
  custosItens: number[];
  horasModelagem: number;
  valorHoraModelagem: number;
  margemPct: number;
  urgente: boolean;
  urgenciaPct: number;
  descontoPct: number;
  pedidoMinimoCentavos: Cents;
  freteCentavos: Cents;
  sinalPct: number;
  arredondamento: ModoArredondamento;
}

export interface Orcamento {
  /** Soma do custo dos itens (reais, 4 casas). */
  custoProducao: number;
  /** custo ÷ (1 − margem) (reais, 4 casas). */
  precoProducao: number;
  /** horas × valor hora de modelagem, sem margem (reais, 4 casas). */
  modelagem: number;
  /** preço de produção + modelagem (reais, 4 casas). */
  subtotal: number;
  /** subtotal × (1 + urgência% − desconto%) (reais, 4 casas). */
  subtotalAjustado: number;
  /** O pedido mínimo foi maior que o subtotal ajustado. */
  pedidoMinimoAplicado: boolean;
  /** arredondar(máximo(pedido mínimo, subtotal ajustado)) (centavos). */
  totalSemFreteCentavos: Cents;
  /** Total sem frete + frete (centavos). */
  totalCentavos: Cents;
  /** total × sinal%, arredondado ao centavo. */
  sinalCentavos: Cents;
  /** Parâmetros impossíveis (margem ≥ 100%). Os valores vêm zerados. */
  erro?: string;
}

/**
 * Orçamento do pedido (seção 9.2):
 * preço_produção = custo ÷ (1 − margem); modelagem sem margem;
 * total = arredondar(máximo(pedido_mínimo, subtotal × (1 + urgência% − desconto%))) + frete;
 * sinal = total × sinal%.
 */
export function calcularOrcamento(e: EntradaOrcamento): Orcamento {
  const custo = e.custosItens.reduce((s, c) => s + (c || 0), 0);
  const den = 1 - (e.margemPct || 0) / 100;
  if (den <= 0) {
    return {
      custoProducao: round4(custo),
      precoProducao: 0,
      modelagem: 0,
      subtotal: 0,
      subtotalAjustado: 0,
      pedidoMinimoAplicado: false,
      totalSemFreteCentavos: 0,
      totalCentavos: 0,
      sinalCentavos: 0,
      erro: 'A margem desejada chega a 100% ou mais. Assim nenhum preço cobre o custo. Reduza a margem.',
    };
  }
  const preco = custo / den;
  const modelagem = Math.max(0, e.horasModelagem || 0) * (e.valorHoraModelagem || 0);
  const subtotal = preco + modelagem;
  const fator = Math.max(0, 1 + (e.urgente ? e.urgenciaPct || 0 : 0) / 100 - (e.descontoPct || 0) / 100);
  const ajustado = subtotal * fator;
  const minimo = toReais(e.pedidoMinimoCentavos || 0);
  const pedidoMinimoAplicado = minimo > ajustado;
  const totalSemFreteCentavos = arredondarPreco(Math.max(minimo, ajustado), e.arredondamento);
  const totalCentavos = totalSemFreteCentavos + (e.freteCentavos || 0);
  return {
    custoProducao: round4(custo),
    precoProducao: round4(preco),
    modelagem: round4(modelagem),
    subtotal: round4(subtotal),
    subtotalAjustado: round4(ajustado),
    pedidoMinimoAplicado,
    totalSemFreteCentavos,
    totalCentavos,
    sinalCentavos: pctOfCents(totalCentavos, e.sinalPct || 0),
  };
}

/** Entrada do orçamento a partir de um pedido gravado (parâmetros fotografados no pedido). */
export function entradaOrcamentoDoPedido(
  p: Pedido,
  custosItens: number[] = p.itens.map((i) => i.custoExato ?? i.custoTotal),
): EntradaOrcamento {
  return {
    custosItens,
    horasModelagem: p.horasModelagem,
    valorHoraModelagem: p.valorHoraModelagem,
    margemPct: p.margemPct,
    urgente: p.urgente,
    urgenciaPct: p.urgenciaPct,
    descontoPct: p.descontoPct,
    pedidoMinimoCentavos: p.pedidoMinimoCentavos,
    freteCentavos: p.entrega.freteCentavos,
    sinalPct: p.sinalPct,
    arredondamento: p.arredondamento,
  };
}

/** Composição do orçamento de um pedido gravado (para a tela de detalhe). */
export function orcamentoDoPedido(p: Pedido): Orcamento {
  return calcularOrcamento(entradaOrcamentoDoPedido(p));
}

/** Desconto por quantidade sugerido (10% a partir de 10 unidades, por padrão). O dono decide se aplica. */
export function descontoQtdSugerido(quantidadeTotal: number, cfg: Config['pedidos']): number {
  return quantidadeTotal >= cfg.descontoQtdAPartir && cfg.descontoQtdPct > 0 ? cfg.descontoQtdPct : 0;
}

/** Soma das quantidades dos itens (para o desconto por quantidade). */
export function quantidadeTotalItens(itens: { quantidade: number }[]): number {
  return itens.reduce((s, i) => s + (i.quantidade || 0), 0);
}

// ---------------------------------------------------------------- Lucro

export interface EntradaLucro {
  totalCentavos: Cents;
  freteCentavos: Cents;
  taxasCartaoCentavos: Cents;
  /** Reais. */
  custoProducao: number;
  /** Reais. */
  modelagem: number;
}

export interface LucroPedido {
  lucroCentavos: Cents;
  /** lucro ÷ (total − frete) × 100 (NaN se não houver receita). */
  margemPct: number;
}

/**
 * lucro_pedido = (total − frete) − taxas de cartão − custo_produção − modelagem.
 * Margem sobre o que o pedido rende sem o frete (frete é repasse). Exemplo D: R$ 39,06 (33,1%).
 */
export function lucroPedido(e: EntradaLucro): LucroPedido {
  const receita = toReais((e.totalCentavos || 0) - (e.freteCentavos || 0));
  const lucro = receita - toReais(e.taxasCartaoCentavos || 0) - (e.custoProducao || 0) - (e.modelagem || 0);
  return { lucroCentavos: toCents(lucro), margemPct: receita > 0 ? (lucro / receita) * 100 : Number.NaN };
}

/** Lucro e margem de um pedido gravado, com as taxas de cartão dos pagamentos. `totalCentavos` simula outro valor final. */
export function resultadoPedido(p: Pedido, pagamentos: Pagamento[], totalCentavos: Cents = p.totalCentavos): LucroPedido {
  return lucroPedido({
    totalCentavos,
    freteCentavos: p.entrega.freteCentavos,
    taxasCartaoCentavos: situacaoFinanceira(p, pagamentos).taxasCartaoCentavos,
    custoProducao: p.custoProducao,
    modelagem: p.modelagemValor,
  });
}

// ---------------------------------------------------------------- Pagamentos

/** Pagamentos válidos do pedido: sem os estornados e sem os próprios estornos. */
export function pagamentosDoPedido(pedidoId: ID, pagamentos: Pagamento[]): Pagamento[] {
  const doPedido = pagamentos.filter((pg) => pg.origem === 'pedido' && pg.refId === pedidoId);
  const estornados = idsEstornados(doPedido);
  return doPedido.filter((pg) => !pg.estornoDe && !estornados.has(pg.id));
}

export interface SituacaoFinanceira {
  /** Soma dos recebimentos. */
  recebidoCentavos: Cents;
  /** Soma das devoluções ao cliente. */
  devolvidoCentavos: Cents;
  /** recebido − devolvido. */
  pagoCentavos: Cents;
  /** Quanto falta o cliente pagar: máximo(0, total − pago). Zero em pedido cancelado. */
  saldoCentavos: Cents;
  /** Saldo de pedido entregue ("A receber"); zero nas outras etapas. */
  aReceberCentavos: Cents;
  /** Pago acima do total (crédito do cliente). Zero em pedido cancelado. */
  creditoCentavos: Cents;
  /** Taxas de cartão dos recebimentos (reduzem o lucro). */
  taxasCartaoCentavos: Cents;
}

/** Quanto foi pago, quanto falta, crédito do cliente e taxas de cartão de um pedido. */
export function situacaoFinanceira(
  pedido: Pick<Pedido, 'id' | 'etapa' | 'totalCentavos'>,
  pagamentos: Pagamento[],
): SituacaoFinanceira {
  let recebido = 0;
  let devolvido = 0;
  let taxas = 0;
  for (const pg of pagamentosDoPedido(pedido.id, pagamentos)) {
    if (pg.direcao === 'recebido') {
      recebido += pg.valorCentavos;
      taxas += pg.taxaCentavos || 0;
    } else {
      devolvido += pg.valorCentavos;
    }
  }
  const pago = recebido - devolvido;
  const cancelado = pedido.etapa === 'cancelado';
  const saldo = cancelado ? 0 : Math.max(0, pedido.totalCentavos - pago);
  return {
    recebidoCentavos: recebido,
    devolvidoCentavos: devolvido,
    pagoCentavos: pago,
    saldoCentavos: saldo,
    aReceberCentavos: pedido.etapa === 'entregue' ? saldo : 0,
    creditoCentavos: cancelado ? 0 : Math.max(0, pago - pedido.totalCentavos),
    taxasCartaoCentavos: taxas,
  };
}

// ---------------------------------------------------------------- Alertas

export interface AlertaPedido {
  tipo: 'atrasado' | 'prazo' | 'sem_sinal' | 'nao_retirado' | 'validade';
  /** 'ruim' = vermelho, 'atencao' = amarelo (tons do kit de interface). */
  tom: 'atencao' | 'ruim';
  texto: string;
}

function dias(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`;
}

/**
 * Alertas da seção 9.3: prazo em 2 dias ou menos (amarelo) e atrasado (vermelho) em Aprovado e
 * Em produção; "Aprovado sem sinal há 3 dias"; "Pronto e não retirado há mais de 5 dias";
 * orçamento com validade vencida sem resposta.
 */
export function alertasPedido(pedido: Pedido, pagamentos: Pagamento[], hoje: ISODate): AlertaPedido[] {
  const out: AlertaPedido[] = [];
  const e = pedido.etapa;
  if ((e === 'aprovado' || e === 'producao') && pedido.prazo) {
    const faltam = diffDias(hoje, pedido.prazo);
    if (faltam < 0) out.push({ tipo: 'atrasado', tom: 'ruim', texto: `Atrasado há ${dias(-faltam)}` });
    else if (faltam === 0) out.push({ tipo: 'prazo', tom: 'atencao', texto: 'Prazo vence hoje' });
    else if (faltam <= 2) out.push({ tipo: 'prazo', tom: 'atencao', texto: `Prazo em ${dias(faltam)}` });
  }
  if (e === 'aprovado' && pedido.aprovadoEm) {
    const desde = diffDias(pedido.aprovadoEm, hoje);
    if (desde >= 3 && situacaoFinanceira(pedido, pagamentos).pagoCentavos <= 0) {
      out.push({ tipo: 'sem_sinal', tom: 'atencao', texto: `Aprovado sem sinal há ${dias(desde)}` });
    }
  }
  if (e === 'pronto' && pedido.prontoEm && diffDias(pedido.prontoEm, hoje) > 5) {
    out.push({ tipo: 'nao_retirado', tom: 'atencao', texto: 'Pronto e não retirado há mais de 5 dias' });
  }
  if (e === 'orcamento' && pedido.validade && hoje > pedido.validade) {
    out.push({ tipo: 'validade', tom: 'atencao', texto: `Orçamento vencido em ${formatData(pedido.validade)}, sem resposta` });
  }
  return out.sort((a, b) => (a.tom === b.tom ? 0 : a.tom === 'ruim' ? -1 : 1));
}

/** Alertas de todos os pedidos (para o Início), vermelhos primeiro. */
export function alertasPedidos(
  pedidos: Pedido[],
  pagamentos: Pagamento[],
  hoje: ISODate,
): { pedido: Pedido; alerta: AlertaPedido }[] {
  const out: { pedido: Pedido; alerta: AlertaPedido }[] = [];
  for (const p of pedidos) for (const alerta of alertasPedido(p, pagamentos, hoje)) out.push({ pedido: p, alerta });
  return out.sort((a, b) => (a.alerta.tom === b.alerta.tom ? 0 : a.alerta.tom === 'ruim' ? -1 : 1));
}

// ---------------------------------------------------------------- Kanban e produção

function porPrazo(a: Pedido, b: Pedido): number {
  const pa = a.prazo || '9999-99-99';
  const pb = b.prazo || '9999-99-99';
  return pa === pb ? a.numero - b.numero : pa < pb ? -1 : 1;
}

/** Pedidos agrupados por etapa (colunas do Kanban), cada grupo ordenado pelo prazo. */
export function pedidosPorEtapa(pedidos: Pedido[]): Record<EtapaPedido, Pedido[]> {
  const out = Object.fromEntries(ETAPAS.map((e) => [e, [] as Pedido[]])) as Record<EtapaPedido, Pedido[]>;
  for (const p of pedidos) out[p.etapa]?.push(p);
  for (const e of ETAPAS) out[e].sort(porPrazo);
  return out;
}

/** Pedidos em "Aprovado" ou "Em produção", ordenados pelo prazo (para "O que imprimir"). */
export function pedidosParaImprimir(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter((p) => p.etapa === 'aprovado' || p.etapa === 'producao').sort(porPrazo);
}

/**
 * Reserva de itens de catálogo em Casa: "Fica reservado em Casa na aprovação e sai na entrega".
 * Soma as quantidades de pedidos em Aprovado, Em produção e Pronto ainda não baixados.
 */
export function reservasCatalogo(pedidos: Pedido[]): Map<ID, number> {
  const out = new Map<ID, number>();
  for (const p of pedidos) {
    if (p.catalogoBaixado) continue;
    if (p.etapa !== 'aprovado' && p.etapa !== 'producao' && p.etapa !== 'pronto') continue;
    for (const item of p.itens) {
      if (item.tipo !== 'catalogo' || !item.produtoId) continue;
      out.set(item.produtoId, (out.get(item.produtoId) || 0) + item.quantidade);
    }
  }
  return out;
}

export interface FaltaCatalogo {
  produtoId: ID;
  descricao: string;
  quantidade: number;
  /** Saldo em Casa menos o reservado por outros pedidos. */
  disponivel: number;
  /** "faltam N unidades" (0 se tiver o suficiente). */
  faltam: number;
}

/**
 * Itens de catálogo do pedido e quanto falta em Casa, descontando o que outros pedidos já reservaram.
 * Usado para o aviso "faltam N unidades" e para mandar a diferença para "O que imprimir".
 */
export function faltasCatalogo(pedido: Pedido, todosPedidos: Pedido[], saldoCasa: (produtoId: ID) => number): FaltaCatalogo[] {
  const reservas = reservasCatalogo(todosPedidos.filter((p) => p.id !== pedido.id));
  const porProduto = new Map<ID, FaltaCatalogo>();
  for (const item of pedido.itens) {
    if (item.tipo !== 'catalogo' || !item.produtoId) continue;
    const atual = porProduto.get(item.produtoId);
    if (atual) atual.quantidade += item.quantidade;
    else {
      const disponivel = saldoCasa(item.produtoId) - (reservas.get(item.produtoId) || 0);
      porProduto.set(item.produtoId, { produtoId: item.produtoId, descricao: item.descricao, quantidade: item.quantidade, disponivel, faltam: 0 });
    }
  }
  const out = Array.from(porProduto.values());
  for (const f of out) f.faltam = Math.max(0, f.quantidade - Math.max(0, f.disponivel));
  return out;
}

// ---------------------------------------------------------------- Cliente (9.1)

export interface EstatisticasCliente {
  /** Pedidos do cliente (todas as etapas). */
  pedidos: number;
  /** Vendas não canceladas + pedidos entregues. */
  compras: number;
  /** Soma dessas compras (vendas pelo total pago; pedidos pelo total final, com frete). */
  totalGastoCentavos: Cents;
  /** Data da venda ou da entrega mais recente. */
  ultimaCompra: ISODate | null;
  /** total gasto ÷ compras, arredondado ao centavo. */
  ticketMedioCentavos: Cents;
  /** Pago acima do total nos pedidos não cancelados. */
  creditoCentavos: Cents;
  /** Saldo de pedidos entregues ainda não pago. */
  aReceberCentavos: Cents;
}

/**
 * Números da ficha do cliente. Compra = venda não cancelada ou pedido entregue (o pedido conta na
 * data de entrega). Crédito = soma do que cada pedido não cancelado recebeu acima do total.
 */
export function estatisticasDoCliente(
  clienteId: ID,
  pedidos: Pedido[],
  vendas: Venda[],
  pagamentos: Pagamento[],
): EstatisticasCliente {
  const seus = pedidos.filter((p) => p.clienteId === clienteId);
  let compras = 0;
  let total = 0;
  let ultima: ISODate | null = null;
  let credito = 0;
  let aReceber = 0;
  const marcar = (d: ISODate | undefined) => {
    if (d && (!ultima || d > ultima)) ultima = d;
  };
  for (const v of vendas) {
    if (v.clienteId !== clienteId || v.cancelada) continue;
    compras++;
    total += v.totalCentavos;
    marcar(v.data);
  }
  for (const p of seus) {
    const fin = situacaoFinanceira(p, pagamentos);
    credito += fin.creditoCentavos;
    aReceber += fin.aReceberCentavos;
    if (p.etapa !== 'entregue') continue;
    compras++;
    total += p.totalCentavos;
    marcar(p.entregueEm);
  }
  return {
    pedidos: seus.length,
    compras,
    totalGastoCentavos: total,
    ultimaCompra: ultima,
    ticketMedioCentavos: compras ? roundTo(total / compras, 0) : 0,
    creditoCentavos: credito,
    aReceberCentavos: aReceber,
  };
}
