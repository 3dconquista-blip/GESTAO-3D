// Relatórios, resultado do mês e números do Início (seção 11). Funções puras: recebem os registros.
//
// Receita = o que fica com o dono (11.2). Cada real entra UMA vez, por um único canal:
// - Venda direta: total da venda − taxa do cartão, na data da venda. Vendas canceladas ficam fora.
// - Parceiros: "sua parte" dos acertos concluídos, na data do acerto. Acertos estornados ficam fora.
// - Pedidos: total − frete − taxas de cartão dos pagamentos do pedido, na data de entrega (só 'entregue').
//   Pedido cancelado com valor retido (pago − devolvido > 0): o valor retido − taxas entra em "Pedidos" na
//   data do cancelamento, sem custo de produto; o material já baixado para ele vira perda nessa data.
// Pagamentos e movimentações de estoque NUNCA geram receita (são caixa e quantidade): a entrega de um
// pedido baixa o estoque com 'venda_direta', o acerto gera 'venda_parceiro' e a venda rápida gera um
// pagamento, mas a receita vem só dos registros acima.
//
// Custo dos produtos vendidos (fotografias do momento):
// - vendas: Σ quantidade × custoUnit do item; acertos: Σ vendidos × custoUnit do item;
// - pedidos: custoProducao + modelagemValor (igual ao lucro_pedido da seção 9.2).
// Perdas: movimentações 'perda' não estornadas (quantidade × custoUnit), expositores perdidos (custo, na
// data perdidoEm) e materiais com movimento 'perda' (filamento: gramas ÷ 1000 × R$/kg). Falhas de
// impressão NÃO são perdas: já estão no custo pela taxa de falha.
// Impostos = receita × imposto % da configuração atual, arredondado por canal (e somado).
// Dinheiro em centavos; custos somados em reais e convertidos para centavos só no total (metade para cima).
import type {
  Acerto,
  CanalVenda,
  Expositor,
  ID,
  Material,
  MovEstoque,
  MovMaterial,
  Pagamento,
  ParametrosCusto,
  Parceiro,
  Pedido,
  Producao,
  Venda,
} from '../data/types.ts';
import type { Cents } from '../lib/money.ts';
import { pctOfCents, roundTo, toCents } from '../lib/money.ts';
import type { ISODate, Periodo } from '../lib/dates.ts';
import { addMeses, diaDe, diffDias, entre, fimDoMes, mesDe, rotuloMes, ultimosMeses } from '../lib/dates.ts';
import { formatBRL, formatPct } from '../lib/format.ts';
import { situacaoFinanceira } from './pedidos.ts';
import { idsEstornados } from './stock.ts';

// ---------------------------------------------------------------- Tipos de entrada

/** Intervalo de datas inclusivo ('YYYY-MM-DD'). Um `Periodo` de lib/dates.ts serve. */
export interface Intervalo {
  de: ISODate;
  ate: ISODate;
}

/** Registros usados pelos relatórios (normalmente todos os do banco). */
export interface DadosRelatorio {
  vendas: Venda[];
  acertos: Acerto[];
  pedidos: Pedido[];
  pagamentos: Pagamento[];
  movEstoque: MovEstoque[];
  movMateriais: MovMaterial[];
  producoes: Producao[];
  expositores: Expositor[];
  materiais: Material[];
  /** Opcional: com a lista, parceiros não arquivados sem acerto no período também aparecem (zerados). */
  parceiros?: Parceiro[];
}

/** Parâmetros usados no resultado (um ParametrosCusto completo serve). */
export type ParametrosRelatorio = Pick<ParametrosCusto, 'impostoPct' | 'custosFixosMensaisCentavos'>;

/** Dados vazios (útil em testes e telas sem dados). */
export function dadosVazios(): DadosRelatorio {
  return {
    vendas: [],
    acertos: [],
    pedidos: [],
    pagamentos: [],
    movEstoque: [],
    movMateriais: [],
    producoes: [],
    expositores: [],
    materiais: [],
    parceiros: [],
  };
}

// ---------------------------------------------------------------- Canais

export type CanalReceita = 'direta' | 'parceiros' | 'pedidos';

/** Ordem fixa dos canais na "divisão por canal". */
export const CANAIS_RECEITA: CanalReceita[] = ['direta', 'parceiros', 'pedidos'];

export const ROTULO_CANAL_RECEITA: Record<CanalReceita, string> = {
  direta: 'Venda direta',
  parceiros: 'Parceiros',
  pedidos: 'Pedidos',
};

/** Canais da venda direta (venda rápida), na ordem de exibição. */
export const CANAIS_VENDA: CanalVenda[] = ['presencial', 'whatsapp', 'instagram', 'feira'];

const ROTULO_CANAL_VENDA: Record<string, string> = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  feira: 'Feira',
};

// ---------------------------------------------------------------- Utilidades

/** Reais (custo somado) -> centavos, metade para cima, sem ruído de ponto flutuante. */
function centavos(reais: number): Cents {
  return toCents(roundTo(reais, 6));
}

/**
 * Divide `total` centavos proporcionalmente aos pesos, com soma exata (maiores restos).
 * Pesos todos zero: divide por igual. Ex.: ratear(100, [1, 1, 1]) = [34, 33, 33].
 */
