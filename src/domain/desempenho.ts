// Desempenho dos parceiros (seção 8.9) e retorno do expositor (seção 8.2). Funções puras.
// Base: acertos concluídos (fotografia de vendidos, bruto, sua parte e custo do momento).
// - dias do período = data do acerto − data anterior (ou da instalação); nas médias, mínimo 1 dia.
// - média por dia = vendidos ÷ dias; giro = vendidos ÷ esperado (em %, 0 a 100).
// - sua parte por mês = sua parte ÷ dias × 30 (centavos, metade para cima).
// - item parado = zero vendas nos 2 últimos acertos seguidos (exposto nos dois) e ainda no parceiro.
// - baixo desempenho = sua parte por mês abaixo do limite nos 2 últimos acertos seguidos.
// - lucro acumulado no parceiro = Σ sua parte − Σ (vendidos + avariados + faltas abonadas)
//   × custo do momento; retorno = lucro acumulado ÷ custo dos expositores.
import type { Acerto, Cents, Expositor, ID, ISODate, Parceiro } from '../data/types.ts';
import { diffDias, entre } from '../lib/dates.ts';
import { roundTo, toCents } from '../lib/money.ts';

/** Limite padrão de baixo desempenho (R$ 50,00 por mês). */
export const LIMITE_BAIXO_DESEMPENHO_PADRAO: Cents = 5000;

/** Janela padrão do ranking sem período: últimos 3 acertos de cada parceiro. */
export const ACERTOS_JANELA_RANKING = 3;

export interface FiltroPeriodo {
  de: ISODate;
  ate: ISODate;
}

/** Acertos concluídos (de um parceiro, se informado) em ordem cronológica: mais antigo primeiro. */
export function acertosConcluidos(acertos: Acerto[], parceiroId?: ID): Acerto[] {
  return acertos
    .filter((a) => a.situacao === 'concluido' && (!parceiroId || a.parceiroId === parceiroId))
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? -1 : 1) : a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0));
}

/** Dias do período do acerto: data − data anterior (ou da instalação). */
export function diasDoAcerto(a: Pick<Acerto, 'data' | 'dataAnterior'>): number {
  return diffDias(a.dataAnterior, a.data);
}

/** Valor por mês: centavos ÷ dias × 30, metade para cima (período de 0 dia conta como 1). */
export function porMesCentavos(centavos: Cents, dias: number): Cents {
  return roundTo((centavos * 30) / Math.max(1, dias), 0);
}

/** Giro em % (0 a 100): vendidos ÷ esperado. 0 quando não havia peças. */
export function giroPct(vendidos: number, esperado: number): number {
  return esperado > 0 ? (vendidos * 100) / esperado : 0;
}

interface SomaItem {
  esperado: number;
  vendidos: number;
  valorCentavos: Cents;
  estoqueFinal: number;
}

/** Itens do acerto somados por produto (esperado, vendidos, valor, estoque final). */
function itensPorProduto(a: Acerto): Map<ID, SomaItem> {
  const m = new Map<ID, SomaItem>();
  for (const it of a.itens) {
    const s = m.get(it.produtoId) ?? { esperado: 0, vendidos: 0, valorCentavos: 0, estoqueFinal: 0 };
    s.esperado += it.esperado;
    s.vendidos += it.vendidos;
    s.valorCentavos += it.valorCentavos;
    s.estoqueFinal += it.estoqueFinal;
    m.set(it.produtoId, s);
  }
  return m;
}

export interface LinhaDesempenho {
  acertoId: ID;
  data: ISODate;
  dataAnterior: ISODate;
  dias: number;
  /** Σ esperado (peças no expositor no início da contagem). */
  esperado: number;
  vendidos: number;
  brutoCentavos: Cents;
  suaParteCentavos: Cents;
  /** sua parte ÷ dias × 30 */
  suaPartePorMesCentavos: Cents;
  /** vendidos ÷ dias */
  mediaPorDia: number;
  /** vendidos ÷ esperado, em % (0 a 100) */
  giroPct: number;
}

