// Início e Relatórios (seção 11): junta os registros do banco e chama as funções puras de domain/relatorios.ts.
// Somente leitura (NUNCA grava). Resultados memoizados enquanto db.version não mudar: não altere os objetos.
// As planilhas CSV de cada relatório também saem daqui (texto pronto; quem baixa é a interface).
import { db } from '../data/db.ts';
import { ROTULO_FORMA, ROTULO_MOTIVO_PERDA } from '../data/defaults.ts';
import { custoProduto, memo, memoPorChave, nomeMaterial, nomeProduto, saldosEstoque, statusMargemProduto } from '../data/selectors.ts';
import type { Cents, ID, ISODate, Pagamento, Parceiro, Pedido, Produto } from '../data/types.ts';
import { CASA, parceiroDoLocal } from '../data/types.ts';
import { diffDias, hojeISO } from '../lib/dates.ts';
import { paraCSV, type ColunaCSV } from '../domain/csv.ts';
import { alertasPedidos, numeroPedido, situacaoFinanceira, type AlertaPedido } from '../domain/pedidos.ts';
import type { StatusMargem } from '../domain/pricing.ts';
import {
  comparativoMeses,
  consumoFilamentoPorMes,
  dinheiroQueEntrou,
  receitaDoAno,
  resultadoMes,
  resultadoPeriodo,
  serieUltimosMeses,
  somarTotais,
  taxaFalhaReal,
  top5Parceiros,
  top5Produtos,
  ultimaVendaPorProduto,
  vendasPorParceiro,
  vendasPorProduto,
  type ComparativoMeses,
  type DadosRelatorio,
  type DinheiroEntrou,
  type Intervalo,
  type LinhaConsumoMes,
  type LinhaParceiro,
  type LinhaProduto,
  type ParametrosRelatorio,
  type PontoSerie,
  type ReceitaAno,
  type ResultadoMes,
  type ResultadoPeriodo,
  type TaxaFalha,
  type Totais,
} from '../domain/relatorios.ts';
import { resumoPendencias } from './acertos.ts';
import { resumoHoje, type ResumoHoje } from './consultas.ts';

const chave = (p: Intervalo) => `${p.de}|${p.ate}`;
const intervalo = (k: string): Intervalo => {
  const [de, ate] = k.split('|');
  return { de, ate };
};

// ---------------------------------------------------------------- Dados

/** Todos os registros usados pelos relatórios. */
export const dadosRelatorio = memo(
  (): DadosRelatorio => ({
    vendas: db.all('vendas'),
    acertos: db.all('acertos'),
    pedidos: db.all('pedidos'),
    pagamentos: db.all('pagamentos'),
    movEstoque: db.all('movEstoque'),
    movMateriais: db.all('movMateriais'),
    producoes: db.all('producoes'),
    expositores: db.all('expositores'),
    materiais: db.all('materiais'),
    parceiros: db.all('parceiros'),
    gastos: db.all('gastos'),
  }),
);

/** Custos fixos mensais da configuração atual. */
export function parametrosRelatorio(): ParametrosRelatorio {
  return db.config.custos;
}

const nomeParceiro = (id: ID | null | undefined) => (id ? db.get('parceiros', id)?.nome ?? 'Parceiro removido' : '');

// ---------------------------------------------------------------- Resultado e vendas

const resultadoMemo = memoPorChave((k) => resultadoPeriodo(dadosRelatorio(), intervalo(k), parametrosRelatorio()));

/** Resultado do período: receita por canal − custo dos produtos vendidos − perdas − custos fixos. */
export function resultadoDoPeriodo(p: Intervalo): ResultadoPeriodo {
  return resultadoMemo(chave(p));
}

const resultadoMesMemo = memoPorChave((mes) => resultadoMes(dadosRelatorio(), mes, parametrosRelatorio()));

/** Resultado de um mês inteiro ('YYYY-MM'). */
export function resultadoDoMes(mes: string): ResultadoMes {
  return resultadoMesMemo(mes.slice(0, 7));
}

const produtosMemo = memoPorChave((k) => vendasPorProduto(dadosRelatorio(), intervalo(k)));

/** Vendas por produto no período (venda direta e parceiros; pedidos só em peças). */
export function produtosDoPeriodo(p: Intervalo): LinhaProduto[] {
  return produtosMemo(chave(p));
}

const parceirosMemo = memoPorChave((k) => vendasPorParceiro(dadosRelatorio(), intervalo(k)));

