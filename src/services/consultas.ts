// Consultas de análise (somente leitura): agenda de acertos, desempenho e ranking de parceiros,
// "O que imprimir", alertas de estoque e bloco "Hoje" do Início.
// Junta os dados do banco (db + selectors) e chama as funções puras de domain/. NUNCA grava.
// Resultados memoizados enquanto db.version não mudar: não altere os objetos devolvidos.
import { db } from '../data/db.ts';
import { memoPorChave, saldoCasa, saldoMaterial, saldoNoParceiro, saldosEstoque } from '../data/selectors.ts';
import type { ID, ISODate, Parceiro } from '../data/types.ts';
import { parceiroDoLocal } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { listaAgenda, resumoAgendaHoje, type CartaoAgenda } from '../domain/agenda.ts';
import {
  desempenhoParceiro,
  rankingParceiros,
  type DesempenhoParceiro,
  type FiltroPeriodo,
  type LinhaRanking,
} from '../domain/desempenho.ts';
import { ETAPAS_IMPRIMIR, listaOQueImprimir, reservasDePedidos, type ListaImprimir } from '../domain/oQueImprimir.ts';
import { alertasEstoque, type AlertaEstoque } from '../domain/alertas.ts';

const chavePeriodo = (periodo?: FiltroPeriodo) => (periodo ? `${periodo.de}|${periodo.ate}` : '');

function ativos(): Parceiro[] {
  return db.all('parceiros').filter((p) => !p.arquivado && p.situacao === 'ativo');
}

/** Peças no expositor de cada parceiro: soma dos saldos positivos no local do parceiro. */
export function pecasNosExpositores(): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const porLocal of saldosEstoque().values()) {
    for (const [local, q] of porLocal) {
      const pid = parceiroDoLocal(local);
      if (pid && q > 0) out[pid] = (out[pid] || 0) + q;
    }
  }
  return out;
}

/** Itens de catálogo reservados em Casa por pedidos aprovados, em produção ou prontos (ainda não baixados). */
export function reservasAtuais(): Map<ID, number> {
  return reservasDePedidos(db.all('pedidos'));
}

const agendaMemo = memoPorChave((hoje): CartaoAgenda[] =>
  listaAgenda(db.all('parceiros'), db.all('acertos'), pecasNosExpositores(), hoje, db.config.parcerias?.diasAviso ?? 3),
);

/** Agenda de acertos: parceiros ativos ordenados pelo vencimento (mais atrasado primeiro). */
export function agendaAtual(hoje: ISODate = hojeISO()): CartaoAgenda[] {
  return agendaMemo(hoje);
}

const desempenhoMemo = memoPorChave((chave): DesempenhoParceiro | null => {
  const [parceiroId, de, ate] = chave.split('|');
  const parceiro = db.get('parceiros', parceiroId);
  if (!parceiro) return null;
  return desempenhoParceiro({
    parceiro,
    acertos: db.all('acertos'),
    expositores: db.all('expositores'),
    periodo: de && ate ? { de, ate } : undefined,
    limiteBaixoDesempenhoCentavos: db.config.parcerias?.limiteBaixoDesempenhoCentavos,
    impostoPct: db.config.custos?.impostoPct ?? 0,
    saldoAtual: (produtoId) => saldoNoParceiro(produtoId, parceiroId),
    parceiros: db.all('parceiros'),
  });
});

/** Desempenho do parceiro (histórico, totais, mais vendidos, itens parados, baixo desempenho, retorno do expositor). null se não existir. */
export function desempenhoDoParceiro(parceiroId: ID, periodo?: FiltroPeriodo): DesempenhoParceiro | null {
  return desempenhoMemo(`${parceiroId}|${chavePeriodo(periodo)}`);
}

const rankingMemo = memoPorChave((chave): LinhaRanking[] => {
  const [de, ate] = chave.split('|');
  const periodo = de && ate ? { de, ate } : undefined;
  // Com período: todos os não arquivados (inclusive encerrados, pelo histórico). Sem período: ativos e pausados.
  const parceiros = db
    .all('parceiros')
    .filter((p) => !p.arquivado && (periodo || p.situacao !== 'encerrado'));
  return rankingParceiros({ parceiros, acertos: db.all('acertos'), periodo });
});

/** Ranking por sua parte por mês: no período (se informado) ou nos últimos 3 acertos de cada parceiro. */
export function rankingAtual(periodo?: FiltroPeriodo): LinhaRanking[] {
  return rankingMemo(chavePeriodo(periodo));
}

const imprimirMemo = memoPorChave(
  (): ListaImprimir =>
    listaOQueImprimir({
      produtos: db.all('produtos'),
      saldoCasa,
      saldoParceiro: saldoNoParceiro,
      parceirosAtivos: ativos(),
      acertos: db.all('acertos'),
      reservasPedidos: reservasAtuais(),
      saldoMaterial,
      materiais: db.all('materiais'),
      pedidosPersonalizados: db.all('pedidos').filter((p) => ETAPAS_IMPRIMIR.includes(p.etapa)),
    }),
);

/** Lista "O que imprimir" com os dados atuais. */
export function oQueImprimirAtual(): ListaImprimir {
  return imprimirMemo('');
}

const alertasMemo = memoPorChave(
  (hoje): AlertaEstoque[] =>
    alertasEstoque({
      produtos: db.all('produtos'),
      saldos: saldosEstoque(),
      materiais: db.all('materiais'),
      saldoMaterial,
      movEstoque: db.all('movEstoque'),
      hoje,
      diasSemVenda: db.config.estoque?.diasSemVendaAlerta,
      parceiros: db.all('parceiros'),
    }),
);

/** Alertas de estoque atuais (vermelhos primeiro). */
export function alertasAtuais(hoje: ISODate = hojeISO()): AlertaEstoque[] {
  return alertasMemo(hoje);
}

export interface ResumoHoje {
  /** Acertos atrasados. */
  acertosAtrasados: CartaoAgenda[];
  /** Acertos que vencem de hoje até daqui a 7 dias. */
  acertosDaSemana: CartaoAgenda[];
  alertas: AlertaEstoque[];
}

/** Bloco "Hoje" do Início (parte de acertos e estoque; pedidos e total a receber vêm de outros módulos). */
export function resumoHoje(hoje: ISODate = hojeISO()): ResumoHoje {
  const { atrasados, daSemana } = resumoAgendaHoje(agendaAtual(hoje), 7);
  return { acertosAtrasados: atrasados, acertosDaSemana: daSemana, alertas: alertasAtuais(hoje) };
}