/** Números de um acerto concluído (período, vendidos, valores, médias e giro). */
export function linhaDoAcerto(a: Acerto): LinhaDesempenho {
  let esperado = 0;
  let vendidos = 0;
  for (const it of a.itens) {
    esperado += it.esperado;
    vendidos += it.vendidos;
  }
  const dias = diasDoAcerto(a);
  return {
    acertoId: a.id,
    data: a.data,
    dataAnterior: a.dataAnterior,
    dias,
    esperado,
    vendidos,
    brutoCentavos: a.brutoCentavos,
    suaParteCentavos: a.suaParteCentavos,
    suaPartePorMesCentavos: porMesCentavos(a.suaParteCentavos, dias),
    mediaPorDia: vendidos / Math.max(1, dias),
    giroPct: giroPct(vendidos, esperado),
  };
}

export interface TotaisDesempenho {
  /** Quantidade de acertos somados. */
  acertos: number;
  unidades: number;
  esperado: number;
  brutoCentavos: Cents;
  suaParteCentavos: Cents;
  /** Σ dias dos períodos. */
  dias: number;
  /** unidades ÷ dias */
  mediaPorDia: number;
  /** Σ sua parte ÷ Σ dias × 30 */
  suaPartePorMesCentavos: Cents;
  /** Σ vendidos ÷ Σ esperado, em % */
  giroPct: number;
}

/** Soma de vários acertos (as médias são ponderadas pelos dias). */
export function totaisDeAcertos(acertos: Acerto[]): TotaisDesempenho {
  let unidades = 0;
  let esperado = 0;
  let bruto = 0;
  let suaParte = 0;
  let dias = 0;
  for (const a of acertos) {
    const l = linhaDoAcerto(a);
    unidades += l.vendidos;
    esperado += l.esperado;
    bruto += l.brutoCentavos;
    suaParte += l.suaParteCentavos;
    dias += Math.max(1, l.dias);
  }
  return {
    acertos: acertos.length,
    unidades,
    esperado,
    brutoCentavos: bruto,
    suaParteCentavos: suaParte,
    dias,
    mediaPorDia: dias > 0 ? unidades / dias : 0,
    suaPartePorMesCentavos: dias > 0 ? porMesCentavos(suaParte, dias) : 0,
    giroPct: giroPct(unidades, esperado),
  };
}

/**
 * Parceiro onde o produto vende mais (maior média de unidades por dia nos acertos em que estava exposto),
 * excluindo `excetoParceiroId`. Com `parceiros`, só sugere parceiros ativos e não arquivados. null se não vende em nenhum.
 */
export function parceiroOndeMaisVende(
  produtoId: ID,
  acertos: Acerto[],
  excetoParceiroId: ID | null,
  parceiros?: Parceiro[],
): ID | null {
  const validos = parceiros ? new Set(parceiros.filter((p) => !p.arquivado && p.situacao === 'ativo').map((p) => p.id)) : null;
  const soma = new Map<ID, { vendidos: number; dias: number }>();
  for (const a of acertos) {
    if (a.situacao !== 'concluido' || a.parceiroId === excetoParceiroId) continue;
    if (validos && !validos.has(a.parceiroId)) continue;
    const it = itensPorProduto(a).get(produtoId);
    if (!it || it.esperado <= 0) continue;
    const s = soma.get(a.parceiroId) ?? { vendidos: 0, dias: 0 };
    s.vendidos += it.vendidos;
    s.dias += Math.max(1, diasDoAcerto(a));
    soma.set(a.parceiroId, s);
  }
  let melhor: ID | null = null;
  let melhorTaxa = 0;
  let melhorVendidos = 0;
  for (const [pid, s] of soma) {
    if (s.vendidos <= 0) continue;
    const taxa = s.vendidos / s.dias;
    if (taxa > melhorTaxa || (taxa === melhorTaxa && s.vendidos > melhorVendidos)) {
      melhor = pid;
      melhorTaxa = taxa;
      melhorVendidos = s.vendidos;
    }
  }
  return melhor;
}