/** Vendas por parceiro no período: ranking, giro, a receber e retorno do expositor. */
export function parceirosDoPeriodo(p: Intervalo): LinhaParceiro[] {
  return parceirosMemo(chave(p));
}

const dinheiroMemo = memoPorChave((k) => dinheiroQueEntrou(db.all('pagamentos'), intervalo(k), db.all('acertos')));

/** "Dinheiro que entrou": pagamentos recebidos (sinais, saldos, acertos e vendas) + PIX no expositor − devoluções. */
export function dinheiroDoPeriodo(p: Intervalo): DinheiroEntrou {
  return dinheiroMemo(chave(p));
}

// ---------------------------------------------------------------- Produtos: parados e margem

export interface ProdutoParado {
  produto: Produto;
  emCasa: number;
  nosParceiros: number;
  ultimaVenda: ISODate | null;
  /** Dias desde a última venda até o fim do período (null se nunca vendeu). */
  diasSemVenda: number | null;
}

const ultimaVendaMemo = memo(() => ultimaVendaPorProduto(dadosRelatorio()));

const paradosMemo = memoPorChave((k): ProdutoParado[] => {
  const p = intervalo(k);
  const vendidos = new Set(produtosDoPeriodo(p).filter((l) => l.unidades > 0 || l.unidadesPedidos > 0).map((l) => l.produtoId));
  const saldos = saldosEstoque();
  const ultima = ultimaVendaMemo();
  const out: ProdutoParado[] = [];
  for (const produto of db.all('produtos')) {
    if (produto.arquivado || vendidos.has(produto.id)) continue;
    let emCasa = 0;
    let nosParceiros = 0;
    for (const [local, q] of saldos.get(produto.id) ?? []) {
      if (q <= 0) continue;
      if (local === CASA) emCasa += q;
      else if (parceiroDoLocal(local)) nosParceiros += q;
    }
    if (emCasa + nosParceiros <= 0) continue;
    const u = ultima.get(produto.id) ?? null;
    out.push({ produto, emCasa, nosParceiros, ultimaVenda: u, diasSemVenda: u ? Math.max(0, diffDias(u, p.ate)) : null });
  }
  return out.sort((a, b) => (b.diasSemVenda ?? Infinity) - (a.diasSemVenda ?? Infinity) || b.emCasa + b.nosParceiros - (a.emCasa + a.nosParceiros));
});

/** Produtos parados: com peças em Casa ou nos parceiros e nenhuma venda no período. */
export function produtosParados(p: Intervalo): ProdutoParado[] {
  return paradosMemo(chave(p));
}

export interface MargemProduto {
  produto: Produto;
  custoUnit: number;
  precoEtiquetaCentavos: Cents;
  /** Situação da etiqueta nos canais ativos (verde, amarelo, vermelho). */
  status: StatusMargem;
  /** Margem real no período (lucro ÷ receita), null sem venda. */
  margemPeriodoPct: number | null;
  unidades: number;
}

/** Margem de cada produto ativo: etiqueta × custo atual, e margem real das vendas do período. */
export function margensProdutos(p: Intervalo): MargemProduto[] {
  const linhas = new Map(produtosDoPeriodo(p).map((l) => [l.produtoId, l]));
  return db
    .all('produtos')
    .filter((x) => !x.arquivado)
    .map((produto) => {
      const l = linhas.get(produto.id);
      return {
        produto,
        custoUnit: custoProduto(produto.id),
        precoEtiquetaCentavos: produto.precoEtiquetaCentavos,
        status: statusMargemProduto(produto),
        margemPeriodoPct: l?.margemPct ?? null,
        unidades: l?.unidades ?? 0,
      };
    })
    .sort((a, b) => b.unidades - a.unidades || a.produto.nome.localeCompare(b.produto.nome));
}

// ---------------------------------------------------------------- Materiais

export interface MateriaisDoPeriodo {
  meses: LinhaConsumoMes[];
  totalGramas: number;
  totalCustoCentavos: Cents;
  falha: TaxaFalha;
  /** Taxa de falha configurada (usada no custo), para comparar. */
  taxaFalhaConfigPct: number;
}

