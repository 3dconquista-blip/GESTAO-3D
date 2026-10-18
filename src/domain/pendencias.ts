// Pendências dos acertos (seção 8.7): quanto cada parceiro deve (ou tem a receber do dono).
// Funções puras sobre listas de acertos e pagamentos.
//
// Regras:
// - Só acertos concluídos contam. Valor positivo: o parceiro deve ao dono. Negativo: o dono deve ao parceiro.
// - Saldo do parceiro = soma dos valores dos acertos − recebidos + pagos (estornos anulam o pagamento original).
// - "Pagamentos abatem primeiro o mais antigo": o que já foi quitado (pagamentos e compensação entre
//   acertos positivos e negativos) é distribuído do acerto mais antigo para o mais novo.
// - Pagamento a mais fica como crédito do parceiro.
// - Estorno de pagamento: novo Pagamento com `estornoDe` = id do original (convenção do OCTA: mesma direção e
//   valor negativo). Aqui o estorno sempre anula |valor| na direção do original, qualquer que seja o sinal gravado.
import type { Cents } from '../lib/money.ts';
import type { ISODate } from '../lib/dates.ts';
import { diffDias } from '../lib/dates.ts';
import type { Acerto, ID, Pagamento, StatusPagamento } from '../data/types.ts';

type AcertoPend = Pick<Acerto, 'id' | 'parceiroId' | 'data' | 'criadoEm' | 'situacao' | 'valorAcertoCentavos'>;
type PagamentoPend = Pick<
  Pagamento,
  'id' | 'origem' | 'refId' | 'parceiroId' | 'direcao' | 'valorCentavos' | 'data' | 'criadoEm' | 'tipo' | 'estornoDe'
>;

export interface AlocacaoAcerto {
  acertoId: ID;
  parceiroId: ID;
  data: ISODate;
  /** 'receber': o parceiro deve ao dono; 'pagar': o dono deve ao parceiro. */
  direcao: 'receber' | 'pagar';
  /** Valor do acerto (com sinal: negativo quando o dono deve). */
  devido: Cents;
  /** Quanto já foi quitado (mesmo sinal de `devido`). */
  pago: Cents;
  /** devido − pago (mesmo sinal de `devido`; 0 quando quitado). */
  aberto: Cents;
  status: StatusPagamento;
}

export interface SaldoParceiro {
  parceiroId: ID;
  /** Positivo: o parceiro deve ao dono. Negativo: o dono deve ao parceiro (ou o parceiro tem crédito). */
  saldo: Cents;
  /** max(0, saldo). */
  aReceber: Cents;
  /** max(0, −saldo): inclui acertos negativos em aberto e crédito do parceiro. */
  aPagar: Cents;
  /** Parte de `aPagar` que vem de pagamento a mais (não ligada a nenhum acerto). */
  credito: Cents;
}

export interface ResultadoPendencias {
  /** Acertos concluídos, do mais antigo ao mais novo, com a alocação dos pagamentos. */
  acertos: AlocacaoAcerto[];
  porParceiro: SaldoParceiro[];
  /** Somas de todos os parceiros. */
  aReceber: Cents;
  aPagar: Cents;
  credito: Cents;
}

/** Ordem cronológica: data, depois momento de criação. */
function chave(r: { data: ISODate; criadoEm: string }): string {
  return `${r.data}|${r.criadoEm}`;
}

/** Efeito do pagamento no saldo "o parceiro deve ao dono" (recebido diminui, pago aumenta; estorno desfaz). */
function efeitoPagamento(p: PagamentoPend, porId: Map<ID, PagamentoPend>): Cents {
  const v = Math.abs(p.valorCentavos || 0);
  if (p.estornoDe) {
    const dir = porId.get(p.estornoDe)?.direcao ?? p.direcao;
    return dir === 'recebido' ? v : -v;
  }
  const valor = p.valorCentavos || 0;
  return p.direcao === 'recebido' ? -valor : valor;
}

function soAcertos(pagamentos: PagamentoPend[]): PagamentoPend[] {
  return pagamentos.filter((p) => p.origem === 'acerto');
}

