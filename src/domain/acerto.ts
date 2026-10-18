// Visita de acerto (seções 8.1, 8.6 e 8.7): rascunho, validações e cálculos exatos em centavos.
// Funções puras: recebem o rascunho e devolvem resultados; quem grava é services/acertos.ts.
//
// Regras principais:
// - vendidos = esperado − contei − faltas_abonadas (nunca negativo).
// - Contei > Esperado: pede recontagem; confirmada, vira ajuste de entrada e a linha fica com 0 vendidos.
// - parte_parceiro = bruto × % ÷ 100, metade para cima; sua_parte = bruto − parte_parceiro.
// - valor_do_acerto = sua_parte − recebido no PIX do dono (negativo: o dono paga ao parceiro).
// - estoque_final = contei − avariados − recolhidos + repostos.
import type { Cents } from '../lib/money.ts';
import { pctOfCents } from '../lib/money.ts';
import type { ISODate, ISODateTime } from '../lib/dates.ts';
import { diffDias } from '../lib/dates.ts';
import type { ID, Parceiro, QuemRecebe } from '../data/types.ts';

/** Motivo do ajuste de entrada criado quando a contagem passa do esperado. */
export const MOTIVO_CONTAGEM_MAIOR = 'contagem maior que o esperado';

/** Formas aceitas no pagamento do acerto. */
export type FormaPagamentoAcerto = 'pix' | 'dinheiro';

/** Uma linha (produto) do rascunho do acerto. Quantidades são inteiros ≥ 0. */
export interface LinhaRascunho {
  produtoId: ID;
  /** Saldo do sistema no parceiro quando o rascunho foi montado. */
  esperado: number;
  contei: number;
  /** Estão lá, mas estragados: viram perda pelo custo. */
  avariados: number;
  /** Bons, voltam para Casa. */
  recolhidos: number;
  /** Sumiram e o dono decidiu não cobrar (motivo obrigatório). */
  faltasAbonadas: number;
  motivoFalta?: string;
  /** O dono confirmou a recontagem quando Contei > Esperado. */
  recontagemConfirmada?: boolean;
  /** Preço unitário desta linha (editável). */
  precoUnitCentavos: Cents;
  /** Preço no acerto anterior (para o aviso amarelo "preço mudou"). */
  precoAnteriorCentavos?: Cents;
  /** Quantidade levada de Casa para o expositor nesta visita. */
  repostos: number;
  /** O dono mexeu na reposição: a sugestão não sobrescreve mais. */
  repostosEditado?: boolean;
  /** Item encontrado que não estava no sistema (não pede recontagem). */
  encontrado?: boolean;
  /** Nível ideal do mix (undefined = produto fora do mix). */
  nivelIdeal?: number;
}

export interface PagamentoRascunho {
  /** Valor recebido agora (ou pago ao parceiro, se o total for negativo). null = campo vazio. */
  valorCentavos: Cents | null;
  forma: FormaPagamentoAcerto;
  data: ISODate;
}

/** Rascunho do acerto, salvo só no aparelho a cada alteração. */
export interface RascunhoAcerto {
  parceiroId: ID;
  /** Data da visita. */
  data: ISODate;
  /** Data do acerto anterior (ou da instalação / início). */
  dataAnterior: ISODate;
  /** % do parceiro vigente no início do ciclo. */
  pctParceiro: number;
  quemRecebe: QuemRecebe;
  /** "Recebido no seu PIX no período". null = campo vazio (vale 0). */
  pixDiretoCentavos: Cents | null;
  /** O dono editou o PIX: a sincronização automática não sobrescreve mais. */
  pixEditado?: boolean;
  linhas: LinhaRascunho[];
  pagamento: PagamentoRascunho;
  /** Acerto final (encerrar parceria): recolhe tudo, sem reposição. */
  final?: boolean;
  /** Passo da tela (1 Contagem, 2 Ocorrências, 3 Resumo, 4 Reposição, 5 Pagamento). */
  passo: number;
  atualizadoEm: ISODateTime;
}

export type TipoErroAcerto = 'recontar' | 'erro';

export interface ErroLinha {
  /** Campo da linha (ou do rascunho) com problema. */
  campo: string;
  mensagem: string;
  /** 'recontar' = Contei > Esperado sem confirmação; 'erro' = valor inválido. */
  tipo: TipoErroAcerto;
}