const materiaisMemo = memoPorChave((k): MateriaisDoPeriodo => {
  const p = intervalo(k);
  const meses = consumoFilamentoPorMes(db.all('movMateriais'), db.all('materiais'), p);
  return {
    meses,
    totalGramas: meses.reduce((s, m) => s + m.gramas, 0),
    totalCustoCentavos: meses.reduce((s, m) => s + m.custoCentavos, 0),
    falha: taxaFalhaReal(db.all('producoes'), p),
    taxaFalhaConfigPct: db.config.custos.taxaFalhaPct,
  };
});

/** Consumo de filamento (kg e custo) por mês e taxa de falha real do período. */
export function materiaisDoPeriodo(p: Intervalo): MateriaisDoPeriodo {
  return materiaisMemo(chave(p));
}

// ---------------------------------------------------------------- Ano

export interface ResumoAno {
  receita: ReceitaAno;
  /** Receita e lucro de cada mês do ano, do primeiro mês com registros até o mês de `hoje` (ano corrente) ou dezembro. */
  meses: ResultadoMes[];
}

/** Data do primeiro registro com data (compra, produção, venda, acerto, pedido), ou null sem nenhum. */
export const primeiraAtividade = memo((): ISODate | null => {
  let min: ISODate | null = null;
  const ver = (d: ISODate | undefined) => {
    if (d && (!min || d < min)) min = d.slice(0, 10);
  };
  for (const m of db.all('movMateriais')) ver(m.data);
  for (const m of db.all('movEstoque')) ver(m.data);
  for (const v of db.all('vendas')) ver(v.data);
  for (const a of db.all('acertos')) ver(a.data);
  for (const p of db.all('pedidos')) ver(p.criadoEm);
  return min;
});

const anoMemo = memoPorChave((k): ResumoAno => {
  const [anoTxt, hoje] = k.split('|');
  const ano = Number(anoTxt);
  const receita = receitaDoAno(dadosRelatorio(), ano);
  const ultimoMes = hoje.startsWith(anoTxt) ? Number(hoje.slice(5, 7)) : hoje < anoTxt ? 0 : 12;
  // Meses antes do primeiro registro ficam de fora (só teriam custo fixo).
  const inicio = primeiraAtividade();
  const primeiroMes = !inicio || inicio.slice(0, 4) < anoTxt ? 1 : inicio.slice(0, 4) === anoTxt ? Number(inicio.slice(5, 7)) : 13;
  const meses: ResultadoMes[] = [];
  for (let m = primeiroMes; m <= ultimoMes; m++) meses.push(resultadoDoMes(`${anoTxt}-${String(m).padStart(2, '0')}`));
  return { receita, meses };
});

/** Receita do ano civil e o resultado de cada mês. */
export function resumoDoAno(ano: number, hoje: ISODate = hojeISO()): ResumoAno {
  return anoMemo(`${ano}|${hoje}`);
}

// ---------------------------------------------------------------- Início

export interface ResumoAReceber {
  parceirosCentavos: Cents;
  /** Saldo dos pedidos aprovados, em produção, prontos e entregues. */
  pedidosCentavos: Cents;
  totalCentavos: Cents;
  /** Pendências de parceiros vencidas (acerto anterior sem pagar). */
  vencidas: { parceiro: Parceiro; valorCentavos: Cents }[];
  /** Pedidos com saldo, do mais atrasado ao mais novo. */
  pedidos: { pedido: Pedido; saldoCentavos: Cents }[];
}

export interface PainelInicio {
  hoje: ResumoHoje & { pedidos: { pedido: Pedido; alerta: AlertaPedido }[]; aReceber: ResumoAReceber };
  mes: ComparativoMeses;
  serie: PontoSerie[];
  topProdutos: LinhaProduto[];
  topParceiros: LinhaParceiro[];
}

function aReceberAgora(hoje: ISODate): ResumoAReceber {
  const pend = resumoPendencias(hoje);
  const pags = db.all('pagamentos');
  const pedidos: ResumoAReceber['pedidos'] = [];
  for (const p of db.all('pedidos')) {
    if (p.etapa === 'orcamento' || p.etapa === 'cancelado') continue;
    const saldo = situacaoFinanceira(p, pags).saldoCentavos;
    if (saldo > 0) pedidos.push({ pedido: p, saldoCentavos: saldo });
  }
  pedidos.sort((a, b) => (a.pedido.etapa === 'entregue' ? -1 : 0) - (b.pedido.etapa === 'entregue' ? -1 : 0) || a.pedido.numero - b.pedido.numero);
  const pedidosCentavos = pedidos.reduce((s, x) => s + x.saldoCentavos, 0);
  return {
    parceirosCentavos: pend.aReceber,
    pedidosCentavos,
    totalCentavos: pend.aReceber + pedidosCentavos,
    vencidas: pend.vencidas.map((v) => ({ parceiro: v.parceiro, valorCentavos: v.vencida.valorCentavos })),
    pedidos,
  };
}

