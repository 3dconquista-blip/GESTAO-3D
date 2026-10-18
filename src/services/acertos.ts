// Visita de acerto (seções 8.6 e 8.7): rascunho salvo no aparelho, conclusão, reabertura,
// pagamentos e pendências. As contas ficam em domain/acerto.ts e domain/pendencias.ts.
// O estoque só muda quando o acerto é concluído.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { apagarLocal, lerLocal, salvarLocal } from '../data/local.ts';
import { custoProduto, estoqueDoParceiro, nomeProduto, precoNoParceiro, saldoCasa, saldoNoParceiro } from '../data/selectors.ts';
import type { Acerto, AcertoItem, Cents, FormaPagamento, ID, ISODate, Pagamento, Parceiro } from '../data/types.ts';
import { CASA, localParceiro } from '../data/types.ts';
import { addDias, agoraISO, hojeISO } from '../lib/dates.ts';
import { formatBRL, formatData } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import {
  MOTIVO_CONTAGEM_MAIOR,
  atualizarSugestoes,
  calcularAcerto,
  pctVigente,
  pixInicial,
  precoMudou,
  type LinhaRascunho,
  type RascunhoAcerto,
  type ResultadoAcerto,
} from '../domain/acerto.ts';
import { alocarPagamentos, pendenciaAnterior, pendenciaVencida, type AlocacaoAcerto, type PendenciaVencida, type SaldoParceiro } from '../domain/pendencias.ts';
import { mensagemComprovante } from '../domain/mensagemAcerto.ts';
import { idsEstornados } from '../domain/stock.ts';
import { ErroNegocio, estornarMov, lancarMov } from './estoque.ts';

const chave = (parceiroId: ID) => `rascunho-acerto:${parceiroId}`;

// ---------------------------------------------------------------- Leituras

/** Acertos concluídos do parceiro, do mais antigo ao mais novo. */
export function acertosDoParceiro(parceiroId: ID): Acerto[] {
  return db
    .all('acertos')
    .filter((a) => a.parceiroId === parceiroId && a.situacao === 'concluido')
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
}

/** Último acerto concluído do parceiro, ou null. */
export function ultimoAcerto(parceiroId: ID): Acerto | null {
  const l = acertosDoParceiro(parceiroId);
  return l.length ? l[l.length - 1] : null;
}

/** Início do ciclo atual: último acerto, ou a instalação, ou o início da parceria. */
export function inicioDoCiclo(p: Parceiro): ISODate {
  return ultimoAcerto(p.id)?.data ?? p.instaladoEm ?? p.dataInicio;
}

function pagamentosDoParceiro(parceiroId: ID): Pagamento[] {
  const ids = new Set(db.all('acertos').filter((a) => a.parceiroId === parceiroId).map((a) => a.id));
  return db.all('pagamentos').filter((p) => p.origem === 'acerto' && (p.parceiroId === parceiroId || ids.has(p.refId)));
}

// ---------------------------------------------------------------- Rascunho (só no aparelho)

export function lerRascunho(parceiroId: ID): RascunhoAcerto | null {
  return lerLocal<RascunhoAcerto>(chave(parceiroId));
}

export function salvarRascunho(r: RascunhoAcerto): RascunhoAcerto {
  const atualizado = { ...r, atualizadoEm: agoraISO() };
  salvarLocal(chave(r.parceiroId), atualizado);
  return atualizado;
}

export function apagarRascunho(parceiroId: ID): void {
  apagarLocal(chave(parceiroId));
}

function linhaNova(p: Parceiro, produtoId: ID, esperado: number, anterior?: Acerto | null): LinhaRascunho {
  const item = p.mix.find((m) => m.produtoId === produtoId);
  const precoAnterior = anterior?.itens.find((i) => i.produtoId === produtoId)?.precoUnitCentavos;
  return {
    produtoId,
    esperado,
    contei: esperado,
    avariados: 0,
    recolhidos: 0,
    faltasAbonadas: 0,
    precoUnitCentavos: precoNoParceiro(p, produtoId),
    precoAnteriorCentavos: precoAnterior,
    repostos: 0,
    nivelIdeal: item?.nivelIdeal,
  };
}