export interface ErroAcerto extends ErroLinha {
  /** Produto da linha, ou null para erros do acerto inteiro. */
  produtoId: ID | null;
  /** Índice da linha em `linhas`, ou null. */
  indice: number | null;
}

export interface LinhaCalculada {
  vendidos: number;
  /** Unidades a mais (Contei − Esperado) que viram ajuste de entrada. */
  ajusteEntrada: number;
  valorCentavos: Cents;
  estoqueFinal: number;
}

export interface ResultadoAcerto {
  linhas: (LinhaRascunho & LinhaCalculada)[];
  /** "Total vendido". */
  bruto: Cents;
  /** "Parte do parceiro". */
  parteParceiro: Cents;
  /** "Sua parte". */
  suaParte: Cents;
  /** "Recebido no seu PIX no período" (vazio = 0). */
  pixDireto: Cents;
  /** "Valor do acerto" = sua parte − PIX. Negativo: o dono paga ao parceiro. */
  valorAcerto: Cents;
  /** Pendências de acertos anteriores (positivo: o parceiro deve; negativo: o dono deve). */
  pendenciaAnterior: Cents;
  /** "Total a receber hoje" = valor do acerto + pendência anterior (negativo: a repassar ao parceiro). */
  totalHoje: Cents;
  /** Pagamento informado agora (vazio = 0). */
  pagoAgora: Cents;
  /** O que sobra depois do pagamento: positivo fica "A receber"; negativo, o dono ainda deve ao parceiro. */
  restante: Cents;
  pecasVendidas: number;
  esperadoTotal: number;
  estoqueFinalTotal: number;
  repostosTotal: number;
  /** Dias do período (data − data anterior). */
  dias: number;
  /** Peças vendidas por dia (0 quando o período tem 0 dia). */
  mediaPorDia: number;
  /** Fração vendidos ÷ esperado (0,375 = 37,5%). */
  giro: number;
  /** Todos os erros de validação (incluindo recontagens pendentes). Concluir exige lista vazia. */
  erros: ErroAcerto[];
  /** Alguma linha pede recontagem. */
  precisaRecontar: boolean;
}

function inteiroNaoNegativo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const CAMPOS_QTD: [keyof LinhaRascunho, string][] = [
  ['contei', 'Contei'],
  ['avariados', 'Avariados'],
  ['recolhidos', 'Recolhidos'],
  ['faltasAbonadas', 'Faltas abonadas'],
  ['repostos', 'Reposição'],
];

/** Valida uma linha: recontagem (Contei > Esperado), Avariados + Recolhidos ≤ Contei, faltas ≤ Esperado − Contei, motivo. */
export function validarLinha(linha: LinhaRascunho): ErroLinha[] {
  const erros: ErroLinha[] = [];
  let numerosOk = true;
  if (!inteiroNaoNegativo(linha.esperado)) {
    numerosOk = false;
    erros.push({
      campo: 'esperado',
      tipo: 'erro',
      mensagem:
        typeof linha.esperado === 'number' && linha.esperado < 0
          ? 'O saldo do sistema neste parceiro está negativo. Faça um ajuste de estoque antes do acerto.'
          : '"Esperado" precisa ser um número inteiro, zero ou maior.',
    });
  }
  for (const [campo, rotulo] of CAMPOS_QTD) {
    if (!inteiroNaoNegativo(linha[campo])) {
      numerosOk = false;
      erros.push({ campo, tipo: 'erro', mensagem: `"${rotulo}" precisa ser um número inteiro, zero ou maior.` });
    }
  }
  if (!inteiroNaoNegativo(linha.precoUnitCentavos)) {
    erros.push({ campo: 'precoUnitCentavos', tipo: 'erro', mensagem: 'O preço precisa ser zero ou maior.' });
  }
  if (!numerosOk) return erros;

  const { esperado, contei, avariados, recolhidos, faltasAbonadas } = linha;
  if (contei > esperado && !linha.recontagemConfirmada && !linha.encontrado) {
    erros.push({ campo: 'contei', tipo: 'recontar', mensagem: '"Contei" maior que o "Esperado": peça para recontar.' });
  }
  if (avariados + recolhidos > contei) {
    erros.push({
      campo: 'avariados',
      tipo: 'erro',
      mensagem: `"Avariados" + "Recolhidos" não pode passar de "Contei" (${contei}).`,
    });
  }
  const maxFaltas = Math.max(0, esperado - contei);
  if (faltasAbonadas > maxFaltas) {
    erros.push({
      campo: 'faltasAbonadas',
      tipo: 'erro',
      mensagem: `"Faltas abonadas" não pode passar de "Esperado" − "Contei" (${maxFaltas}).`,
    });
  }
  if (faltasAbonadas > 0 && !(linha.motivoFalta ?? '').trim()) {
    erros.push({ campo: 'motivoFalta', tipo: 'erro', mensagem: 'Informe o motivo da falta abonada.' });
  }
  return erros;
}