const inicioMemo = memoPorChave((hoje): PainelInicio => {
  const dados = dadosRelatorio();
  const custos = parametrosRelatorio();
  const mes = comparativoMeses(dados, hoje, custos);
  const periodoMes = { de: mes.atual.de, ate: mes.atual.ate };
  const ativos = db.all('pedidos').filter((p) => p.etapa !== 'entregue' && p.etapa !== 'cancelado');
  return {
    hoje: { ...resumoHoje(hoje), pedidos: alertasPedidos(ativos, db.all('pagamentos'), hoje), aReceber: aReceberAgora(hoje) },
    mes,
    serie: serieUltimosMeses(dados, hoje, custos, 6),
    topProdutos: top5Produtos(produtosDoPeriodo(periodoMes)),
    topParceiros: top5Parceiros(parceirosDoPeriodo(periodoMes)),
  };
});

/** Tudo o que o Início mostra: Hoje, Este mês × mês anterior, 6 meses por canal e top 5. */
export function painelInicio(hoje: ISODate = hojeISO()): PainelInicio {
  return inicioMemo(hoje);
}

// ---------------------------------------------------------------- CSV de cada relatório

export interface ArquivoCSV {
  /** Nome do relatório (o arquivo vira 3d-gestao-<nome>-<data>.csv). */
  nome: string;
  texto: string;
}

const pct = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export function csvResultado(p: Intervalo): ArquivoCSV {
  const r = resultadoDoPeriodo(p);
  const linhas: { item: string; valor: Cents }[] = [
    { item: 'Receita - venda direta', valor: r.receitaPorCanal.direta },
    { item: 'Receita - parceiros (sua parte)', valor: r.receitaPorCanal.parceiros },
    { item: 'Receita - pedidos', valor: r.receitaPorCanal.pedidos },
    { item: 'Receita total', valor: r.receitaCentavos },
    { item: '(-) Custo dos produtos vendidos', valor: -r.cmvCentavos },
    { item: '(-) Perdas', valor: -r.perdasCentavos },
    { item: '(-) Custos fixos', valor: -r.custosFixosCentavos },
    { item: '(-) Gastos avulsos', valor: -r.gastosCentavos },
    { item: '(=) Lucro estimado', valor: r.lucroCentavos },
    { item: 'Total vendido nos parceiros (bruto)', valor: r.totalVendidoParceirosCentavos },
    { item: 'Taxas de cartão (já descontadas da receita)', valor: r.taxasCartaoCentavos },
  ];
  const colunas: ColunaCSV<(typeof linhas)[number]>[] = [
    { titulo: `Resultado ${p.de} a ${p.ate}`, valor: (l) => l.item, tipo: 'texto' },
    { titulo: 'Valor (R$)', valor: (l) => l.valor, tipo: 'centavos' },
  ];
  return { nome: 'resultado', texto: paraCSV(linhas, colunas) };
}

export function csvCanais(p: Intervalo): ArquivoCSV {
  const r = resultadoDoPeriodo(p);
  type L = Totais & { nivel: string };
  const linhas: L[] = [];
  for (const c of r.canais) {
    linhas.push({ ...c, nivel: c.rotulo });
    if (c.canal === 'direta') for (const d of r.direta) linhas.push({ ...d, nivel: `${c.rotulo} - ${d.rotulo}` });
  }
  linhas.push({ ...somarTotais(r.canais), nivel: 'Total' });
  const colunas: ColunaCSV<L>[] = [
    { titulo: 'Canal', valor: (l) => l.nivel, tipo: 'texto' },
    { titulo: 'Registros', valor: (l) => l.quantidade },
    { titulo: 'Peças', valor: (l) => l.unidades },
    { titulo: 'Vendido (R$)', valor: (l) => l.vendidoCentavos, tipo: 'centavos' },
    { titulo: 'Taxas de cartão (R$)', valor: (l) => l.taxasCentavos, tipo: 'centavos' },
    { titulo: 'Receita (R$)', valor: (l) => l.receitaCentavos, tipo: 'centavos' },
    { titulo: 'Custo dos produtos (R$)', valor: (l) => l.custoCentavos, tipo: 'centavos' },
    { titulo: 'Lucro antes de perdas e fixos (R$)', valor: (l) => l.lucroCentavos, tipo: 'centavos' },
  ];
  return { nome: 'vendas-por-canal', texto: paraCSV(linhas, colunas) };
}