/**
 * Monta o rascunho da visita: uma linha por produto com saldo no parceiro (Esperado = saldo do sistema,
 * Contei começa no Esperado) e os produtos do mix com saldo zero. Preço do mix (ou etiqueta), % vigente
 * no início do ciclo, PIX conforme quem recebe e reposição sugerida. Acerto final: recolhe tudo.
 */
export function montarRascunho(parceiroId: ID, data: ISODate = hojeISO(), opts?: { final?: boolean }): RascunhoAcerto {
  const p = db.get('parceiros', parceiroId);
  if (!p) throw new ErroNegocio('Parceiro não encontrado.');
  const anterior = ultimoAcerto(p.id);
  const dataAnterior = anterior?.data ?? p.instaladoEm ?? p.dataInicio;
  const saldos = estoqueDoParceiro(p.id);
  const linhas: LinhaRascunho[] = saldos.map((s) => linhaNova(p, s.produtoId, s.qtd, anterior));
  for (const m of p.mix) {
    if (!linhas.some((l) => l.produtoId === m.produtoId) && !db.get('produtos', m.produtoId)?.arquivado) {
      linhas.push(linhaNova(p, m.produtoId, 0, anterior));
    }
  }
  linhas.sort((a, b) => nomeProduto(a.produtoId).localeCompare(nomeProduto(b.produtoId), 'pt-BR'));
  const r: RascunhoAcerto = {
    parceiroId: p.id,
    data,
    dataAnterior,
    pctParceiro: pctVigente(p, dataAnterior),
    quemRecebe: p.quemRecebe,
    pixDiretoCentavos: pixInicial(p.quemRecebe, 0),
    linhas,
    pagamento: { valorCentavos: null, forma: 'pix', data },
    final: !!opts?.final,
    passo: 1,
    atualizadoEm: agoraISO(),
  };
  return sugerir(r);
}

/** Recalcula a reposição sugerida (linhas não editadas) e o PIX inicial com o saldo atual de Casa. */
export function sugerir(r: RascunhoAcerto): RascunhoAcerto {
  return atualizarSugestoes(r, (produtoId) => saldoCasa(produtoId));
}

/** "Adicionar item encontrado": algo que não estava no sistema (vira ajuste de entrada ao concluir). */
export function adicionarItemEncontrado(r: RascunhoAcerto, produtoId: ID, quantidade = 1): RascunhoAcerto {
  const p = db.get('parceiros', r.parceiroId);
  if (!p) throw new ErroNegocio('Parceiro não encontrado.');
  const existente = r.linhas.find((l) => l.produtoId === produtoId);
  if (existente) {
    return { ...r, linhas: r.linhas.map((l) => (l.produtoId === produtoId ? { ...l, contei: l.contei + quantidade, recontagemConfirmada: true } : l)) };
  }
  const linha = { ...linhaNova(p, produtoId, 0, ultimoAcerto(p.id)), contei: quantidade, encontrado: true };
  return { ...r, linhas: [...r.linhas, linha] };
}

/** Inclui um produto novo na reposição (passo 4), levando `quantidade` de Casa; entra no mix ao concluir. */
export function adicionarProdutoNaReposicao(r: RascunhoAcerto, produtoId: ID, quantidade: number): RascunhoAcerto {
  const p = db.get('parceiros', r.parceiroId);
  if (!p) throw new ErroNegocio('Parceiro não encontrado.');
  if (r.linhas.some((l) => l.produtoId === produtoId)) {
    return { ...r, linhas: r.linhas.map((l) => (l.produtoId === produtoId ? { ...l, repostos: quantidade, repostosEditado: true } : l)) };
  }
  const linha = { ...linhaNova(p, produtoId, 0, ultimoAcerto(p.id)), repostos: quantidade, repostosEditado: true, nivelIdeal: quantidade };
  return { ...r, linhas: [...r.linhas, linha] };
}