export function ratear(total: Cents, pesos: number[]): Cents[] {
  const n = pesos.length;
  if (n === 0) return [];
  const sinal = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const ws = pesos.map((w) => (w > 0 ? w : 0));
  let soma = ws.reduce((s, w) => s + w, 0);
  const base = soma > 0 ? ws : ws.map(() => 1);
  if (soma <= 0) soma = n;
  const exatos = base.map((w) => (abs * w) / soma);
  const out = exatos.map((e) => Math.floor(e));
  let resto = abs - out.reduce((s, v) => s + v, 0);
  const ordem = exatos.map((e, i) => ({ i, f: e - Math.floor(e) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; resto > 0 && k < ordem.length; k++, resto--) out[ordem[k].i]++;
  return out.map((v) => (v === 0 ? 0 : v * sinal));
}

/** Variação percentual de `anterior` para `atual`; null quando o anterior é zero. */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/** Período de um mês: periodoDoMes('2026-10') -> { de: '2026-10-01', ate: '2026-10-31', rotulo: 'out/2026' }. */
export function periodoDoMes(mes: string): Periodo {
  const de = `${mes.slice(0, 7)}-01`;
  return { de, ate: fimDoMes(de), rotulo: rotuloMes(mes.slice(0, 7)) };
}

/** Meses ('YYYY-MM') tocados pelo intervalo, do mais antigo ao mais recente. */
export function mesesDoIntervalo(p: Intervalo): string[] {
  const out: string[] = [];
  if (p.de > p.ate) return out;
  let m = `${mesDe(p.de)}-01`;
  const fim = mesDe(p.ate);
  while (mesDe(m) <= fim) {
    out.push(mesDe(m));
    m = addMeses(m, 1);
  }
  return out;
}

/**
 * Custos fixos do período: o valor mensal inteiro para cada mês completo; mês parcial proporcional
 * aos dias (dias no período ÷ dias do mês, metade para cima). Ex.: 1 a 15/10 com R$ 82,05 = R$ 39,70.
 */
export function custosFixosNoPeriodo(p: Intervalo, mensalCentavos: Cents): Cents {
  let total = 0;
  for (const mes of mesesDoIntervalo(p)) {
    const inicioMes = `${mes}-01`;
    const fimMes = fimDoMes(inicioMes);
    const de = p.de > inicioMes ? p.de : inicioMes;
    const ate = p.ate < fimMes ? p.ate : fimMes;
    const dias = diffDias(de, ate) + 1;
    const diasMes = Number(fimMes.slice(8, 10));
    total += dias >= diasMes ? mensalCentavos : roundTo((mensalCentavos * dias) / diasMes, 0);
  }
  return total;
}

// ---------------------------------------------------------------- O que conta no período

/** Vendas diretas que contam no período: não canceladas, pela data da venda. */
export function vendasNoPeriodo(vendas: Venda[], p: Intervalo): Venda[] {
  return vendas.filter((v) => !v.cancelada && entre(v.data, p.de, p.ate));
}

/** Acertos concluídos no período, pela data do acerto (estornados ficam fora). */
export function acertosNoPeriodo(acertos: Acerto[], p: Intervalo): Acerto[] {
  return acertos.filter((a) => a.situacao === 'concluido' && entre(a.data, p.de, p.ate));
}

/** Data em que o pedido conta: entregueEm (ou o dia da última atualização, se faltar). */
export function dataEntrega(pedido: Pedido): ISODate {
  return pedido.entregueEm || diaDe(pedido.atualizadoEm);
}

/** Pedidos entregues no período, pela data de entrega (cancelados e não entregues ficam fora). */
export function pedidosEntreguesNoPeriodo(pedidos: Pedido[], p: Intervalo): Pedido[] {
  return pedidos.filter((pd) => pd.etapa === 'entregue' && entre(dataEntrega(pd), p.de, p.ate));
}

/** Pedidos cancelados no período (pela data do cancelamento). */
export function pedidosCanceladosNoPeriodo(pedidos: Pedido[], p: Intervalo): Pedido[] {
  return pedidos.filter((pd) => pd.etapa === 'cancelado' && !!pd.canceladoEm && entre(pd.canceladoEm, p.de, p.ate));
}

/** Taxa de cartão de um registro de pagamento (negativa quando o registro é um estorno). */
function taxaDoRegistro(p: Pagamento, orig: Pagamento | undefined): Cents {
  if (!p.estornoDe) return p.taxaCentavos || 0;
  const t = p.taxaCentavos ?? (orig && Math.abs(p.valorCentavos) === Math.abs(orig.valorCentavos) ? orig.taxaCentavos || 0 : 0);
  return -Math.abs(t);
}

/**
 * Taxas de cartão líquidas por pedido: Σ taxaCentavos dos pagamentos recebidos do pedido, menos as dos
 * estornos. Conta independentemente da data do pagamento (a taxa entra no pedido, na data de entrega).
 */
export function taxasCartaoPorPedido(pagamentos: Pagamento[]): Map<ID, Cents> {
  const porId = new Map(pagamentos.map((p) => [p.id, p]));
  const out = new Map<ID, Cents>();
  for (const p of pagamentos) {
    const orig = p.estornoDe ? porId.get(p.estornoDe) : undefined;
    const ref = orig ?? p;
    if (ref.origem !== 'pedido' || ref.direcao !== 'recebido') continue;
    const t = taxaDoRegistro(p, orig);
    if (t) out.set(ref.refId, (out.get(ref.refId) || 0) + t);
  }
  return out;
}

// ---------------------------------------------------------------- Totais por canal

/** Valores de um canal (ou produto, ou parceiro) no período. Dinheiro em centavos. */
export interface Totais {
  /** Registros: vendas, acertos ou pedidos (em produtos: linhas de venda). */
  quantidade: number;
  /** Peças vendidas. */
  unidades: number;
  /** Total vendido (bruto): total da venda; bruto do acerto; total do pedido − frete. */
  vendidoCentavos: Cents;
  /** Taxas de cartão descontadas. */
  taxasCentavos: Cents;
  /** Receita: o que fica com o dono. */
  receitaCentavos: Cents;
  impostosCentavos: Cents;
  /** Custo dos produtos vendidos. */
  custoCentavos: Cents;
  /** receita − impostos − custo (sem perdas e custos fixos). */
  lucroCentavos: Cents;
}

export interface LinhaCanal extends Totais {
  canal: CanalReceita;
  rotulo: string;
}

export interface LinhaCanalVenda extends Totais {
  canal: CanalVenda;
  rotulo: string;
}

export interface VendasPorCanal {
  /** Venda direta, Parceiros e Pedidos, nessa ordem. */
  canais: LinhaCanal[];
  /** Venda direta aberta por canal de venda: presencial, WhatsApp, Instagram, feira. */
  direta: LinhaCanalVenda[];
  total: Totais;
}

interface Acum {
  quantidade: number;
  unidades: number;
  vendido: Cents;
  taxas: Cents;
  receita: Cents;
  custoReais: number;
}

function novoAcum(): Acum {
  return { quantidade: 0, unidades: 0, vendido: 0, taxas: 0, receita: 0, custoReais: 0 };
}

function fechar(a: Acum, impostoPct: number): Totais {
  const impostos = pctOfCents(a.receita, impostoPct || 0);
  const custo = centavos(a.custoReais);
  return {
    quantidade: a.quantidade,
    unidades: a.unidades,
    vendidoCentavos: a.vendido,
    taxasCentavos: a.taxas,
    receitaCentavos: a.receita,
    impostosCentavos: impostos,
    custoCentavos: custo,
    lucroCentavos: a.receita - impostos - custo,
  };
}

/** Soma campo a campo (os arredondamentos já feitos se mantêm: o total fecha com as linhas). */
export function somarTotais(lista: Totais[]): Totais {
  const t: Totais = {
    quantidade: 0,
    unidades: 0,
    vendidoCentavos: 0,
    taxasCentavos: 0,
    receitaCentavos: 0,
    impostosCentavos: 0,
    custoCentavos: 0,
    lucroCentavos: 0,
  };
  for (const x of lista) {
    t.quantidade += x.quantidade;
    t.unidades += x.unidades;
    t.vendidoCentavos += x.vendidoCentavos;
    t.taxasCentavos += x.taxasCentavos;
    t.receitaCentavos += x.receitaCentavos;
    t.impostosCentavos += x.impostosCentavos;
    t.custoCentavos += x.custoCentavos;
    t.lucroCentavos += x.lucroCentavos;
  }
  return t;
}

function apurarCanais(dados: DadosRelatorio, p: Intervalo, impostoPct: number): VendasPorCanal {
  // Venda direta, por canal de venda.
  const sub = new Map<string, Acum>();
  for (const c of CANAIS_VENDA) sub.set(c, novoAcum());
  for (const v of vendasNoPeriodo(dados.vendas, p)) {
    let a = sub.get(v.canal);
    if (!a) sub.set(v.canal, (a = novoAcum()));
    const taxa = v.taxaCentavos || 0;
    a.quantidade++;
    for (const it of v.itens) {
      a.unidades += it.quantidade;
      a.custoReais += it.quantidade * (it.custoUnit || 0);
    }
    a.vendido += v.totalCentavos;
    a.taxas += taxa;
    a.receita += v.totalCentavos - taxa;
  }
  const direta: LinhaCanalVenda[] = Array.from(sub, ([canal, a]) => ({
    canal: canal as CanalVenda,
    rotulo: ROTULO_CANAL_VENDA[canal] ?? canal,
    ...fechar(a, impostoPct),
  }));

  // Parceiros: sua parte dos acertos concluídos.
  const parc = novoAcum();
  for (const ac of acertosNoPeriodo(dados.acertos, p)) {
    parc.quantidade++;
    for (const it of ac.itens) {
      parc.unidades += it.vendidos;
      parc.custoReais += it.vendidos * (it.custoUnit || 0);
    }
    parc.vendido += ac.brutoCentavos;
    parc.receita += ac.suaParteCentavos;
  }

  // Pedidos entregues.
  const ped = novoAcum();
  const taxasPedido = taxasCartaoPorPedido(dados.pagamentos);
  for (const pd of pedidosEntreguesNoPeriodo(dados.pedidos, p)) {
    const frete = pd.entrega?.freteCentavos || 0;
    const taxas = taxasPedido.get(pd.id) || 0;
    ped.quantidade++;
    for (const it of pd.itens) ped.unidades += it.quantidade;
    ped.vendido += pd.totalCentavos - frete;
    ped.taxas += taxas;
    ped.receita += pd.totalCentavos - frete - taxas;
    ped.custoReais += (pd.custoProducao || 0) + (pd.modelagemValor || 0);
  }
  // Pedidos cancelados com valor retido: só o que ficou com o dono (sem peças, sem custo de produto).
  for (const pd of pedidosCanceladosNoPeriodo(dados.pedidos, p)) {
    const retido = situacaoFinanceira(pd, dados.pagamentos).pagoCentavos;
    if (retido <= 0) continue;
    const taxas = taxasPedido.get(pd.id) || 0;
    ped.vendido += retido;
    ped.taxas += taxas;
    ped.receita += retido - taxas;
  }

  const canais: LinhaCanal[] = [
    { canal: 'direta', rotulo: ROTULO_CANAL_RECEITA.direta, ...somarTotais(direta) },
    { canal: 'parceiros', rotulo: ROTULO_CANAL_RECEITA.parceiros, ...fechar(parc, impostoPct) },
    { canal: 'pedidos', rotulo: ROTULO_CANAL_RECEITA.pedidos, ...fechar(ped, impostoPct) },
  ];
  return { canais, direta, total: somarTotais(canais) };
}

/**
 * Vendas, receita e lucro por canal ("divisão por canal"): venda direta (aberta em presencial, WhatsApp,
 * Instagram e feira), parceiros e pedidos. O lucro aqui não desconta perdas nem custos fixos.
 */
export function vendasPorCanal(dados: DadosRelatorio, periodo: Intervalo, custos: ParametrosRelatorio): VendasPorCanal {
  return apurarCanais(dados, periodo, custos.impostoPct);
}

// ---------------------------------------------------------------- Perdas

export interface LinhaPerda {
  data: ISODate;
  tipo: 'produto' | 'expositor' | 'material';
  /** Material baixado para um pedido que depois foi cancelado. */
  pedidoId?: ID;
  /** produtoId, expositorId ou materialId. */
  refId: ID;
  /** Peças, 1 expositor, ou gramas/unidades do material. */
  quantidade: number;
  motivo?: string;
  valorCentavos: Cents;
}

export interface Perdas {
  produtosCentavos: Cents;
  expositoresCentavos: Cents;
  materiaisCentavos: Cents;
  totalCentavos: Cents;
  linhas: LinhaPerda[];
}

/** Custo (reais) de um movimento de material: filamento em gramas × R$/kg ÷ 1000; insumo em unidades × R$/un. */
export function custoMovMaterial(mov: MovMaterial, material: Material | undefined): number {
  const qtd = Math.abs(mov.quantidade || 0);
  const custo = mov.custoUnitSnapshot ?? material?.custoMedio ?? 0;
  return material?.tipo === 'filamento' ? (qtd / 1000) * custo : qtd * custo;
}

/**
 * Perdas do período: produtos com movimento 'perda' não estornado (quantidade × custo do momento),
 * expositores marcados como perdidos (pelo custo, na data perdidoEm) e materiais com movimento 'perda'
 * (pelo custo do momento, ou o custo médio atual se faltar). Com `pedidos`, o material baixado para pedidos
 * cancelados entra na data do cancelamento. Falhas de impressão não entram.
 */
export function perdasPeriodo(
  dados: Pick<DadosRelatorio, 'movEstoque' | 'movMateriais' | 'expositores' | 'materiais'> & { pedidos?: Pedido[] },
  p: Intervalo,
): Perdas {
  const linhas: LinhaPerda[] = [];

  const estMov = idsEstornados(dados.movEstoque);
  let produtosReais = 0;
  for (const m of dados.movEstoque) {
    if (m.tipo !== 'perda' || estMov.has(m.id) || !entre(m.data, p.de, p.ate)) continue;
    const valor = m.quantidade * (m.custoUnit || 0);
    produtosReais += valor;
    linhas.push({ data: m.data, tipo: 'produto', refId: m.produtoId, quantidade: m.quantidade, motivo: m.motivo, valorCentavos: centavos(valor) });
  }

  let expositoresCentavos = 0;
  for (const e of dados.expositores) {
    if (e.estado !== 'perdido' || !e.perdidoEm || !entre(e.perdidoEm, p.de, p.ate)) continue;
    const valor = e.custoCentavos || 0;
    expositoresCentavos += valor;
    linhas.push({ data: e.perdidoEm, tipo: 'expositor', refId: e.id, quantidade: 1, motivo: 'expositor_perdido', valorCentavos: valor });
  }

  const mats = new Map(dados.materiais.map((m) => [m.id, m]));
  const estMat = idsEstornados(dados.movMateriais);
  let materiaisReais = 0;
  for (const m of dados.movMateriais) {
    if (m.tipo !== 'perda' || estMat.has(m.id) || !entre(m.data, p.de, p.ate)) continue;
    const valor = custoMovMaterial(m, mats.get(m.materialId));
    materiaisReais += valor;
    linhas.push({ data: m.data, tipo: 'material', refId: m.materialId, quantidade: Math.abs(m.quantidade), motivo: m.motivo, valorCentavos: centavos(valor) });
  }
  const cancelados = new Map(pedidosCanceladosNoPeriodo(dados.pedidos ?? [], p).map((pd) => [pd.id, pd]));
  for (const m of dados.movMateriais) {
    const pd = m.refTipo === 'pedido' && m.refId ? cancelados.get(m.refId) : undefined;
    if (!pd || m.tipo !== 'pedido' || m.estornoDe || estMat.has(m.id)) continue;
    const valor = custoMovMaterial(m, mats.get(m.materialId));
    materiaisReais += valor;
    linhas.push({
      data: pd.canceladoEm as ISODate,
      tipo: 'material',
      refId: m.materialId,
      pedidoId: pd.id,
      quantidade: Math.abs(m.quantidade),
      motivo: 'pedido_cancelado',
      valorCentavos: centavos(valor),
    });
  }

  const produtosCentavos = centavos(produtosReais);
  const materiaisCentavos = centavos(materiaisReais);
  linhas.sort((a, b) => a.data.localeCompare(b.data));
  return {
    produtosCentavos,
    expositoresCentavos,
    materiaisCentavos,
    totalCentavos: produtosCentavos + expositoresCentavos + materiaisCentavos,
    linhas,
  };
}

// ---------------------------------------------------------------- Resultado do período

export interface ResultadoPeriodo {
  de: ISODate;
  ate: ISODate;
  /** Receita total (o que fica com o dono). */
  receitaCentavos: Cents;
  receitaPorCanal: Record<CanalReceita, Cents>;
  /** Linhas por canal (Venda direta, Parceiros, Pedidos). */
  canais: LinhaCanal[];
  /** Venda direta por canal de venda. */
  direta: LinhaCanalVenda[];
  /** Total vendido bruto (vendas + bruto dos acertos + pedidos sem frete). */
  vendidoCentavos: Cents;
  /** "Total vendido nos parceiros" (bruto dos acertos). */
  totalVendidoParceirosCentavos: Cents;
  taxasCartaoCentavos: Cents;
  impostosCentavos: Cents;
  /** Custo dos produtos vendidos. */
  cmvCentavos: Cents;
  perdasCentavos: Cents;
  perdas: Perdas;
  custosFixosCentavos: Cents;
  /** receita − impostos − custo dos produtos vendidos − perdas − custos fixos. */
  lucroCentavos: Cents;
  /** lucro ÷ receita (%), null sem receita. */
  margemPct: number | null;
}

/**
 * "Resultado do mês" para qualquer período: receita − impostos − custo dos produtos vendidos − perdas −
 * custos fixos = lucro estimado. Custos fixos proporcionais em meses incompletos (custosFixosNoPeriodo).
 */
export function resultadoPeriodo(dados: DadosRelatorio, periodo: Intervalo, custos: ParametrosRelatorio): ResultadoPeriodo {
  const vc = apurarCanais(dados, periodo, custos.impostoPct);
  const perdas = perdasPeriodo(dados, periodo);
  const fixos = custosFixosNoPeriodo(periodo, custos.custosFixosMensaisCentavos || 0);
  const t = vc.total;
  const receitaPorCanal = { direta: 0, parceiros: 0, pedidos: 0 } as Record<CanalReceita, Cents>;
  for (const c of vc.canais) receitaPorCanal[c.canal] = c.receitaCentavos;
  const lucro = t.receitaCentavos - t.impostosCentavos - t.custoCentavos - perdas.totalCentavos - fixos;
  return {
    de: periodo.de,
    ate: periodo.ate,
    receitaCentavos: t.receitaCentavos,
    receitaPorCanal,
    canais: vc.canais,
    direta: vc.direta,
    vendidoCentavos: t.vendidoCentavos,
    totalVendidoParceirosCentavos: vc.canais[1].vendidoCentavos,
    taxasCartaoCentavos: t.taxasCentavos,
    impostosCentavos: t.impostosCentavos,
    cmvCentavos: t.custoCentavos,
    perdasCentavos: perdas.totalCentavos,
    perdas,
    custosFixosCentavos: fixos,
    lucroCentavos: lucro,
    margemPct: t.receitaCentavos > 0 ? (lucro / t.receitaCentavos) * 100 : null,
  };
}

export interface ResultadoMes extends ResultadoPeriodo {
  mes: string;
  rotulo: string;
}

/** Resultado de um mês ('YYYY-MM'), com o mês inteiro de custos fixos. */
export function resultadoMes(dados: DadosRelatorio, mes: string, custos: ParametrosRelatorio): ResultadoMes {
  const p = periodoDoMes(mes);
  return { ...resultadoPeriodo(dados, p, custos), mes: mes.slice(0, 7), rotulo: p.rotulo };
}

// ---------------------------------------------------------------- Dinheiro que entrou

export interface DinheiroEntrou {
  /** Pagamentos recebidos no período (sinais, parcelas, saldos, acertos e vendas), menos estornos. */
  recebidoCentavos: Cents;
  porOrigem: Record<Pagamento['origem'], Cents>;
  /** "Recebido no seu PIX" no expositor, dos acertos concluídos no período (não vira pagamento). */
  pixExpositorCentavos: Cents;
  /** Devoluções a clientes (pagamentos 'pago' do tipo 'devolucao'). */
  devolvidoCentavos: Cents;
  /** Dinheiro que entrou = recebido + PIX no expositor − devoluções. */
  totalCentavos: Cents;
  /** Informativo: repasses feitos a parceiros (acertos negativos). Não entram no total. */
  pagoParceirosCentavos: Cents;
  /** Informativo: taxas de cartão dos pagamentos recebidos (o total é bruto, antes da taxa). */
  taxasCartaoCentavos: Cents;
}

/**
 * "Dinheiro que entrou no mês": soma dos pagamentos recebidos no período (inclui sinais e acertos pagos),
 * pela data do pagamento. Estornos (estornoDe) descontam na data do estorno; devoluções a clientes
 * descontam; repasses a parceiros ficam à parte. Com `acertos`, soma o PIX recebido no expositor.
 */
export function dinheiroQueEntrou(pagamentos: Pagamento[], periodo: Intervalo, acertos: Acerto[] = []): DinheiroEntrou {
  const porId = new Map(pagamentos.map((p) => [p.id, p]));
  const porOrigem: Record<Pagamento['origem'], Cents> = { venda: 0, acerto: 0, pedido: 0 };
  let recebido = 0;
  let devolvido = 0;
  let pagoParceiros = 0;
  let taxas = 0;
  for (const p of pagamentos) {
    if (!entre(p.data, periodo.de, periodo.ate)) continue;
    const orig = p.estornoDe ? porId.get(p.estornoDe) : undefined;
    const ref = orig ?? p;
    const valor = Math.abs(p.valorCentavos || 0) * (p.estornoDe ? -1 : 1);
    if (ref.direcao === 'recebido') {
      recebido += valor;
      porOrigem[ref.origem] = (porOrigem[ref.origem] || 0) + valor;
      taxas += taxaDoRegistro(p, orig);
    } else if (ref.tipo === 'devolucao') {
      devolvido += valor;
    } else {
      pagoParceiros += valor;
    }
  }
  let pix = 0;
  for (const a of acertosNoPeriodo(acertos, periodo)) pix += a.pixDiretoCentavos || 0;
  return {
    recebidoCentavos: recebido,
    porOrigem,
    pixExpositorCentavos: pix,
    devolvidoCentavos: devolvido,
    totalCentavos: recebido + pix - devolvido,
    pagoParceirosCentavos: pagoParceiros,
    taxasCartaoCentavos: taxas,
  };
}

// ---------------------------------------------------------------- Receita do ano e MEI

export interface ReceitaAno {
  ano: number;
  de: ISODate;
  ate: ISODate;
  receitaCentavos: Cents;
  vendidoCentavos: Cents;
  totalVendidoParceirosCentavos: Cents;
  porCanal: Record<CanalReceita, Cents>;
}

/** Receita do ano civil (mesmas regras do resultado: o que fica com o dono). */
export function receitaDoAno(dados: DadosRelatorio, ano: number): ReceitaAno {
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;
  const vc = apurarCanais(dados, { de, ate }, 0);
  const porCanal = { direta: 0, parceiros: 0, pedidos: 0 } as Record<CanalReceita, Cents>;
  for (const c of vc.canais) porCanal[c.canal] = c.receitaCentavos;
  return {
    ano,
    de,
    ate,
    receitaCentavos: vc.total.receitaCentavos,
    vendidoCentavos: vc.total.vendidoCentavos,
    totalVendidoParceirosCentavos: vc.canais[1].vendidoCentavos,
    porCanal,
  };
}

export type NivelMei = 'ok' | 'atencao' | 'acima';

export interface AlertaMei {
  receitaCentavos: Cents;
  limiteCentavos: Cents;
  /** receita ÷ limite (%). */
  pct: number;
  /** 'atencao' acima de 80% do limite; 'acima' quando passa do limite. */
  nivel: NivelMei;
  restanteCentavos: Cents;
  mensagem: string | null;
}

/** Alerta do limite anual do MEI: amarelo quando a receita do ano passa de 80%, vermelho acima do limite. */
export function alertaMei(receitaAnoCentavos: Cents, limiteCentavos: Cents): AlertaMei {
  const pct = limiteCentavos > 0 ? (receitaAnoCentavos / limiteCentavos) * 100 : 0;
  let nivel: NivelMei = 'ok';
  let mensagem: string | null = null;
  if (limiteCentavos > 0 && receitaAnoCentavos > limiteCentavos) {
    nivel = 'acima';
    mensagem = `A receita do ano passou do limite do MEI (${formatBRL(limiteCentavos)}). Procure seu contador.`;
  } else if (limiteCentavos > 0 && receitaAnoCentavos * 100 > limiteCentavos * 80) {
    nivel = 'atencao';
    mensagem = `A receita do ano já chegou a ${formatPct(pct)} do limite do MEI (${formatBRL(limiteCentavos)}).`;
  }
  return {
    receitaCentavos: receitaAnoCentavos,
    limiteCentavos,
    pct,
    nivel,
    restanteCentavos: Math.max(0, limiteCentavos - receitaAnoCentavos),
    mensagem,
  };
}

// ---------------------------------------------------------------- Por produto

export interface LinhaProduto extends Totais {
  produtoId: ID;
  unidadesDireta: number;
  unidadesParceiros: number;
  /** Itens de catálogo entregues em pedidos (o valor do pedido fica no canal "Pedidos", não aqui). */
  unidadesPedidos: number;
  /** lucro ÷ receita (%), null sem receita. */
  margemPct: number | null;
}

/**
 * Vendas por produto no período (venda direta e parceiros). A receita de cada venda (total − taxa) e a
 * sua parte de cada acerto são rateadas entre os itens pelo valor de cada linha, com soma exata.
 * Ordenado por unidades e receita.
 */
export function vendasPorProduto(dados: DadosRelatorio, periodo: Intervalo, custos: ParametrosRelatorio): LinhaProduto[] {
  type X = { a: Acum; direta: number; parceiros: number; pedidos: number };
  const acc = new Map<ID, X>();
  const pegar = (id: ID): X => {
    let x = acc.get(id);
    if (!x) acc.set(id, (x = { a: novoAcum(), direta: 0, parceiros: 0, pedidos: 0 }));
    return x;
  };

  for (const v of vendasNoPeriodo(dados.vendas, periodo)) {
    const pesos = v.itens.map((i) => i.quantidade * i.precoUnitCentavos);
    const taxa = v.taxaCentavos || 0;
    const receitas = ratear(v.totalCentavos - taxa, pesos);
    const vendidos = ratear(v.totalCentavos, pesos);
    const taxas = ratear(taxa, pesos);
    v.itens.forEach((it, i) => {
      const x = pegar(it.produtoId);
      x.a.quantidade++;
      x.a.unidades += it.quantidade;
      x.a.vendido += vendidos[i];
      x.a.taxas += taxas[i];
      x.a.receita += receitas[i];
      x.a.custoReais += it.quantidade * (it.custoUnit || 0);
      x.direta += it.quantidade;
    });
  }

  for (const ac of acertosNoPeriodo(dados.acertos, periodo)) {
    const itens = ac.itens.filter((i) => i.vendidos > 0);
    const receitas = ratear(ac.suaParteCentavos, itens.map((i) => i.valorCentavos));
    itens.forEach((it, i) => {
      const x = pegar(it.produtoId);
      x.a.quantidade++;
      x.a.unidades += it.vendidos;
      x.a.vendido += it.valorCentavos;
      x.a.receita += receitas[i];
      x.a.custoReais += it.vendidos * (it.custoUnit || 0);
      x.parceiros += it.vendidos;
    });
  }

  for (const pd of pedidosEntreguesNoPeriodo(dados.pedidos, periodo)) {
    for (const it of pd.itens) if (it.tipo === 'catalogo' && it.produtoId) pegar(it.produtoId).pedidos += it.quantidade;
  }

  const linhas = Array.from(acc, ([produtoId, x]): LinhaProduto => {
    const t = fechar(x.a, custos.impostoPct);
    return {
      produtoId,
      ...t,
      unidadesDireta: x.direta,
      unidadesParceiros: x.parceiros,
      unidadesPedidos: x.pedidos,
      margemPct: t.receitaCentavos > 0 ? (t.lucroCentavos / t.receitaCentavos) * 100 : null,
    };
  });
  return linhas.sort((a, b) => b.unidades - a.unidades || b.receitaCentavos - a.receitaCentavos);
}

/** Top 5 produtos (mais unidades vendidas, depois mais receita). Recebe as linhas de vendasPorProduto. */
export function top5Produtos(linhas: LinhaProduto[]): LinhaProduto[] {
  return linhas
    .filter((l) => l.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades || b.receitaCentavos - a.receitaCentavos)
    .slice(0, 5);
}

/** Última data de venda de cada produto (venda direta, acerto com vendidos ou pedido entregue). */
export function ultimaVendaPorProduto(dados: Pick<DadosRelatorio, 'vendas' | 'acertos' | 'pedidos'>): Map<ID, ISODate> {
  const out = new Map<ID, ISODate>();
  const marcar = (id: ID, data: ISODate) => {
    const atual = out.get(id);
    if (!atual || data > atual) out.set(id, data);
  };
  for (const v of dados.vendas) if (!v.cancelada) for (const it of v.itens) marcar(it.produtoId, v.data);
  for (const a of dados.acertos) if (a.situacao === 'concluido') for (const it of a.itens) if (it.vendidos > 0) marcar(it.produtoId, a.data);
  for (const pd of dados.pedidos) {
    if (pd.etapa !== 'entregue') continue;
    for (const it of pd.itens) if (it.tipo === 'catalogo' && it.produtoId) marcar(it.produtoId, dataEntrega(pd));
  }
  return out;
}

// ---------------------------------------------------------------- Por parceiro

export interface LinhaParceiro extends Totais {
  parceiroId: ID;
  /** Peças que estavam no expositor nos acertos do período (Σ esperado). */
  esperado: number;
  /** Giro = vendidos ÷ esperado (%), null sem contagem. */
  giroPct: number | null;
  /** Recebido no PIX do dono no expositor (Σ pix direto dos acertos do período). */
  pixDiretoCentavos: Cents;
  /** Pendências em aberto até o fim do período. */
  aReceberCentavos: Cents;
  /** Custo dos expositores que estão no parceiro. */
  custoExpositoresCentavos: Cents;
  /** Lucro acumulado no parceiro até o fim do período (sua parte − impostos − custo dos vendidos). */
  lucroAcumuladoCentavos: Cents;
  /** Retorno do expositor = lucro acumulado ÷ custo do expositor (%), null sem expositor. */
  retornoExpositorPct: number | null;
}

/**
 * Pendências por parceiro até `ate`: Σ valores positivos dos acertos concluídos − pagamentos recebidos
 * de acerto (menos estornos), nunca abaixo de zero. O total não depende da ordem de abatimento.
 */
export function aReceberPorParceiro(acertos: Acerto[], pagamentos: Pagamento[], ate?: ISODate): Map<ID, Cents> {
  const saldo = new Map<ID, Cents>();
  const somar = (id: ID, v: Cents) => saldo.set(id, (saldo.get(id) || 0) + v);
  const acertoPorId = new Map(acertos.map((a) => [a.id, a]));
  for (const a of acertos) {
    if (a.situacao !== 'concluido' || (ate && a.data > ate) || !(a.valorAcertoCentavos > 0)) continue;
    somar(a.parceiroId, a.valorAcertoCentavos);
  }
  const porId = new Map(pagamentos.map((p) => [p.id, p]));
  for (const p of pagamentos) {
    if (ate && p.data > ate) continue;
    const orig = p.estornoDe ? porId.get(p.estornoDe) : undefined;
    const ref = orig ?? p;
    if (ref.origem !== 'acerto' || ref.direcao !== 'recebido') continue;
    const parceiroId = ref.parceiroId ?? acertoPorId.get(ref.refId)?.parceiroId;
    if (!parceiroId) continue;
    somar(parceiroId, -Math.abs(p.valorCentavos || 0) * (p.estornoDe ? -1 : 1));
  }
  for (const [id, v] of saldo) if (v < 0) saldo.set(id, 0);
  return saldo;
}

/**
 * Vendas por parceiro no período (ranking por sua parte): acertos, peças, bruto, sua parte, lucro, giro,
 * a receber e retorno do expositor (lucro acumulado até o fim do período ÷ custo dos expositores).
 */
export function vendasPorParceiro(dados: DadosRelatorio, periodo: Intervalo, custos: ParametrosRelatorio): LinhaParceiro[] {
  type X = { a: Acum; esperado: number; pix: number };
  const acc = new Map<ID, X>();
  const pegar = (id: ID): X => {
    let x = acc.get(id);
    if (!x) acc.set(id, (x = { a: novoAcum(), esperado: 0, pix: 0 }));
    return x;
  };
  for (const p of dados.parceiros ?? []) if (!p.arquivado) pegar(p.id);
  for (const ac of acertosNoPeriodo(dados.acertos, periodo)) {
    const x = pegar(ac.parceiroId);
    x.a.quantidade++;
    for (const it of ac.itens) {
      x.a.unidades += it.vendidos;
      x.a.custoReais += it.vendidos * (it.custoUnit || 0);
      x.esperado += it.esperado;
    }
    x.a.vendido += ac.brutoCentavos;
    x.a.receita += ac.suaParteCentavos;
    x.pix += ac.pixDiretoCentavos || 0;
  }

  // Acumulado até o fim do período (retorno do expositor).
  const acumulado = new Map<ID, Acum>();
  for (const ac of dados.acertos) {
    if (ac.situacao !== 'concluido' || ac.data > periodo.ate || !acc.has(ac.parceiroId)) continue;
    let a = acumulado.get(ac.parceiroId);
    if (!a) acumulado.set(ac.parceiroId, (a = novoAcum()));
    a.receita += ac.suaParteCentavos;
    for (const it of ac.itens) a.custoReais += it.vendidos * (it.custoUnit || 0);
  }
  const custoExpo = new Map<ID, Cents>();
  for (const e of dados.expositores) {
    if (!e.parceiroId || e.arquivado) continue;
    custoExpo.set(e.parceiroId, (custoExpo.get(e.parceiroId) || 0) + (e.custoCentavos || 0));
  }
  const aReceber = aReceberPorParceiro(dados.acertos, dados.pagamentos, periodo.ate);

  const linhas = Array.from(acc, ([parceiroId, x]): LinhaParceiro => {
    const t = fechar(x.a, custos.impostoPct);
    const lucroAcum = fechar(acumulado.get(parceiroId) ?? novoAcum(), custos.impostoPct).lucroCentavos;
    const custoExpositores = custoExpo.get(parceiroId) || 0;
    return {
      parceiroId,
      ...t,
      esperado: x.esperado,
      giroPct: x.esperado > 0 ? (t.unidades / x.esperado) * 100 : null,
      pixDiretoCentavos: x.pix,
      aReceberCentavos: aReceber.get(parceiroId) || 0,
      custoExpositoresCentavos: custoExpositores,
      lucroAcumuladoCentavos: lucroAcum,
      retornoExpositorPct: custoExpositores > 0 ? (lucroAcum / custoExpositores) * 100 : null,
    };
  });
  return linhas.sort((a, b) => b.receitaCentavos - a.receitaCentavos || b.aReceberCentavos - a.aReceberCentavos);
}

/** Top 5 parceiros por sua parte no período. Recebe as linhas de vendasPorParceiro. */
export function top5Parceiros(linhas: LinhaParceiro[]): LinhaParceiro[] {
  return linhas
    .filter((l) => l.quantidade > 0 && l.receitaCentavos > 0)
    .sort((a, b) => b.receitaCentavos - a.receitaCentavos)
    .slice(0, 5);
}

// ---------------------------------------------------------------- Séries e comparação

export interface PontoSerie {
  mes: string;
  /** 'out/2026' */
  rotulo: string;
  /** Receita por canal (centavos), para o gráfico de barras empilhadas. */
  direta: Cents;
  parceiros: Cents;
  pedidos: Cents;
  receitaCentavos: Cents;
  /** Lucro estimado do mês (resultado completo). */
  lucroCentavos: Cents;
}

/** Receita por canal nos últimos `n` meses (do mais antigo ao mês de `hoje`), para o gráfico do Início. */
export function serieUltimosMeses(dados: DadosRelatorio, hoje: ISODate, custos: ParametrosRelatorio, n = 6): PontoSerie[] {
  return ultimosMeses(hoje, n).map((mes) => {
    const r = resultadoMes(dados, mes, custos);
    return {
      mes,
      rotulo: r.rotulo,
      direta: r.receitaPorCanal.direta,
      parceiros: r.receitaPorCanal.parceiros,
      pedidos: r.receitaPorCanal.pedidos,
      receitaCentavos: r.receitaCentavos,
      lucroCentavos: r.lucroCentavos,
    };
  });
}

export interface ComparativoMeses {
  atual: ResultadoMes;
  anterior: ResultadoMes;
  /** Variação da receita ("vendas") sobre o mês anterior (%), null se o anterior foi zero. */
  variacaoReceitaPct: number | null;
  variacaoVendidoPct: number | null;
  variacaoLucroPct: number | null;
}

/** "Este mês" comparado com o mês anterior (meses inteiros, com os custos fixos do mês inteiro). */
export function comparativoMeses(dados: DadosRelatorio, hoje: ISODate, custos: ParametrosRelatorio): ComparativoMeses {
  const mes = mesDe(hoje);
  const atual = resultadoMes(dados, mes, custos);
  const anterior = resultadoMes(dados, mesDe(addMeses(`${mes}-01`, -1)), custos);
  return {
    atual,
    anterior,
    variacaoReceitaPct: variacaoPct(atual.receitaCentavos, anterior.receitaCentavos),
    variacaoVendidoPct: variacaoPct(atual.vendidoCentavos, anterior.vendidoCentavos),
    variacaoLucroPct: variacaoPct(atual.lucroCentavos, anterior.lucroCentavos),
  };
}

// ---------------------------------------------------------------- Materiais

export interface ConsumoMaterialMes {
  materialId: ID;
  gramas: number;
  custoCentavos: Cents;
}

export interface LinhaConsumoMes {
  mes: string;
  rotulo: string;
  gramas: number;
  kg: number;
  custoCentavos: Cents;
  porMaterial: ConsumoMaterialMes[];
}

/**
 * Consumo de filamento por mês: movimentos 'producao' e 'pedido' (não estornados) de materiais do tipo
 * filamento. Custo pelo custo do momento (custoUnitSnapshot, R$/kg) ou, se faltar, o custo médio atual.
 * Traz todos os meses do período, mesmo sem consumo.
 */
export function consumoFilamentoPorMes(movMateriais: MovMaterial[], materiais: Material[], periodo: Intervalo): LinhaConsumoMes[] {
  const mats = new Map(materiais.map((m) => [m.id, m]));
  const estornados = idsEstornados(movMateriais);
  const porMes = new Map<string, Map<ID, { gramas: number; reais: number }>>();
  for (const mes of mesesDoIntervalo(periodo)) porMes.set(mes, new Map());
  for (const m of movMateriais) {
    if ((m.tipo !== 'producao' && m.tipo !== 'pedido') || estornados.has(m.id)) continue;
    if (!entre(m.data, periodo.de, periodo.ate)) continue;
    const mat = mats.get(m.materialId);
    if (mat?.tipo !== 'filamento') continue;
    const mes = porMes.get(mesDe(m.data));
    if (!mes) continue;
    const gramas = -(m.quantidade || 0);
    const custo = m.custoUnitSnapshot ?? mat.custoMedio ?? 0;
    const atual = mes.get(m.materialId) ?? { gramas: 0, reais: 0 };
    atual.gramas += gramas;
    atual.reais += (gramas / 1000) * custo;
    mes.set(m.materialId, atual);
  }
  return Array.from(porMes, ([mes, mapa]) => {
    let gramas = 0;
    let reais = 0;
    const porMaterial: ConsumoMaterialMes[] = [];
    for (const [materialId, v] of mapa) {
      gramas += v.gramas;
      reais += v.reais;
      porMaterial.push({ materialId, gramas: roundTo(v.gramas, 2), custoCentavos: centavos(v.reais) });
    }
    porMaterial.sort((a, b) => b.gramas - a.gramas);
    return { mes, rotulo: rotuloMes(mes), gramas: roundTo(gramas, 2), kg: roundTo(gramas / 1000, 3), custoCentavos: centavos(reais), porMaterial };
  });
}

export interface TaxaFalha {
  boas: number;
  perdidas: number;
  total: number;
  /** perdidas ÷ (boas + perdidas) × 100, null sem produção. */
  taxaPct: number | null;
}

/** Taxa de falha real = Σ perdidas ÷ Σ (boas + perdidas) das produções não estornadas (no período, se informado). */
export function taxaFalhaReal(producoes: Producao[], periodo?: Intervalo): TaxaFalha {
  let boas = 0;
  let perdidas = 0;
  for (const p of producoes) {
    if (p.estornada || (periodo && !entre(p.data, periodo.de, periodo.ate))) continue;
    boas += p.qtdBoa || 0;
    perdidas += p.qtdPerdida || 0;
  }
  const total = boas + perdidas;
  return { boas, perdidas, total, taxaPct: total > 0 ? (perdidas / total) * 100 : null };
}