export function csvProdutos(p: Intervalo): ArquivoCSV {
  const colunas: ColunaCSV<LinhaProduto>[] = [
    { titulo: 'Produto', valor: (l) => nomeProduto(l.produtoId), tipo: 'texto' },
    { titulo: 'Código', valor: (l) => db.get('produtos', l.produtoId)?.codigo ?? '', tipo: 'texto' },
    { titulo: 'Peças venda direta', valor: (l) => l.unidadesDireta },
    { titulo: 'Peças parceiros', valor: (l) => l.unidadesParceiros },
    { titulo: 'Peças em pedidos', valor: (l) => l.unidadesPedidos },
    { titulo: 'Vendido (R$)', valor: (l) => l.vendidoCentavos, tipo: 'centavos' },
    { titulo: 'Receita (R$)', valor: (l) => l.receitaCentavos, tipo: 'centavos' },
    { titulo: 'Custo (R$)', valor: (l) => l.custoCentavos, tipo: 'centavos' },
    { titulo: 'Lucro (R$)', valor: (l) => l.lucroCentavos, tipo: 'centavos' },
    { titulo: 'Margem (%)', valor: (l) => pct(l.margemPct), decimais: 1 },
  ];
  return { nome: 'vendas-por-produto', texto: paraCSV(produtosDoPeriodo(p), colunas) };
}

export function csvParados(p: Intervalo): ArquivoCSV {
  const colunas: ColunaCSV<ProdutoParado>[] = [
    { titulo: 'Produto', valor: (l) => l.produto.nome, tipo: 'texto' },
    { titulo: 'Em Casa', valor: (l) => l.emCasa },
    { titulo: 'Nos parceiros', valor: (l) => l.nosParceiros },
    { titulo: 'Última venda', valor: (l) => l.ultimaVenda ?? 'Nunca vendeu', tipo: 'data' },
    { titulo: 'Dias sem venda', valor: (l) => l.diasSemVenda },
  ];
  return { nome: 'produtos-parados', texto: paraCSV(produtosParados(p), colunas) };
}

const ROTULO_STATUS: Record<StatusMargem, string> = { ok: 'Boa', atencao: 'Abaixo da desejada', prejuizo: 'Prejuízo ou abaixo da mínima', sem_preco: 'Sem preço' };

export function csvMargens(p: Intervalo): ArquivoCSV {
  const colunas: ColunaCSV<MargemProduto>[] = [
    { titulo: 'Produto', valor: (l) => l.produto.nome, tipo: 'texto' },
    { titulo: 'Custo por peça (R$)', valor: (l) => l.custoUnit, decimais: 4 },
    { titulo: 'Preço de etiqueta (R$)', valor: (l) => l.precoEtiquetaCentavos, tipo: 'centavos' },
    { titulo: 'Situação da etiqueta', valor: (l) => ROTULO_STATUS[l.status], tipo: 'texto' },
    { titulo: 'Peças vendidas no período', valor: (l) => l.unidades },
    { titulo: 'Margem real no período (%)', valor: (l) => pct(l.margemPeriodoPct), decimais: 1 },
  ];
  return { nome: 'margem-dos-produtos', texto: paraCSV(margensProdutos(p), colunas) };
}