/** Pendência de acertos anteriores até a data da visita (positivo: o parceiro deve). */
export function pendenciaDoRascunho(r: RascunhoAcerto): Cents {
  return pendenciaAnterior(acertosDoParceiro(r.parceiroId), pagamentosDoParceiro(r.parceiroId), r.data);
}

/** Totais do rascunho (8.7), com a pendência anterior. */
export function resultadoDoRascunho(r: RascunhoAcerto): ResultadoAcerto {
  return calcularAcerto(r, pendenciaDoRascunho(r));
}

/** Linhas cujo "Esperado" não bate mais com o saldo do sistema (algo mudou desde o início da contagem). */
export function esperadosDesatualizados(r: RascunhoAcerto): string[] {
  const out: string[] = [];
  for (const l of r.linhas) {
    if (l.encontrado && l.esperado === 0) continue;
    const atual = saldoNoParceiro(l.produtoId, r.parceiroId);
    if (atual !== l.esperado) out.push(`${nomeProduto(l.produtoId)}: esperado ${l.esperado}, sistema agora ${atual}`);
  }
  for (const s of estoqueDoParceiro(r.parceiroId)) {
    if (!r.linhas.some((l) => l.produtoId === s.produtoId)) out.push(`${nomeProduto(s.produtoId)}: ${s.qtd} no sistema e fora da contagem`);
  }
  return out;
}

// ---------------------------------------------------------------- Conclusão

/** Por que o rascunho não pode ser concluído (null = pode). */
export function bloqueioConclusao(r: RascunhoAcerto, res: ResultadoAcerto = resultadoDoRascunho(r)): string | null {
  const p = db.get('parceiros', r.parceiroId);
  if (!p) return 'Parceiro não encontrado.';
  if (p.arquivado) return 'Este parceiro está arquivado.';
  if (res.precisaRecontar) return 'Há linhas com "Contei" maior que o "Esperado": reconte e confirme.';
  if (res.erros.length) return res.erros[0].mensagem;
  const ultimo = ultimoAcerto(p.id);
  if (ultimo && r.data < ultimo.data) return `A data da visita não pode ser antes do último acerto (${formatData(ultimo.data)}).`;
  const desatualizados = esperadosDesatualizados(r);
  if (desatualizados.length) return `O estoque do parceiro mudou desde o início da contagem (${desatualizados[0]}). Atualize a contagem.`;
  const totalAbs = Math.abs(res.totalHoje);
  if (res.pagoAgora > totalAbs) {
    return `O valor ${res.totalHoje >= 0 ? 'recebido' : 'pago'} (${formatBRL(res.pagoAgora)}) passa do total de hoje (${formatBRL(totalAbs)}).`;
  }
  for (const l of res.linhas) {
    if (l.repostos > 0 && l.repostos > saldoCasa(l.produtoId) + l.recolhidos) {
      return `Falta estoque em Casa para repor ${nomeProduto(l.produtoId)} (há ${saldoCasa(l.produtoId)}, repor ${l.repostos}).`;
    }
  }
  return null;
}