/**
 * Calcula a linha: vendidos, ajuste de entrada, valor e estoque final.
 * Contei > Esperado → ajuste de entrada = diferença e 0 vendidos (nunca venda negativa).
 */
export function calcularLinha(linha: LinhaRascunho): LinhaCalculada {
  const esperado = n(linha.esperado);
  const contei = n(linha.contei);
  let vendidos = 0;
  let ajusteEntrada = 0;
  if (contei > esperado) ajusteEntrada = contei - esperado;
  else vendidos = Math.max(0, esperado - contei - n(linha.faltasAbonadas));
  return {
    vendidos,
    ajusteEntrada,
    valorCentavos: vendidos * n(linha.precoUnitCentavos),
    estoqueFinal: contei - n(linha.avariados) - n(linha.recolhidos) + n(linha.repostos),
  };
}

/**
 * Totais do acerto (seção 8.7), exatos em centavos, e todos os erros de validação.
 * `pendenciaAnterior` (opcional, ver domain/pendencias.ts) entra só no "Total a receber hoje".
 */
export function calcularAcerto(rascunho: RascunhoAcerto, pendenciaAnterior: Cents = 0): ResultadoAcerto {
  const erros: ErroAcerto[] = [];
  const vistos = new Set<ID>();
  const linhas = rascunho.linhas.map((l, i) => {
    for (const e of validarLinha(l)) erros.push({ ...e, produtoId: l.produtoId, indice: i });
    if (vistos.has(l.produtoId)) {
      erros.push({ campo: 'produtoId', tipo: 'erro', mensagem: 'Produto repetido no acerto.', produtoId: l.produtoId, indice: i });
    }
    vistos.add(l.produtoId);
    const calc = { ...l, ...calcularLinha(l) };
    if (rascunho.final) {
      if (calc.repostos > 0) {
        erros.push({ campo: 'repostos', tipo: 'erro', mensagem: 'No acerto final não há reposição.', produtoId: l.produtoId, indice: i });
      }
      if (calc.repostos === 0 && calc.estoqueFinal > 0) {
        erros.push({
          campo: 'recolhidos',
          tipo: 'erro',
          mensagem: 'No acerto final, recolha tudo o que ficou no expositor.',
          produtoId: l.produtoId,
          indice: i,
        });
      }
    }
    return calc;
  });

  const geral = (campo: string, mensagem: string) => erros.push({ campo, tipo: 'erro', mensagem, produtoId: null, indice: null });
  if (linhas.length === 0) geral('linhas', 'Nenhum produto na contagem.');
  const pct = rascunho.pctParceiro;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    geral('pctParceiro', 'O percentual do parceiro precisa estar entre 0 e 100.');
  }
  if (rascunho.data < rascunho.dataAnterior) geral('data', 'A data do acerto não pode ser antes do acerto anterior.');
  if (rascunho.pixDiretoCentavos != null && !inteiroNaoNegativo(rascunho.pixDiretoCentavos)) {
    geral('pixDiretoCentavos', '"Recebido no seu PIX no período" precisa ser zero ou maior.');
  }
  const pg = rascunho.pagamento?.valorCentavos ?? null;
  if (pg != null && !inteiroNaoNegativo(pg)) geral('pagamento', 'O valor do pagamento precisa ser zero ou maior.');

  let bruto = 0;
  let pecasVendidas = 0;
  let esperadoTotal = 0;
  let estoqueFinalTotal = 0;
  let repostosTotal = 0;
  for (const l of linhas) {
    bruto += l.valorCentavos;
    pecasVendidas += l.vendidos;
    esperadoTotal += n(l.esperado);
    estoqueFinalTotal += l.estoqueFinal;
    repostosTotal += n(l.repostos);
  }
  const parteParceiro = pctOfCents(bruto, n(pct));
  const suaParte = bruto - parteParceiro;
  const pixDireto = n(rascunho.pixDiretoCentavos ?? 0);
  const valorAcerto = suaParte - pixDireto;
  const totalHoje = valorAcerto + n(pendenciaAnterior);
  const pagoAgora = n(pg ?? 0);
  const restante = totalHoje >= 0 ? totalHoje - pagoAgora : totalHoje + pagoAgora;
  const dias = diffDias(rascunho.dataAnterior, rascunho.data);

  return {
    linhas,
    bruto,
    parteParceiro,
    suaParte,
    pixDireto,
    valorAcerto,
    pendenciaAnterior: n(pendenciaAnterior),
    totalHoje,
    pagoAgora,
    restante,
    pecasVendidas,
    esperadoTotal,
    estoqueFinalTotal,
    repostosTotal,
    dias,
    mediaPorDia: dias > 0 ? pecasVendidas / dias : 0,
    giro: esperadoTotal > 0 ? pecasVendidas / esperadoTotal : 0,
    erros,
    precisaRecontar: erros.some((e) => e.tipo === 'recontar'),
  };
}

