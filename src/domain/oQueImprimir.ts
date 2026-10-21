// O que imprimir (seção 7.5). Funções puras.
// necessidade = estoque_mínimo_casa + reposição_prevista + reservado em pedidos − saldo_casa (só se > 0;
//   arredondada para cima, porque a reposição prevista é uma média).
// reposição_prevista = Σ nos parceiros ativos (com o produto no mix) da média de unidades vendidas nos
//   últimos 3 acertos em que o produto estava no expositor; sem histórico, nível ideal − saldo no parceiro (mín. 0).
// Ordem (mais urgente primeiro): falta para pedidos em produção, sem estoque em Casa (≤ 0), abaixo do mínimo,
//   só reposição; dentro do grupo, menor cobertura (saldo ÷ demanda), depois maior necessidade, depois nome.
// Filamento: o das mesas inteiras que serão impressas (mesas × gramas da mesa, como o tempo total);
//   "suficiente" compara o saldo de todas as cores do tipo com a soma da demanda de TODOS os itens da lista.
import type { Acerto, ID, Material, Parceiro, Pedido, Produto, TipoFilamento } from '../data/types.ts';
import { roundTo } from '../lib/money.ts';
import { formatQtd } from '../lib/format.ts';
import { mesasNecessarias } from './consumo.ts';
import { acertosConcluidos } from './desempenho.ts';
import { carreteisDoTipo, tipoDoSlot } from './filamento.ts';

/** Quantos acertos entram na média de vendas da reposição prevista. */
export const ACERTOS_MEDIA_REPOSICAO = 3;

/**
 * Etapas em que os itens de catálogo ficam reservados em Casa (da aprovação até a entrega). 'aprovado' é a etapa
 * obsoleta de pedidos antigos, igual a 'producao'.
 */
export const ETAPAS_RESERVA: Pedido['etapa'][] = ['aprovado', 'producao', 'pronto'];

/** Etapas dos pedidos listados embaixo de "O que imprimir" ("Em produção", inclusive a obsoleta 'aprovado'). */
export const ETAPAS_IMPRIMIR: Pedido['etapa'][] = ['aprovado', 'producao'];

/** Itens de catálogo reservados em Casa por pedidos em produção ou prontos (ainda não baixados). */
export function reservasDePedidos(pedidos: Pedido[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const p of pedidos) {
    if (!ETAPAS_RESERVA.includes(p.etapa) || p.catalogoBaixado) continue;
    for (const it of p.itens) {
      if (it.tipo !== 'catalogo' || !it.produtoId || !(it.quantidade > 0)) continue;
      m.set(it.produtoId, (m.get(it.produtoId) || 0) + it.quantidade);
    }
  }
  return m;
}

/**
 * Reposição prevista de um produto em um parceiro: média de vendidos nos últimos 3 acertos em que o produto
 * estava no expositor; sem histórico, nível ideal − saldo no parceiro (mín. 0). 0 se o produto não está no mix.
 * `historico` = acertos concluídos do parceiro em ordem cronológica.
 */
export function reposicaoNoParceiro(
  produtoId: ID,
  parceiro: Parceiro,
  historico: Acerto[],
  saldoNoParceiro: number,
): number {
  const mix = parceiro.mix.find((m) => m.produtoId === produtoId);
  if (!mix) return 0;
  const vendidos: number[] = [];
  for (let i = historico.length - 1; i >= 0 && vendidos.length < ACERTOS_MEDIA_REPOSICAO; i--) {
    let esperado = 0;
    let v = 0;
    for (const it of historico[i].itens) {
      if (it.produtoId !== produtoId) continue;
      esperado += it.esperado;
      v += it.vendidos;
    }
    if (esperado > 0) vendidos.push(v);
  }
  if (vendidos.length) return vendidos.reduce((s, x) => s + x, 0) / vendidos.length;
  return Math.max(0, (mix.nivelIdeal || 0) - saldoNoParceiro);
}

/** Reposição prevista somada nos parceiros ativos (2 casas decimais). */
export function reposicaoPrevista(
  produtoId: ID,
  parceirosAtivos: Parceiro[],
  acertos: Acerto[],
  saldoParceiro: (produtoId: ID, parceiroId: ID) => number,
): number {
  let total = 0;
  for (const p of parceirosAtivos) {
    if (p.arquivado || p.situacao !== 'ativo') continue;
    total += reposicaoNoParceiro(produtoId, p, acertosConcluidos(acertos, p.id), saldoParceiro(produtoId, p.id));
  }
  return roundTo(total, 2);
}

export type UrgenciaImprimir = 'pedidos' | 'sem_estoque' | 'abaixo_minimo' | 'reposicao';

const ORDEM_URGENCIA: Record<UrgenciaImprimir, number> = { pedidos: 0, sem_estoque: 1, abaixo_minimo: 2, reposicao: 3 };