export interface ItemMaisVendido {
  produtoId: ID;
  unidades: number;
  brutoCentavos: Cents;
}

export interface ItemParado {
  produtoId: ID;
  /** Peças desse produto ainda no parceiro. */
  estoque: number;
  /** Parceiro onde esse produto vende mais (sugestão de recolher e levar para lá), ou null. */
  sugestaoParceiroId: ID | null;
}

export interface RetornoExpositor {
  /** Σ sua parte − custo (do momento) das peças vendidas, avariadas e abonadas. */
  lucroAcumuladoCentavos: Cents;
  /** Soma do custo dos expositores do parceiro. */
  custoExpositoresCentavos: Cents;
  /** lucro acumulado ÷ custo dos expositores (1 = pagou o expositor). null sem custo de expositor. */
  retorno: number | null;
}

export interface DesempenhoParceiro {
  parceiroId: ID;
  /** Histórico de acertos do período, do mais antigo ao mais recente. */
  porAcerto: LinhaDesempenho[];
  /** Totais do período. */
  totais: TotaisDesempenho;
  /** Produtos mais vendidos no período (só com vendas), do maior para o menor. */
  maisVendidos: ItemMaisVendido[];
  /** Itens parados agora (sempre pelos 2 últimos acertos, independente do período). */
  itensParados: ItemParado[];
  /** Sua parte por mês abaixo do limite nos 2 últimos acertos seguidos (independente do período). */
  baixoDesempenho: boolean;
  /** Retorno do investimento no expositor (todo o histórico do parceiro). */
  retornoExpositor: RetornoExpositor;
}

export interface EntradaDesempenho {
  parceiro: Parceiro;
  /** Acertos de TODOS os parceiros (os não concluídos são ignorados). */
  acertos: Acerto[];
  expositores: Expositor[];
  /** Filtra o histórico, os totais e os mais vendidos pela data do acerto. */
  periodo?: FiltroPeriodo;
  /** Padrão R$ 50,00 (Configurações > Parcerias). */
  limiteBaixoDesempenhoCentavos?: Cents;
  /** Saldo atual do produto neste parceiro; sem ele, usa o estoque final do último acerto. */
  saldoAtual?: (produtoId: ID) => number;
  /** Todos os parceiros: a sugestão de destino de itens parados considera só os ativos. */
  parceiros?: Parceiro[];
}

/** Desempenho do parceiro: histórico por acerto, totais, mais vendidos, itens parados, baixo desempenho e retorno do expositor. */
export function desempenhoParceiro(e: EntradaDesempenho): DesempenhoParceiro {
  const { parceiro } = e;
  const todos = acertosConcluidos(e.acertos, parceiro.id);
  const doPeriodo = e.periodo ? todos.filter((a) => entre(a.data, e.periodo!.de, e.periodo!.ate)) : todos;

  // Mais vendidos no período.
  const vendas = new Map<ID, ItemMaisVendido>();
  for (const a of doPeriodo) {
    for (const [produtoId, s] of itensPorProduto(a)) {
      const v = vendas.get(produtoId) ?? { produtoId, unidades: 0, brutoCentavos: 0 };
      v.unidades += s.vendidos;
      v.brutoCentavos += s.valorCentavos;
      vendas.set(produtoId, v);
    }
  }
  const maisVendidos = Array.from(vendas.values())
    .filter((v) => v.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades || b.brutoCentavos - a.brutoCentavos);

  // Itens parados e baixo desempenho: 2 últimos acertos seguidos.
  const itensParados: ItemParado[] = [];
  let baixoDesempenho = false;
  if (todos.length >= 2) {
    const penultimo = todos[todos.length - 2];
    const ultimo = todos[todos.length - 1];
    const antes = itensPorProduto(penultimo);
    for (const [produtoId, s] of itensPorProduto(ultimo)) {
      const a = antes.get(produtoId);
      if (s.esperado <= 0 || s.vendidos !== 0 || !a || a.esperado <= 0 || a.vendidos !== 0) continue;
      const estoque = e.saldoAtual ? e.saldoAtual(produtoId) : s.estoqueFinal;
      if (estoque <= 0) continue;
      itensParados.push({
        produtoId,
        estoque,
        sugestaoParceiroId: parceiroOndeMaisVende(produtoId, e.acertos, parceiro.id, e.parceiros),
      });
    }
    const limite = e.limiteBaixoDesempenhoCentavos ?? LIMITE_BAIXO_DESEMPENHO_PADRAO;
    baixoDesempenho = [penultimo, ultimo].every((a) => linhaDoAcerto(a).suaPartePorMesCentavos < limite);
  }

  return {
    parceiroId: parceiro.id,
    porAcerto: doPeriodo.map(linhaDoAcerto),
    totais: totaisDeAcertos(doPeriodo),
    maisVendidos,
    itensParados,
    baixoDesempenho,
    retornoExpositor: retornoExpositor(parceiro.id, todos, e.expositores),
  };
}

