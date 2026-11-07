// Ajustes manuais de estoque de produtos (seção 7.2): "Ajuste de inventário" (motivo obrigatório) e "Perda"
// (avaria, falta abonada, defeito, brinde, uso próprio), mais o estorno desses lançamentos manuais
// e o "Valor parado em estoque (a custo)" da lista de produtos (7.1).
import { db } from '../data/db.ts';
import type { Tx } from '../data/db.ts';
import { custoProduto, precoNoParceiro, saldosEstoque } from '../data/selectors.ts';
import { ROTULO_MOTIVO_PERDA } from '../data/defaults.ts';
import type { Cents, ID, ISODate, LocalId, MotivoPerda, MovEstoque } from '../data/types.ts';
import { CASA, parceiroDoLocal } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { round4 } from '../lib/money.ts';
import { idsEstornados } from '../domain/stock.ts';
import { ErroNegocio, estornarMov, lancarMov } from './estoque.ts';

function dataOuHoje(data?: ISODate | null): ISODate {
  if (data == null || data === '') return hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroNegocio('Data inválida.');
  return data;
}

function validarLocal(t: Tx, local: LocalId): void {
  if (local === CASA) return;
  const parceiroId = parceiroDoLocal(local ?? '');
  if (!parceiroId || !t.get('parceiros', parceiroId)) throw new ErroNegocio('Escolha o local: Casa ou um parceiro.');
}

function exigirProduto(t: Tx, produtoId: ID): void {
  if (!t.get('produtos', produtoId)) throw new ErroNegocio('Produto não encontrado.');
}

export interface DadosAjusteInventario {
  produtoId: ID;
  /** 'casa' ou 'p:<parceiroId>'. */
  local: LocalId;
  /** Inteiro diferente de zero: + entra, − sai. */
  quantidade: number;
  /** Obrigatório. */
  motivo: string;
  data?: ISODate;
}

/**
 * "Ajuste de inventário": entra (+) ou sai (−) do local, com motivo obrigatório.
 * Um ajuste de saída não pode deixar o local abaixo de zero.
 */
export function ajusteInventario(dados: DadosAjusteInventario): MovEstoque {
  return db.tx((t) => {
    exigirProduto(t, dados.produtoId);
    validarLocal(t, dados.local);
    const q = dados.quantidade;
    if (!Number.isInteger(q) || q === 0) throw new ErroNegocio('A quantidade precisa ser um número inteiro diferente de zero.');
    const motivo = (dados.motivo ?? '').trim();
    if (!motivo) throw new ErroNegocio('Informe o motivo do ajuste.');
    return lancarMov(t, {
      data: dataOuHoje(dados.data),
      produtoId: dados.produtoId,
      quantidade: Math.abs(q),
      origem: q < 0 ? dados.local : null,
      destino: q > 0 ? dados.local : null,
      tipo: 'ajuste',
      motivo,
      refTipo: 'ajuste',
    });
  });
}

export interface DadosPerda {
  produtoId: ID;
  /** 'casa' ou 'p:<parceiroId>'. */
  local: LocalId;
  /** Inteiro maior que zero. */
  quantidade: number;
  motivo: MotivoPerda;
  /** Texto livre (obrigatório quando o motivo é 'outro'). */
  observacao?: string;
  data?: ISODate;
}

/**
 * "Perda": sai do local pelo custo do produto no momento. Motivos: avaria, falta abonada, defeito, brinde,
 * uso próprio (ou outro). O motivo fica gravado como texto legível ("Avaria — caiu no chão").
 */
export function registrarPerda(dados: DadosPerda): MovEstoque {
  return db.tx((t) => {
    exigirProduto(t, dados.produtoId);
    validarLocal(t, dados.local);
    const q = dados.quantidade;
    if (!Number.isInteger(q) || q <= 0) throw new ErroNegocio('A quantidade perdida precisa ser um número inteiro maior que zero.');
    const rotulo = ROTULO_MOTIVO_PERDA[dados.motivo];
    if (!rotulo) throw new ErroNegocio('Escolha o motivo da perda.');
    const obs = (dados.observacao ?? '').trim();
    if (dados.motivo === 'outro' && !obs) throw new ErroNegocio('Explique o motivo da perda.');
    return lancarMov(t, {
      data: dataOuHoje(dados.data),
      produtoId: dados.produtoId,
      quantidade: q,
      origem: dados.local,
      destino: null,
      tipo: 'perda',
      motivo: obs ? `${rotulo} — ${obs}` : rotulo,
      refTipo: 'perda',
    });
  });
}

