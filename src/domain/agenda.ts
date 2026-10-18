// Agenda de acertos (seção 8.8). Funções puras.
// Próximo acerto = proximoAcerto do último acerto concluído; sem acerto, instalação + frequência.
// Atrasado (vermelho) quando passou da data; vence em até `diasAviso` dias, incluindo hoje
// (amarelo); senão em dia (verde). Parceiros pausados, encerrados ou arquivados ficam fora da lista.
import type { Acerto, Cents, ID, ISODate, Parceiro } from '../data/types.ts';
import { addDias, diffDias } from '../lib/dates.ts';

export type StatusAgenda = 'atrasado' | 'vence_logo' | 'em_dia' | 'sem_instalacao';

export const ROTULO_STATUS_AGENDA: Record<StatusAgenda, string> = {
  atrasado: 'Atrasado',
  vence_logo: 'Vence logo',
  em_dia: 'Em dia',
  sem_instalacao: 'Sem instalação',
};

/** Tom do selo de status (verde, amarelo, vermelho; neutro sem instalação). */
export const TOM_STATUS_AGENDA: Record<StatusAgenda, 'ok' | 'atencao' | 'ruim' | 'neutro'> = {
  atrasado: 'ruim',
  vence_logo: 'atencao',
  em_dia: 'ok',
  sem_instalacao: 'neutro',
};

export interface SituacaoAgenda {
  /** Data prevista do próximo acerto; null quando não há instalação nem acerto. */
  proximoAcerto: ISODate | null;
  /** proximoAcerto − hoje, em dias (negativo = atrasado; 0 = vence hoje). null sem data. */
  diasParaVencer: number | null;
  status: StatusAgenda;
  /** Data do último acerto concluído ou, sem acerto, da instalação. */
  ultimaVisita: ISODate | null;
  /** hoje − ultimaVisita, em dias. null sem visita. */
  diasDesdeUltimaVisita: number | null;
}

/** Último acerto concluído do parceiro (maior data; empate pelo registro mais recente), ou null. */
export function ultimoAcertoConcluido(acertos: Acerto[], parceiroId: ID): Acerto | null {
  let ultimo: Acerto | null = null;
  for (const a of acertos) {
    if (a.parceiroId !== parceiroId || a.situacao !== 'concluido') continue;
    if (!ultimo || a.data > ultimo.data || (a.data === ultimo.data && a.criadoEm > ultimo.criadoEm)) ultimo = a;
  }
  return ultimo;
}

/**
 * Situação do parceiro na agenda: próximo acerto, dias para vencer, status e dias desde a última visita.
 * `ultimoAcerto` deve ser o último acerto concluído (ou null se ainda não houve acerto).
 */
export function statusAgenda(
  parceiro: Parceiro,
  ultimoAcerto: Acerto | null,
  hoje: ISODate,
  diasAviso = 3,
): SituacaoAgenda {
  const ultimaVisita = ultimoAcerto ? ultimoAcerto.data : (parceiro.instaladoEm ?? null);
  const proximoAcerto = ultimoAcerto
    ? ultimoAcerto.proximoAcerto
    : parceiro.instaladoEm
      ? addDias(parceiro.instaladoEm, parceiro.frequenciaDias)
      : null;
  const diasDesdeUltimaVisita = ultimaVisita ? diffDias(ultimaVisita, hoje) : null;
  if (!proximoAcerto) {
    return { proximoAcerto: null, diasParaVencer: null, status: 'sem_instalacao', ultimaVisita, diasDesdeUltimaVisita };
  }
  const diasParaVencer = diffDias(hoje, proximoAcerto);
  const status: StatusAgenda = diasParaVencer < 0 ? 'atrasado' : diasParaVencer <= diasAviso ? 'vence_logo' : 'em_dia';
  return { proximoAcerto, diasParaVencer, status, ultimaVisita, diasDesdeUltimaVisita };
}

/** Texto curto do vencimento: "Atrasado há 3 dias", "Vence hoje", "Vence amanhã", "Vence em 5 dias". */
export function textoVencimento(diasParaVencer: number | null): string {
  if (diasParaVencer == null) return 'Sem instalação';
  if (diasParaVencer < 0) {
    const d = -diasParaVencer;
    return d === 1 ? 'Atrasado há 1 dia' : `Atrasado há ${d} dias`;
  }
  if (diasParaVencer === 0) return 'Vence hoje';
  if (diasParaVencer === 1) return 'Vence amanhã';
  return `Vence em ${diasParaVencer} dias`;
}

export interface CartaoAgenda extends SituacaoAgenda {
  parceiro: Parceiro;
  /** Peças no expositor agora (soma do saldo no local do parceiro). */
  pecasNoExpositor: number;
  ultimoAcerto: Acerto | null;
  /** "Último valor": sua parte do último acerto concluído (centavos); null sem acerto. */
  ultimoValorCentavos: Cents | null;
}

/**
 * Cartões da agenda: só parceiros ativos e não arquivados, ordenados pelo vencimento
 * (mais atrasado primeiro; sem instalação no fim; empate pelo nome).
 * A pendência de cada parceiro é somada pela tela (outro módulo).
 */
export function listaAgenda(
  parceiros: Parceiro[],
  acertos: Acerto[],
  pecasNoExpositor: Record<ID, number>,
  hoje: ISODate,
  diasAviso = 3,
): CartaoAgenda[] {
  const cartoes: CartaoAgenda[] = [];
  for (const p of parceiros) {
    if (p.arquivado || p.situacao !== 'ativo') continue;
    const ultimo = ultimoAcertoConcluido(acertos, p.id);
    cartoes.push({
      ...statusAgenda(p, ultimo, hoje, diasAviso),
      parceiro: p,
      pecasNoExpositor: pecasNoExpositor[p.id] ?? 0,
      ultimoAcerto: ultimo,
      ultimoValorCentavos: ultimo ? ultimo.suaParteCentavos : null,
    });
  }
  return cartoes.sort((a, b) => {
    if (a.proximoAcerto !== b.proximoAcerto) {
      if (!a.proximoAcerto) return 1;
      if (!b.proximoAcerto) return -1;
      return a.proximoAcerto < b.proximoAcerto ? -1 : 1;
    }
    return a.parceiro.nome.localeCompare(b.parceiro.nome, 'pt-BR');
  });
}

/**
 * Bloco "Hoje" do Início: acertos atrasados e acertos que vencem nos próximos `dias` dias
 * (de hoje até hoje + dias, inclusive).
 */
export function resumoAgendaHoje(
  cartoes: CartaoAgenda[],
  dias = 7,
): { atrasados: CartaoAgenda[]; daSemana: CartaoAgenda[] } {
  const atrasados = cartoes.filter((c) => c.status === 'atrasado');
  const daSemana = cartoes.filter((c) => c.diasParaVencer != null && c.diasParaVencer >= 0 && c.diasParaVencer <= dias);
  return { atrasados, daSemana };
}