export interface MesasDoItem {
  mesaId: ID;
  pecasPorMesa: number;
  /** arredondar para cima(necessidade ÷ N) */
  mesas: number;
  /** mesas × tempo da mesa */
  tempoMin: number;
}

export interface FilamentoDoItem {
  /** Tipo de filamento (a cor é escolhida na produção). */
  tipo: TipoFilamento;
  /** Gramas para as peças necessárias deste item. */
  gramas: number;
  /** Saldo atual de todos os carretéis ativos do tipo (g). */
  saldo: number;
  /** O saldo do tipo cobre a demanda de toda a lista. */
  suficiente: boolean;
}

export interface ItemImprimir {
  produtoId: ID;
  produto: Produto;
  saldoCasa: number;
  estoqueMinimo: number;
  /** Média prevista para repor nos parceiros (pode ter casas decimais). */
  reposicaoPrevista: number;
  /** Reservado em pedidos em produção ou prontos. */
  reservado: number;
  /** Peças a imprimir (inteiro > 0). */
  necessidade: number;
  mesas: MesasDoItem[];
  tempoTotalMin: number;
  filamentoNecessario: FilamentoDoItem[];
  /** Todos os filamentos deste item têm saldo para a lista inteira. */
  filamentoSuficiente: boolean;
  urgencia: UrgenciaImprimir;
  /** Texto curto: por que imprimir. */
  motivo: string;
}

export interface ResumoFilamento {
  tipo: TipoFilamento;
  /** Ex.: 'PLA (todas as cores)'. */
  nome: string;
  /** Soma das gramas de todos os itens da lista. */
  necessarioG: number;
  saldoG: number;
  /** Quanto falta (0 se o saldo cobre). */
  faltaG: number;
}

export interface ListaImprimir {
  itens: ItemImprimir[];
  /** Pedidos "Em produção", pelo prazo (sem prazo no fim). */
  pedidos: Pedido[];
  /** Demanda de filamento da lista por tipo (maior falta primeiro). */
  filamentos: ResumoFilamento[];
}

export interface EntradaOQueImprimir {
  produtos: Produto[];
  saldoCasa: (produtoId: ID) => number;
  saldoParceiro: (produtoId: ID, parceiroId: ID) => number;
  /** Parceiros ativos (pausados, encerrados e arquivados são ignorados). */
  parceirosAtivos: Parceiro[];
  /** Acertos de todos os parceiros (os não concluídos são ignorados). */
  acertos: Acerto[];
  /** Itens de catálogo reservados por pedidos (ver reservasDePedidos). */
  reservasPedidos: Map<ID, number>;
  saldoMaterial: (materialId: ID) => number;
  materiais: Material[];
  /** Pedidos "Em produção" (outras etapas são ignoradas). */
  pedidosPersonalizados: Pedido[];
}

function motivoDoItem(saldo: number, minimo: number, reposicao: number, reservado: number): string {
  const partes: string[] = [];
  if (reservado > 0) partes.push(`${formatQtd(reservado)} ${reservado === 1 ? 'reservada' : 'reservadas'} em pedidos`);
  if (saldo < 0) partes.push(`saldo negativo em Casa (${formatQtd(saldo)})`);
  else if (saldo < minimo) partes.push(`abaixo do mínimo em Casa (${formatQtd(saldo)} de ${formatQtd(minimo)})`);
  else if (saldo === 0) partes.push('nada em Casa');
  if (reposicao > 0) partes.push(`reposição prevista nos parceiros: ${formatQtd(reposicao, 1)}`);
  const texto = partes.join('; ');
  return texto ? texto[0].toUpperCase() + texto.slice(1) : '';
}

/**
 * Filamento para imprimir as mesas inteiras (como o tempo total): mesas × gramas da mesa, somado por tipo de
 * filamento (a cor só é escolhida na produção). Ex.: 10 Kettlebell = 2 mesas de 8 = 2 × 64 g = 128 g de PLA.
 */
export function gramasDasMesas(
  produto: Produto,
  mesas: { mesaId: ID; mesas: number }[],
  material?: (id: ID) => Material | undefined,
): { tipo: TipoFilamento; gramas: number }[] {
  const total = new Map<TipoFilamento, number>();
  for (const m of mesas) {
    const mesa = produto.mesas.find((x) => x.id === m.mesaId);
    if (!mesa) continue;
    for (const f of mesa.filamentos) {
      const tipo = tipoDoSlot(f, material);
      total.set(tipo, (total.get(tipo) || 0) + m.mesas * (f.gramas || 0));
    }
  }
  return Array.from(total, ([tipo, gramas]) => ({ tipo, gramas: roundTo(gramas, 2) }));
}