/**
 * Retorno do investimento no expositor (seção 8.2): lucro acumulado no parceiro ÷ custo dos expositores
 * que estão com ele (qualquer estado, inclusive perdido).
 */
export function retornoExpositor(
  parceiroId: ID,
  acertos: Acerto[],
  expositores: Expositor[],
): RetornoExpositor {
  let suaParte = 0;
  let custo = 0;
  for (const a of acertos) {
    if (a.parceiroId !== parceiroId || a.situacao !== 'concluido') continue;
    suaParte += a.suaParteCentavos;
    for (const it of a.itens) custo += (it.vendidos + it.avariados + it.faltasAbonadas) * (it.custoUnit || 0);
  }
  const lucroAcumuladoCentavos = suaParte - toCents(custo);
  let custoExpositoresCentavos = 0;
  for (const x of expositores) if (x.parceiroId === parceiroId) custoExpositoresCentavos += x.custoCentavos || 0;
  return {
    lucroAcumuladoCentavos,
    custoExpositoresCentavos,
    retorno: custoExpositoresCentavos > 0 ? lucroAcumuladoCentavos / custoExpositoresCentavos : null,
  };
}

export interface LinhaRanking extends TotaisDesempenho {
  parceiro: Parceiro;
}

export interface EntradaRanking {
  parceiros: Parceiro[];
  acertos: Acerto[];
  /** Com período: acertos com data no período. Sem período: últimos `ultimos` acertos de cada parceiro. */
  periodo?: FiltroPeriodo;
  /** Padrão 3. */
  ultimos?: number;
}

/**
 * Ranking de parceiros por sua parte por mês (Σ sua parte ÷ Σ dias × 30 na janela), do maior para o menor.
 * Parceiros sem acerto na janela ficam fora. Empate: maior sua parte, depois nome.
 */
export function rankingParceiros(e: EntradaRanking): LinhaRanking[] {
  const ultimos = e.ultimos ?? ACERTOS_JANELA_RANKING;
  const linhas: LinhaRanking[] = [];
  for (const p of e.parceiros) {
    const todos = acertosConcluidos(e.acertos, p.id);
    const janela = e.periodo ? todos.filter((a) => entre(a.data, e.periodo!.de, e.periodo!.ate)) : todos.slice(-ultimos);
    if (!janela.length) continue;
    linhas.push({ parceiro: p, ...totaisDeAcertos(janela) });
  }
  return linhas.sort(
    (a, b) =>
      b.suaPartePorMesCentavos - a.suaPartePorMesCentavos ||
      b.suaParteCentavos - a.suaParteCentavos ||
      a.parceiro.nome.localeCompare(b.parceiro.nome, 'pt-BR'),
  );
}