const FLUXO_POR_REF: Record<string, string> = {
  venda: 'Esta movimentação é de uma venda. Para desfazer, cancele a venda.',
  producao: 'Esta movimentação é de uma produção. Para desfazer, estorne a produção.',
  acerto: 'Esta movimentação é de um acerto. Para corrigir, reabra o último acerto do parceiro.',
  pedido: 'Esta movimentação é de um pedido. Corrija pelo próprio pedido.',
  exclusao: 'Esta movimentação tirou do estoque as peças de um produto excluído.',
};

function bloqueio(mov: MovEstoque | undefined, movs: MovEstoque[]): string | null {
  if (!mov) return 'Movimentação não encontrada.';
  if (mov.tipo === 'estorno') return 'Não é possível estornar um estorno.';
  if (mov.refTipo && FLUXO_POR_REF[mov.refTipo]) return FLUXO_POR_REF[mov.refTipo];
  if (mov.tipo !== 'ajuste' && mov.tipo !== 'perda') return 'Só ajustes e perdas lançados à mão podem ser estornados aqui.';
  if (mov.refTipo && mov.refTipo !== 'ajuste' && mov.refTipo !== 'perda') return 'Esta movimentação é estornada pelo próprio fluxo que a gerou.';
  if (idsEstornados(movs).has(mov.id)) return 'Esta movimentação já foi estornada.';
  return null;
}

/** Por que a movimentação não pode ser estornada por aqui (null = pode). Para mostrar ou esconder o botão "Estornar". */
export function bloqueioEstornoManual(movId: ID): string | null {
  return bloqueio(db.get('movEstoque', movId), db.all('movEstoque'));
}

/**
 * Estorna um ajuste de inventário ou uma perda lançados à mão (os demais são estornados pelo próprio fluxo:
 * cancelar venda, estornar produção, reabrir acerto). O estorno de uma entrada não pode deixar o local negativo.
 */
export function estornarMovimentoManual(movId: ID, motivo: string, data?: ISODate): MovEstoque {
  return db.tx((t) => {
    const mov = t.get('movEstoque', movId);
    const b = bloqueio(mov, t.all('movEstoque'));
    if (b) throw new ErroNegocio(b);
    const m = (motivo ?? '').trim();
    if (!m) throw new ErroNegocio('Informe o motivo do estorno.');
    return estornarMov(t, movId, m, { data: dataOuHoje(data), permitirNegativo: false });
  });
}

export interface ValorEmEstoque {
  /** Peças (só saldos positivos). */
  pecas: number;
  /** Pelo preço de venda: etiqueta do produto em Casa; nos parceiros, o preço daquele parceiro (decisão 113). */
  vendaCentavos: Cents;
  /** A custo atual do produto (reais). */
  custo: number;
}

/**
 * "Valor parado em estoque" (decisão 113): peças e quanto valem pelo preço de venda (e a custo), em Casa e nos
 * parceiros (soma dos expositores).
 */
export function valorParadoEmEstoque(): { casa: ValorEmEstoque; parceiros: ValorEmEstoque } {
  const casa: ValorEmEstoque = { pecas: 0, vendaCentavos: 0, custo: 0 };
  const parceiros: ValorEmEstoque = { pecas: 0, vendaCentavos: 0, custo: 0 };
  for (const [produtoId, porLocal] of saldosEstoque()) {
    let custo: number | null = null;
    for (const [local, q] of porLocal) {
      if (!(q > 0)) continue;
      if (custo === null) custo = custoProduto(produtoId);
      const pid = parceiroDoLocal(local);
      const parceiro = pid ? db.get('parceiros', pid) : undefined;
      let alvo: ValorEmEstoque;
      let preco: Cents;
      if (local === CASA) {
        alvo = casa;
        preco = db.get('produtos', produtoId)?.precoEtiquetaCentavos || 0;
      } else if (pid) {
        alvo = parceiros;
        preco = parceiro ? precoNoParceiro(parceiro, produtoId) : db.get('produtos', produtoId)?.precoEtiquetaCentavos || 0;
      } else continue;
      alvo.pecas += q;
      alvo.vendaCentavos += q * preco;
      alvo.custo += q * custo;
    }
  }
  casa.custo = round4(casa.custo);
  parceiros.custo = round4(parceiros.custo);
  return { casa, parceiros };
}