/** Resumo do que vai acontecer ao concluir (para a confirmação). */
export function previaConclusao(r: RascunhoAcerto): { itens: string[]; bloqueio: string | null; resultado: ResultadoAcerto } {
  const res = resultadoDoRascunho(r);
  const itens: string[] = [];
  const vendidos = res.linhas.filter((l) => l.vendidos > 0);
  itens.push(
    vendidos.length
      ? `Vendidos: ${vendidos.map((l) => `${l.vendidos} ${nomeProduto(l.produtoId)}`).join(', ')} — total ${formatBRL(res.bruto)}`
      : 'Nenhuma venda no período',
  );
  itens.push(`Parte do parceiro ${formatBRL(res.parteParceiro)} · Sua parte ${formatBRL(res.suaParte)}`);
  if (res.pixDireto) itens.push(`Já recebido no seu PIX: ${formatBRL(res.pixDireto)}`);
  if (res.pendenciaAnterior) itens.push(`Pendência anterior: ${formatBRL(res.pendenciaAnterior)}`);
  itens.push(
    res.totalHoje >= 0
      ? `Total a receber hoje: ${formatBRL(res.totalHoje)}; recebido agora ${formatBRL(res.pagoAgora)}${res.restante > 0 ? ` — fica ${formatBRL(res.restante)} a receber` : ''}`
      : `A repassar ao parceiro: ${formatBRL(-res.totalHoje)}; pago agora ${formatBRL(res.pagoAgora)}${res.restante < 0 ? ` — falta repassar ${formatBRL(-res.restante)}` : ''}`,
  );
  const perdas = res.linhas.filter((l) => l.avariados + l.faltasAbonadas > 0);
  if (perdas.length) itens.push(`Perdas pelo custo: ${perdas.map((l) => `${l.avariados + l.faltasAbonadas} ${nomeProduto(l.produtoId)}`).join(', ')}`);
  const ajustes = res.linhas.filter((l) => l.ajusteEntrada > 0);
  if (ajustes.length) itens.push(`Ajuste de entrada (contagem maior): ${ajustes.map((l) => `${l.ajusteEntrada} ${nomeProduto(l.produtoId)}`).join(', ')}`);
  const recolhidos = res.linhas.filter((l) => l.recolhidos > 0);
  if (recolhidos.length) itens.push(`Voltam para Casa: ${recolhidos.map((l) => `${l.recolhidos} ${nomeProduto(l.produtoId)}`).join(', ')}`);
  const repostos = res.linhas.filter((l) => l.repostos > 0);
  itens.push(repostos.length ? `Saem de Casa (reposição): ${repostos.map((l) => `${l.repostos} ${nomeProduto(l.produtoId)}`).join(', ')}` : 'Sem reposição');
  itens.push(`Ficam ${res.estoqueFinalTotal} peças no expositor`);
  return { itens, bloqueio: bloqueioConclusao(r, res), resultado: res };
}

/** Recalcula o status de pagamento (pago/parcial/pendente) de todos os acertos do parceiro. */
function atualizarStatusTx(t: Tx, parceiroId: ID) {
  const acertos = t.all('acertos').filter((a) => a.parceiroId === parceiroId);
  const ids = new Set(acertos.map((a) => a.id));
  const pags = t.all('pagamentos').filter((p) => p.origem === 'acerto' && (p.parceiroId === parceiroId || ids.has(p.refId)));
  for (const al of alocarPagamentos(acertos, pags).acertos) {
    const a = t.get('acertos', al.acertoId);
    if (a && a.statusPagamento !== al.status) t.update('acertos', a.id, { statusPagamento: al.status });
  }
}

/**
 * Conclui o acerto: gera as movimentações (ajuste de entrada, venda no parceiro, perdas, recolhimento e
 * reposição), grava o acerto com a fotografia de preços e percentual, o pagamento recebido (ou pago) e a
 * data do próximo acerto, e recalcula as pendências. Tudo numa transação; depois apaga o rascunho.
 */