export function csvParceiros(p: Intervalo): ArquivoCSV {
  const colunas: ColunaCSV<LinhaParceiro>[] = [
    { titulo: 'Parceiro', valor: (l) => nomeParceiro(l.parceiroId), tipo: 'texto' },
    { titulo: 'Acertos', valor: (l) => l.quantidade },
    { titulo: 'Peças vendidas', valor: (l) => l.unidades },
    { titulo: 'Peças no expositor (esperado)', valor: (l) => l.esperado },
    { titulo: 'Giro (%)', valor: (l) => pct(l.giroPct), decimais: 1 },
    { titulo: 'Total vendido (bruto, R$)', valor: (l) => l.vendidoCentavos, tipo: 'centavos' },
    { titulo: 'Sua parte (R$)', valor: (l) => l.receitaCentavos, tipo: 'centavos' },
    { titulo: 'Recebido no PIX do expositor (R$)', valor: (l) => l.pixDiretoCentavos, tipo: 'centavos' },
    { titulo: 'Lucro (R$)', valor: (l) => l.lucroCentavos, tipo: 'centavos' },
    { titulo: 'A receber (R$)', valor: (l) => l.aReceberCentavos, tipo: 'centavos' },
    { titulo: 'Custo dos expositores (R$)', valor: (l) => l.custoExpositoresCentavos, tipo: 'centavos' },
    { titulo: 'Lucro acumulado (R$)', valor: (l) => l.lucroAcumuladoCentavos, tipo: 'centavos' },
    { titulo: 'Retorno do expositor (%)', valor: (l) => pct(l.retornoExpositorPct), decimais: 1 },
  ];
  return { nome: 'parceiros', texto: paraCSV(parceirosDoPeriodo(p), colunas) };
}

export function csvMateriais(p: Intervalo): ArquivoCSV {
  type L = { mes: string; material: string; gramas: number; custo: Cents };
  const linhas: L[] = [];
  for (const m of materiaisDoPeriodo(p).meses) {
    for (const x of m.porMaterial) linhas.push({ mes: m.rotulo, material: nomeMaterial(x.materialId), gramas: x.gramas, custo: x.custoCentavos });
    linhas.push({ mes: m.rotulo, material: 'Total do mês', gramas: m.gramas, custo: m.custoCentavos });
  }
  const colunas: ColunaCSV<L>[] = [
    { titulo: 'Mês', valor: (l) => l.mes, tipo: 'texto' },
    { titulo: 'Filamento', valor: (l) => l.material, tipo: 'texto' },
    { titulo: 'Gramas', valor: (l) => l.gramas, decimais: 2 },
    { titulo: 'Kg', valor: (l) => l.gramas / 1000, decimais: 3 },
    { titulo: 'Custo (R$)', valor: (l) => l.custo, tipo: 'centavos' },
  ];
  return { nome: 'consumo-de-filamento', texto: paraCSV(linhas, colunas) };
}

export interface LinhaDinheiro {
  data: ISODate;
  origem: string;
  referencia: string;
  descricao: string;
  forma: string;
  /** Positivo entrou, negativo saiu (estorno ou devolução). Repasses a parceiros ficam fora do total. */
  valorCentavos: Cents;
  taxaCentavos: Cents;
  entraNoTotal: boolean;
}

const ROTULO_ORIGEM: Record<Pagamento['origem'], string> = { venda: 'Venda direta', acerto: 'Acerto', pedido: 'Pedido' };

function referenciaPagamento(p: Pagamento): string {
  if (p.origem === 'pedido') {
    const pd = db.get('pedidos', p.refId);
    return pd ? `${numeroPedido(pd.numero)} ${pd.titulo}` : 'Pedido';
  }
  if (p.origem === 'acerto') return nomeParceiro(p.parceiroId ?? db.get('acertos', p.refId)?.parceiroId);
  return 'Venda rápida';
}