export interface SugestaoReposicao {
  /** Quanto levar de Casa: nível ideal − (Contei − Avariados − Recolhidos), entre 0 e o saldo em Casa. */
  sugerida: number;
  /** Parte que falta em Casa (vai para "O que imprimir"). */
  falta: number;
  /** Necessidade total antes de limitar ao saldo em Casa. */
  necessidade: number;
}

/** Sugestão de reposição da linha (passo 4), limitada ao saldo em Casa. */
export function reposicaoSugerida(linha: LinhaRascunho, nivelIdeal: number, saldoCasa: number): SugestaoReposicao {
  const ficam = n(linha.contei) - n(linha.avariados) - n(linha.recolhidos);
  const necessidade = Math.max(0, Math.floor(n(nivelIdeal)) - ficam);
  const sugerida = Math.min(necessidade, Math.max(0, Math.floor(n(saldoCasa))));
  return { sugerida, falta: necessidade - sugerida, necessidade };
}

/** Valor inicial de "Recebido no seu PIX no período": parceiro → 0 (campo escondido), PIX do dono → bruto, ambos → vazio. */
export function pixInicial(quemRecebe: QuemRecebe, bruto: Cents): Cents | null {
  if (quemRecebe === 'parceiro') return 0;
  if (quemRecebe === 'pix_dono') return bruto;
  return null;
}

/**
 * Reaplica as sugestões depois de mudar a contagem: reposição sugerida nas linhas não editadas
 * (acerto final: recolhe tudo e não repõe) e o PIX inicial enquanto o dono não o editou.
 */
export function atualizarSugestoes(rascunho: RascunhoAcerto, saldoCasa: (produtoId: ID) => number): RascunhoAcerto {
  const linhas = rascunho.linhas.map((l) => {
    if (rascunho.final) return { ...l, recolhidos: Math.max(0, n(l.contei) - n(l.avariados)), repostos: 0 };
    if (l.repostosEditado) return l;
    return { ...l, repostos: reposicaoSugerida(l, l.nivelIdeal ?? 0, saldoCasa(l.produtoId)).sugerida };
  });
  let pix = rascunho.pixDiretoCentavos;
  if (rascunho.quemRecebe === 'parceiro') pix = 0;
  else if (!rascunho.pixEditado) {
    const bruto = linhas.reduce((s, l) => s + calcularLinha(l).valorCentavos, 0);
    pix = pixInicial(rascunho.quemRecebe, bruto);
  }
  return { ...rascunho, linhas, pixDiretoCentavos: pix };
}

/** O preço da linha é diferente do preço do acerto anterior (aviso amarelo). */
export function precoMudou(linha: Pick<LinhaRascunho, 'precoUnitCentavos' | 'precoAnteriorCentavos'>): boolean {
  return linha.precoAnteriorCentavos != null && linha.precoAnteriorCentavos !== linha.precoUnitCentavos;
}

/**
 * % do parceiro vigente quando o ciclo começou (a mudança de divisão vale a partir do próximo acerto):
 * a última entrada de `percentuais` com vigenteDesde ≤ início do ciclo; senão a mais antiga; senão pctParceiro.
 */
export function pctVigente(parceiro: Pick<Parceiro, 'pctParceiro' | 'percentuais'>, inicioCiclo: ISODate): number {
  const lista = [...(parceiro.percentuais ?? [])].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  if (lista.length === 0) return parceiro.pctParceiro;
  let pct: number | null = null;
  for (const p of lista) if (p.vigenteDesde <= inicioCiclo) pct = p.pct;
  return pct ?? lista[0].pct;
}