export function concluirAcerto(r: RascunhoAcerto): Acerto {
  const res = resultadoDoRascunho(r);
  const bloqueio = bloqueioConclusao(r, res);
  if (bloqueio) throw new ErroNegocio(bloqueio);
  const p = db.get('parceiros', r.parceiroId)!;
  const local = localParceiro(p.id);
  const acertoId = novoId();

  const acerto = db.tx((t) => {
    const ref = { refTipo: 'acerto' as const, refId: acertoId, data: r.data };
    const itens: AcertoItem[] = [];
    for (const l of res.linhas) {
      const custoUnit = custoProduto(l.produtoId);
      const base = { ...ref, produtoId: l.produtoId, custoUnit };
      if (l.ajusteEntrada > 0) {
        lancarMov(t, { ...base, quantidade: l.ajusteEntrada, origem: null, destino: local, tipo: 'ajuste', motivo: MOTIVO_CONTAGEM_MAIOR });
      }
      if (l.vendidos > 0) {
        lancarMov(t, { ...base, quantidade: l.vendidos, origem: local, destino: null, tipo: 'venda_parceiro', precoUnitCentavos: l.precoUnitCentavos });
      }
      if (l.avariados > 0) {
        lancarMov(t, { ...base, quantidade: l.avariados, origem: local, destino: null, tipo: 'perda', motivo: 'Avaria' });
      }
      if (l.faltasAbonadas > 0) {
        lancarMov(t, { ...base, quantidade: l.faltasAbonadas, origem: local, destino: null, tipo: 'perda', motivo: `Falta abonada — ${l.motivoFalta ?? ''}`.trim() });
      }
      if (l.recolhidos > 0) {
        lancarMov(t, { ...base, quantidade: l.recolhidos, origem: local, destino: CASA, tipo: 'recolhimento' });
      }
      if (l.repostos > 0) {
        lancarMov(t, { ...base, quantidade: l.repostos, origem: CASA, destino: local, tipo: 'remessa', precoUnitCentavos: l.precoUnitCentavos });
      }
      itens.push({
        produtoId: l.produtoId,
        esperado: l.esperado,
        contei: l.contei,
        avariados: l.avariados,
        recolhidos: l.recolhidos,
        faltasAbonadas: l.faltasAbonadas,
        motivoFalta: l.motivoFalta,
        ajusteEntrada: l.ajusteEntrada,
        vendidos: l.vendidos,
        precoUnitCentavos: l.precoUnitCentavos,
        valorCentavos: l.valorCentavos,
        repostos: l.repostos,
        estoqueFinal: l.estoqueFinal,
        custoUnit,
        ...(l.encontrado ? { encontrado: true } : {}),
      });
    }

    // Produtos novos no expositor entram no mix.
    const novosNoMix = res.linhas.filter((l) => l.estoqueFinal > 0 && !p.mix.some((m) => m.produtoId === l.produtoId));
    if (novosNoMix.length) {
      t.update('parceiros', p.id, { mix: [...p.mix, ...novosNoMix.map((l) => ({ produtoId: l.produtoId, nivelIdeal: l.nivelIdeal ?? l.estoqueFinal }))] });
    }

    const avisos = res.linhas.filter((l) => precoMudou(l)).map((l) => `Preço de ${nomeProduto(l.produtoId)} mudou de ${formatBRL(l.precoAnteriorCentavos!)} para ${formatBRL(l.precoUnitCentavos)}`);
    const a = t.insert('acertos', {
      id: acertoId,
      parceiroId: p.id,
      data: r.data,
      dataAnterior: r.dataAnterior,
      pctParceiro: r.pctParceiro,
      brutoCentavos: res.bruto,
      parteParceiroCentavos: res.parteParceiro,
      suaParteCentavos: res.suaParte,
      pixDiretoCentavos: res.pixDireto,
      valorAcertoCentavos: res.valorAcerto,
      situacao: 'concluido',
      statusPagamento: 'pendente',
      itens,
      proximoAcerto: addDias(r.data, p.frequenciaDias),
      ...(r.final ? { final: true } : {}),
      ...(avisos.length ? { avisos } : {}),
    });

    if (res.pagoAgora > 0) {
      t.insert('pagamentos', {
        origem: 'acerto',
        refId: acertoId,
        parceiroId: p.id,
        direcao: res.totalHoje >= 0 ? 'recebido' : 'pago',
        valorCentavos: res.pagoAgora,
        forma: r.pagamento.forma,
        data: r.pagamento.data || r.data,
        tipo: 'acerto',
      });
    }
    atualizarStatusTx(t, p.id);
    return t.get('acertos', a.id)!;
  });
  apagarRascunho(p.id);
  return acerto;
}

// ---------------------------------------------------------------- Reabrir