/** Linhas do "Dinheiro que entrou" no período (para a lista e o CSV), por data. */
export function movimentoDinheiro(per: Intervalo): LinhaDinheiro[] {
  const pags = db.all('pagamentos');
  const porId = new Map(pags.map((p) => [p.id, p]));
  const out: LinhaDinheiro[] = [];
  for (const p of pags) {
    if (p.data < per.de || p.data > per.ate) continue;
    const ref = (p.estornoDe && porId.get(p.estornoDe)) || p;
    const sinal = p.estornoDe ? -1 : 1;
    const recebido = ref.direcao === 'recebido';
    const devolucao = !recebido && ref.tipo === 'devolucao';
    let descricao = recebido ? 'Recebido' : devolucao ? 'Devolução ao cliente' : 'Repasse ao parceiro';
    if (p.estornoDe) descricao = `Estorno: ${descricao.toLowerCase()}`;
    const valor = Math.abs(p.valorCentavos) * sinal * (recebido ? 1 : -1);
    out.push({
      data: p.data,
      origem: ROTULO_ORIGEM[ref.origem],
      referencia: referenciaPagamento(ref),
      descricao,
      forma: ROTULO_FORMA[p.forma] ?? p.forma,
      valorCentavos: valor,
      taxaCentavos: recebido ? (p.taxaCentavos || 0) * sinal : 0,
      entraNoTotal: recebido || devolucao,
    });
  }
  for (const a of db.all('acertos')) {
    if (a.situacao !== 'concluido' || !a.pixDiretoCentavos || a.data < per.de || a.data > per.ate) continue;
    out.push({
      data: a.data,
      origem: 'Acerto',
      referencia: nomeParceiro(a.parceiroId),
      descricao: 'Recebido no seu PIX no expositor',
      forma: 'PIX',
      valorCentavos: a.pixDiretoCentavos,
      taxaCentavos: 0,
      entraNoTotal: true,
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

export function csvDinheiro(p: Intervalo): ArquivoCSV {
  const colunas: ColunaCSV<LinhaDinheiro>[] = [
    { titulo: 'Data', valor: (l) => l.data, tipo: 'data' },
    { titulo: 'Origem', valor: (l) => l.origem, tipo: 'texto' },
    { titulo: 'Referência', valor: (l) => l.referencia, tipo: 'texto' },
    { titulo: 'Descrição', valor: (l) => l.descricao, tipo: 'texto' },
    { titulo: 'Forma', valor: (l) => l.forma, tipo: 'texto' },
    { titulo: 'Valor (R$)', valor: (l) => l.valorCentavos, tipo: 'centavos' },
    { titulo: 'Taxa de cartão (R$)', valor: (l) => l.taxaCentavos, tipo: 'centavos' },
    { titulo: 'Entra no total', valor: (l) => l.entraNoTotal },
  ];
  return { nome: 'dinheiro-que-entrou', texto: paraCSV(movimentoDinheiro(p), colunas) };
}

export function csvPerdas(p: Intervalo): ArquivoCSV {
  type L = ResultadoPeriodo['perdas']['linhas'][number];
  const nome = (l: L) => {
    if (l.tipo === 'produto') return nomeProduto(l.refId);
    if (l.tipo === 'material') return nomeMaterial(l.refId);
    return `Expositor ${db.get('expositores', l.refId)?.codigo ?? ''}`.trim();
  };
  const motivo = (l: L) => {
    if (l.motivo === 'pedido_cancelado') {
      const pd = l.pedidoId ? db.get('pedidos', l.pedidoId) : undefined;
      return `Pedido cancelado${pd ? ` ${numeroPedido(pd.numero)}` : ''}`;
    }
    return (l.motivo && ROTULO_MOTIVO_PERDA[l.motivo]) || l.motivo || '';
  };
  const colunas: ColunaCSV<L>[] = [
    { titulo: 'Data', valor: (l) => l.data, tipo: 'data' },
    { titulo: 'Tipo', valor: (l) => (l.tipo === 'produto' ? 'Produto' : l.tipo === 'material' ? 'Material' : 'Expositor'), tipo: 'texto' },
    { titulo: 'Item', valor: nome, tipo: 'texto' },
    { titulo: 'Quantidade', valor: (l) => l.quantidade },
    { titulo: 'Motivo', valor: motivo, tipo: 'texto' },
    { titulo: 'Valor (R$)', valor: (l) => l.valorCentavos, tipo: 'centavos' },
  ];
  return { nome: 'perdas', texto: paraCSV(resultadoDoPeriodo(p).perdas.linhas, colunas) };
}

export function csvAno(ano: number, hoje: ISODate = hojeISO()): ArquivoCSV {
  const colunas: ColunaCSV<ResultadoMes>[] = [
    { titulo: 'Mês', valor: (l) => l.rotulo, tipo: 'texto' },
    { titulo: 'Venda direta (R$)', valor: (l) => l.receitaPorCanal.direta, tipo: 'centavos' },
    { titulo: 'Parceiros - sua parte (R$)', valor: (l) => l.receitaPorCanal.parceiros, tipo: 'centavos' },
    { titulo: 'Pedidos (R$)', valor: (l) => l.receitaPorCanal.pedidos, tipo: 'centavos' },
    { titulo: 'Receita (R$)', valor: (l) => l.receitaCentavos, tipo: 'centavos' },
    { titulo: 'Total vendido nos parceiros - bruto (R$)', valor: (l) => l.totalVendidoParceirosCentavos, tipo: 'centavos' },
    { titulo: 'Lucro estimado (R$)', valor: (l) => l.lucroCentavos, tipo: 'centavos' },
  ];
  return { nome: `receita-${ano}`, texto: paraCSV(resumoDoAno(ano, hoje).meses, colunas) };
}