function parceiroDoPagamento(p: PagamentoPend, acertosPorId: Map<ID, AcertoPend>): ID | undefined {
  return p.parceiroId ?? acertosPorId.get(p.refId)?.parceiroId;
}

function statusDe(devido: Cents, pago: Cents): StatusPagamento {
  if (devido === 0 || Math.abs(pago) >= Math.abs(devido)) return 'pago';
  if (pago === 0) return 'pendente';
  return 'parcial';
}

/** Distribui `quitado` entre os valores (mais antigo primeiro). */
function distribuir(valores: Cents[], quitado: Cents): Cents[] {
  let resta = Math.max(0, quitado);
  return valores.map((v) => {
    const p = Math.min(v, resta);
    resta -= p;
    return p;
  });
}

/**
 * Aloca os pagamentos de acerto (origem 'acerto') aos acertos concluídos, por parceiro,
 * abatendo primeiro o mais antigo. Devolve a situação de cada acerto e os saldos.
 */
export function alocarPagamentos(acertos: AcertoPend[], pagamentos: PagamentoPend[]): ResultadoPendencias {
  const concluidos = acertos.filter((a) => a.situacao === 'concluido').sort((a, b) => chave(a).localeCompare(chave(b)));
  const acertosPorId = new Map<ID, AcertoPend>(acertos.map((a) => [a.id, a]));
  const pags = soAcertos(pagamentos);
  const pagPorId = new Map<ID, PagamentoPend>(pags.map((p) => [p.id, p]));

  const parceiros = new Map<ID, { acertos: AcertoPend[]; efeitoPag: Cents }>();
  const grupo = (id: ID) => {
    let g = parceiros.get(id);
    if (!g) parceiros.set(id, (g = { acertos: [], efeitoPag: 0 }));
    return g;
  };
  for (const a of concluidos) grupo(a.parceiroId).acertos.push(a);
  for (const p of pags) {
    const pid = parceiroDoPagamento(p, acertosPorId);
    if (pid) grupo(pid).efeitoPag += efeitoPagamento(p, pagPorId);
  }

  const alocados = new Map<ID, AlocacaoAcerto>();
  const porParceiro: SaldoParceiro[] = [];
  for (const [parceiroId, g] of parceiros) {
    const positivos = g.acertos.filter((a) => a.valorAcertoCentavos > 0);
    const negativos = g.acertos.filter((a) => a.valorAcertoCentavos < 0);
    const somaPos = positivos.reduce((s, a) => s + a.valorAcertoCentavos, 0);
    const somaNeg = negativos.reduce((s, a) => s - a.valorAcertoCentavos, 0);
    const saldo = somaPos - somaNeg + g.efeitoPag;

    // Quanto de cada lado já foi quitado (por pagamento ou compensação entre os lados).
    const quitadoPos = saldo >= 0 ? somaPos - Math.min(saldo, somaPos) : somaPos;
    const abertoNeg = saldo < 0 ? Math.min(-saldo, somaNeg) : 0;
    const quitadoNeg = somaNeg - abertoNeg;
    const credito = saldo < 0 ? -saldo - abertoNeg : 0;

    const pagosPos = distribuir(
      positivos.map((a) => a.valorAcertoCentavos),
      quitadoPos,
    );
    positivos.forEach((a, i) => {
      const devido = a.valorAcertoCentavos;
      alocados.set(a.id, {
        acertoId: a.id,
        parceiroId,
        data: a.data,
        direcao: 'receber',
        devido,
        pago: pagosPos[i],
        aberto: devido - pagosPos[i],
        status: statusDe(devido, pagosPos[i]),
      });
    });
    const pagosNeg = distribuir(
      negativos.map((a) => -a.valorAcertoCentavos),
      quitadoNeg,
    );
    negativos.forEach((a, i) => {
      const devido = a.valorAcertoCentavos;
      const pago = -pagosNeg[i];
      alocados.set(a.id, {
        acertoId: a.id,
        parceiroId,
        data: a.data,
        direcao: 'pagar',
        devido,
        pago,
        aberto: devido - pago,
        status: statusDe(devido, pago),
      });
    });
    for (const a of g.acertos) {
      if (a.valorAcertoCentavos === 0) {
        alocados.set(a.id, {
          acertoId: a.id,
          parceiroId,
          data: a.data,
          direcao: 'receber',
          devido: 0,
          pago: 0,
          aberto: 0,
          status: 'pago',
        });
      }
    }
    porParceiro.push({ parceiroId, saldo, aReceber: Math.max(0, saldo), aPagar: Math.max(0, -saldo), credito });
  }

  const lista = concluidos.map((a) => alocados.get(a.id)).filter((x): x is AlocacaoAcerto => !!x);
  return {
    acertos: lista,
    porParceiro,
    aReceber: porParceiro.reduce((s, p) => s + p.aReceber, 0),
    aPagar: porParceiro.reduce((s, p) => s + p.aPagar, 0),
    credito: porParceiro.reduce((s, p) => s + p.credito, 0),
  };
}