/** Só o último acerto concluído de cada parceiro pode ser reaberto. */
export function podeReabrir(acertoId: ID): boolean {
  const a = db.get('acertos', acertoId);
  if (!a || a.situacao !== 'concluido') return false;
  return ultimoAcerto(a.parceiroId)?.id === a.id;
}

/**
 * "Reabrir acerto": estorna as movimentações e os pagamentos do último acerto do parceiro, marca-o como
 * estornado e devolve o rascunho (salvo no aparelho) para corrigir e concluir de novo.
 */
export function reabrirUltimoAcerto(parceiroId: ID): RascunhoAcerto {
  const a = ultimoAcerto(parceiroId);
  if (!a) throw new ErroNegocio('Este parceiro não tem acerto concluído.');
  const p = db.get('parceiros', parceiroId)!;
  const pagamentoOriginal = db.all('pagamentos').find((x) => x.origem === 'acerto' && x.refId === a.id && x.tipo === 'acerto' && !x.estornoDe);
  db.tx((t) => {
    const movs = t.all('movEstoque');
    const est = idsEstornados(movs);
    const doAcerto = movs.filter((m) => m.refTipo === 'acerto' && m.refId === a.id && m.tipo !== 'estorno' && !est.has(m.id));
    // Desfaz na ordem inversa (reposição primeiro, ajuste de entrada por último).
    for (const m of doAcerto.reverse()) estornarMov(t, m.id, 'Acerto reaberto', { data: hojeISO() });
    const pags = t.all('pagamentos');
    const pagsEst = idsEstornados(pags);
    for (const pg of pags) {
      if (pg.origem !== 'acerto' || pg.refId !== a.id || pg.estornoDe || pagsEst.has(pg.id)) continue;
      t.insert('pagamentos', {
        origem: 'acerto',
        refId: a.id,
        parceiroId: pg.parceiroId ?? parceiroId,
        direcao: pg.direcao === 'recebido' ? 'pago' : 'recebido',
        valorCentavos: pg.valorCentavos,
        forma: pg.forma,
        // Mesma data do pagamento original: os dois se anulam em qualquer conta por data.
        data: pg.data,
        tipo: pg.tipo,
        observacao: 'Estorno: acerto reaberto',
        estornoDe: pg.id,
      });
    }
    t.update('acertos', a.id, { situacao: 'estornado' });
    atualizarStatusTx(t, parceiroId);
  });

  const rascunho: RascunhoAcerto = {
    parceiroId,
    data: a.data,
    dataAnterior: a.dataAnterior,
    pctParceiro: a.pctParceiro,
    quemRecebe: p.quemRecebe,
    pixDiretoCentavos: a.pixDiretoCentavos,
    pixEditado: true,
    linhas: a.itens.map((i) => ({
      produtoId: i.produtoId,
      esperado: i.esperado,
      contei: i.contei,
      avariados: i.avariados,
      recolhidos: i.recolhidos,
      faltasAbonadas: i.faltasAbonadas,
      motivoFalta: i.motivoFalta,
      recontagemConfirmada: i.ajusteEntrada > 0 || undefined,
      precoUnitCentavos: i.precoUnitCentavos,
      repostos: i.repostos,
      repostosEditado: true,
      encontrado: i.encontrado,
      nivelIdeal: p.mix.find((m) => m.produtoId === i.produtoId)?.nivelIdeal,
    })),
    pagamento: { valorCentavos: pagamentoOriginal?.valorCentavos ?? null, forma: pagamentoOriginal?.forma === 'dinheiro' ? 'dinheiro' : 'pix', data: pagamentoOriginal?.data ?? a.data },
    final: a.final,
    passo: 3,
    atualizadoEm: agoraISO(),
  };
  return salvarRascunho(rascunho);
}

// ---------------------------------------------------------------- Pagamentos e pendências

export interface PendenciasParceiro {
  saldo: SaldoParceiro | null;
  acertos: AlocacaoAcerto[];
  vencida: PendenciaVencida;
}