/** Lista "O que imprimir": itens do mais urgente ao menos urgente, pedidos pelo prazo e resumo de filamento. */
export function listaOQueImprimir(e: EntradaOQueImprimir): ListaImprimir {
  const porId = new Map(e.materiais.map((m) => [m.id, m]));
  const material = (id: ID) => porId.get(id);
  const ativos = e.parceirosAtivos.filter((p) => !p.arquivado && p.situacao === 'ativo');
  const historicos = new Map<ID, Acerto[]>(ativos.map((p) => [p.id, acertosConcluidos(e.acertos, p.id)]));

  type Rascunho = Omit<ItemImprimir, 'filamentoNecessario' | 'filamentoSuficiente'> & {
    gramas: { tipo: TipoFilamento; gramas: number }[];
    cobertura: number;
  };
  const rascunhos: Rascunho[] = [];
  for (const produto of e.produtos) {
    if (produto.arquivado) continue;
    const saldo = e.saldoCasa(produto.id);
    const minimo = Math.max(0, produto.estoqueMinimo || 0);
    let repo = 0;
    for (const p of ativos) {
      repo += reposicaoNoParceiro(produto.id, p, historicos.get(p.id) ?? [], e.saldoParceiro(produto.id, p.id));
    }
    const reposicao = roundTo(repo, 2);
    const reservado = Math.max(0, e.reservasPedidos.get(produto.id) || 0);
    const demanda = minimo + reposicao + reservado;
    const necessidade = Math.ceil(roundTo(demanda - saldo, 6));
    if (!(necessidade > 0)) continue;

    const mesas = mesasNecessarias(produto.mesas, necessidade).map((m, i) => ({
      mesaId: m.mesaId,
      pecasPorMesa: produto.mesas[i].pecasPorMesa > 0 ? produto.mesas[i].pecasPorMesa : 1,
      mesas: m.mesas,
      tempoMin: m.tempoMin,
    }));
    const urgencia: UrgenciaImprimir =
      reservado > 0 && reservado > saldo ? 'pedidos' : saldo <= 0 ? 'sem_estoque' : saldo < minimo ? 'abaixo_minimo' : 'reposicao';
    rascunhos.push({
      produtoId: produto.id,
      produto,
      saldoCasa: saldo,
      estoqueMinimo: minimo,
      reposicaoPrevista: reposicao,
      reservado,
      necessidade,
      mesas,
      tempoTotalMin: mesas.reduce((s, m) => s + m.tempoMin, 0),
      gramas: gramasDasMesas(produto, mesas, material),
      urgencia,
      motivo: motivoDoItem(saldo, minimo, reposicao, reservado),
      cobertura: demanda > 0 ? saldo / demanda : saldo < 0 ? -1 : 0,
    });
  }

  // Demanda de filamento da lista inteira, por tipo; o saldo soma todas as cores (carretéis ativos) do tipo.
  const demandaMat = new Map<TipoFilamento, number>();
  for (const r of rascunhos) for (const g of r.gramas) demandaMat.set(g.tipo, (demandaMat.get(g.tipo) || 0) + g.gramas);
  const saldoMat = new Map<TipoFilamento, number>();
  for (const tipo of demandaMat.keys()) {
    saldoMat.set(tipo, roundTo(carreteisDoTipo(e.materiais, tipo).reduce((s, m) => s + Math.max(0, e.saldoMaterial(m.id)), 0), 2));
  }
  const cobre = (tipo: TipoFilamento) => (saldoMat.get(tipo) || 0) + 1e-9 >= (demandaMat.get(tipo) || 0);

  const itens: ItemImprimir[] = rascunhos
    .sort(
      (a, b) =>
        ORDEM_URGENCIA[a.urgencia] - ORDEM_URGENCIA[b.urgencia] ||
        a.cobertura - b.cobertura ||
        b.necessidade - a.necessidade ||
        a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'),
    )
    .map(({ gramas, cobertura: _c, ...r }) => {
      const filamentoNecessario = gramas.map((g) => ({
        tipo: g.tipo,
        gramas: g.gramas,
        saldo: saldoMat.get(g.tipo) || 0,
        suficiente: cobre(g.tipo),
      }));
      return { ...r, filamentoNecessario, filamentoSuficiente: filamentoNecessario.every((f) => f.suficiente) };
    });

  const filamentos: ResumoFilamento[] = Array.from(demandaMat, ([tipo, necessario]) => {
    const necessarioG = roundTo(necessario, 2);
    const saldoG = saldoMat.get(tipo) || 0;
    return { tipo, nome: `${tipo} (todas as cores)`, necessarioG, saldoG, faltaG: Math.max(0, roundTo(necessarioG - saldoG, 2)) };
  }).sort((a, b) => b.faltaG - a.faltaG || a.nome.localeCompare(b.nome, 'pt-BR'));

  const pedidos = e.pedidosPersonalizados
    .filter((p) => ETAPAS_IMPRIMIR.includes(p.etapa))
    .sort((a, b) => {
      if (a.prazo !== b.prazo) {
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return a.prazo < b.prazo ? -1 : 1;
      }
      return a.numero - b.numero;
    });

  return { itens, pedidos, filamentos };
}