/**
 * Pendência anterior (com sinal): saldo dos acertos concluídos ANTES da referência, considerando só os
 * pagamentos feitos antes dela. Positivo: o parceiro deve ("Pendência anterior: R$ 32,00"); negativo: o dono deve.
 * `antesDe` = data 'YYYY-MM-DD' (rascunho: entra tudo até essa data, inclusive) ou id de um acerto
 * (comprovante: entra o que veio antes dele; o pagamento feito na própria visita não entra).
 * Passe os acertos e pagamentos de UM parceiro.
 */
export function pendenciaAnterior(acertos: AcertoPend[], pagamentos: PagamentoPend[], antesDe: ISODate | ID): Cents {
  const acertosPorId = new Map<ID, AcertoPend>(acertos.map((a) => [a.id, a]));
  const pags = soAcertos(pagamentos);
  const pagPorId = new Map<ID, PagamentoPend>(pags.map((p) => [p.id, p]));
  const ref = acertosPorId.get(antesDe);

  let antesAcerto: (a: AcertoPend) => boolean;
  let antesPag: (p: PagamentoPend) => boolean;
  if (ref) {
    const k = chave(ref);
    antesAcerto = (a) => a.id !== ref.id && a.parceiroId === ref.parceiroId && chave(a) < k;
    antesPag = (p) => {
      const pid = parceiroDoPagamento(p, acertosPorId);
      if (pid !== ref.parceiroId) return false;
      // Pagamento feito na visita de um acerto fica na posição desse acerto.
      const visita = p.tipo === 'acerto' ? acertosPorId.get(p.refId) : undefined;
      if (visita) return visita.id !== ref.id && chave(visita) < k;
      return chave(p) < k;
    };
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(antesDe)) {
    antesAcerto = (a) => a.data <= antesDe;
    antesPag = (p) => p.data <= antesDe;
  } else {
    return 0;
  }

  let saldo = 0;
  for (const a of acertos) if (a.situacao === 'concluido' && antesAcerto(a)) saldo += a.valorAcertoCentavos;
  for (const p of pags) if (antesPag(p)) saldo += efeitoPagamento(p, pagPorId);
  return saldo;
}

export interface PendenciaVencida {
  /** Soma em aberto (o parceiro deve) de acertos com data anterior a hoje. */
  valorCentavos: Cents;
  /** Acertos com pendência vencida (mais antigo primeiro). */
  acertos: AlocacaoAcerto[];
  /** Data do acerto vencido mais antigo. */
  desde: ISODate | null;
  /** Dias desde o acerto vencido mais antigo. */
  dias: number;
}

/**
 * "Pendência vencida": valor que o parceiro deve de acertos com data ANTERIOR a hoje (o acerto não foi pago
 * por inteiro no dia da visita e continua em aberto). O acerto de hoje ainda não está vencido.
 */
export function pendenciaVencida(acertos: AcertoPend[], pagamentos: PagamentoPend[], hoje: ISODate): PendenciaVencida {
  const lista = alocarPagamentos(acertos, pagamentos).acertos.filter((a) => a.direcao === 'receber' && a.aberto > 0 && a.data < hoje);
  const desde = lista.length ? lista[0].data : null;
  return {
    valorCentavos: lista.reduce((s, a) => s + a.aberto, 0),
    acertos: lista,
    desde,
    dias: desde ? diffDias(desde, hoje) : 0,
  };
}