/** Situação financeira do parceiro: saldo (a receber/a pagar/crédito), acertos com alocação e pendência vencida. */
export function pendenciasDoParceiro(parceiroId: ID, hoje: ISODate = hojeISO()): PendenciasParceiro {
  const acertos = acertosDoParceiro(parceiroId);
  const pags = pagamentosDoParceiro(parceiroId);
  const r = alocarPagamentos(acertos, pags);
  return {
    saldo: r.porParceiro.find((s) => s.parceiroId === parceiroId) ?? null,
    acertos: r.acertos,
    vencida: pendenciaVencida(acertos, pags, hoje),
  };
}

/** Total a receber de todos os parceiros e as pendências vencidas (para o Início e a agenda). */
export function resumoPendencias(hoje: ISODate = hojeISO()) {
  const r = alocarPagamentos(db.all('acertos'), db.all('pagamentos'));
  const vencidas = db
    .all('parceiros')
    .map((p) => ({ parceiro: p, vencida: pendenciaVencida(acertosDoParceiro(p.id), pagamentosDoParceiro(p.id), hoje) }))
    .filter((x) => x.vencida.valorCentavos > 0);
  return { aReceber: r.aReceber, aPagar: r.aPagar, porParceiro: r.porParceiro, vencidas };
}

/**
 * Recebe uma pendência fora da visita (ou repassa ao parceiro o que o dono deve). O valor abate os acertos
 * mais antigos primeiro. Não aceita valor acima do que está em aberto.
 */
export function registrarPagamentoParceiro(dados: { parceiroId: ID; valorCentavos: Cents; forma: FormaPagamento; data?: ISODate; direcao?: 'recebido' | 'pago' }): Pagamento {
  const pend = pendenciasDoParceiro(dados.parceiroId);
  const direcao = dados.direcao ?? 'recebido';
  const aberto = direcao === 'recebido' ? (pend.saldo?.aReceber ?? 0) : (pend.saldo?.aPagar ?? 0);
  if (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos <= 0) throw new ErroNegocio('Informe o valor.');
  if (dados.valorCentavos > aberto) throw new ErroNegocio(`O valor passa do que está em aberto (${formatBRL(aberto)}).`);
  const alvo = pend.acertos.find((a) => (direcao === 'recebido' ? a.aberto > 0 : a.aberto < 0)) ?? pend.acertos[pend.acertos.length - 1];
  if (!alvo) throw new ErroNegocio('Este parceiro não tem acerto em aberto.');
  return db.tx((t) => {
    const pg = t.insert('pagamentos', {
      origem: 'acerto',
      refId: alvo.acertoId,
      parceiroId: dados.parceiroId,
      direcao,
      valorCentavos: dados.valorCentavos,
      forma: dados.forma,
      data: dados.data ?? hojeISO(),
      tipo: 'saldo',
    });
    atualizarStatusTx(t, dados.parceiroId);
    return pg;
  });
}

/** Texto do comprovante (8.11) para WhatsApp, cópia e impressão. */
export function textoComprovante(acertoId: ID): string {
  const a = db.get('acertos', acertoId);
  if (!a) throw new ErroNegocio('Acerto não encontrado.');
  const p = db.get('parceiros', a.parceiroId);
  if (!p) throw new ErroNegocio('Parceiro não encontrado.');
  const nomes: Record<ID, string> = {};
  for (const i of a.itens) nomes[i.produtoId] = nomeProduto(i.produtoId);
  const todos = db.all('acertos').filter((x) => x.parceiroId === p.id);
  const pend = pendenciaAnterior(todos, pagamentosDoParceiro(p.id), a.id);
  const { empresa, mensagens } = db.config;
  return mensagemComprovante({
    modelo: mensagens.comprovante_acerto,
    empresa: empresa.nome,
    chavePix: empresa.chavePix,
    nomePix: empresa.nomePix,
    parceiro: p,
    acerto: a,
    nomesProdutos: nomes,
    pendenciaAnteriorCentavos: pend,
  });
}
