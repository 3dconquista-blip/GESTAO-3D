// Expositores (seção 8.2): patrimônio do dono. Código automático (EXP-01), onde está (parceiro ou Casa),
// estado (ok, danificado, perdido) e arquivamento. Expositor perdido vira perda pelo custo nos relatórios
// (a partir de `perdidoEm` e `custoCentavos`).
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import type { Cents, EstadoExpositor, Expositor, ID, ISODate } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { ErroNegocio } from './estoque.ts';

const ESTADOS: EstadoExpositor[] = ['ok', 'danificado', 'perdido'];

/** Próximo código a partir de uma lista: maior EXP-NN + 1, com no mínimo 2 dígitos ('EXP-01', ..., 'EXP-100'). */
export function codigoSeguinte(codigos: string[]): string {
  let max = 0;
  for (const c of codigos) {
    const m = /^EXP-(\d+)$/i.exec(String(c ?? '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EXP-${String(max + 1).padStart(2, '0')}`;
}

/** Próximo código automático de expositor: 'EXP-01', 'EXP-02', ... (inclui arquivados na contagem). */
export function proximoCodigoExpositor(): string {
  return codigoSeguinte(db.all('expositores').map((e) => e.codigo));
}

/** Expositores (não arquivados) de um parceiro, ou em Casa quando `parceiroId` é null, ordenados pelo código. */
export function expositoresDoParceiro(parceiroId: ID | null): Expositor[] {
  return db
    .all('expositores')
    .filter((e) => !e.arquivado && (e.parceiroId ?? null) === (parceiroId ?? null))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
}

export interface DadosExpositor {
  /** Sem id: cria. Com id: atualiza. */
  id?: ID;
  /** Vazio: código automático (EXP-01...). */
  codigo?: string;
  modelo?: string;
  /** Ganchos ou vagas. */
  capacidade?: number;
  custoCentavos?: Cents;
  /** null = em Casa. Mudar aqui equivale a moverExpositor. */
  parceiroId?: ID | null;
  /** Data de instalação no parceiro (padrão: a data da operação). */
  dataInstalacao?: ISODate;
  /** Mudar aqui equivale a marcarEstadoExpositor. */
  estado?: EstadoExpositor;
  fotoDataUrl?: string;
}

function validarData(data: ISODate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data))) throw new ErroNegocio('Data inválida.');
}

function obter(t: Tx, id: ID): Expositor {
  const e = t.get('expositores', id);
  if (!e) throw new ErroNegocio('Expositor não encontrado.');
  return e;
}

/**
 * Move o expositor para um parceiro (grava a data de instalação) ou para Casa (null), dentro de db.tx.
 * Bloqueia expositor arquivado ou perdido e parceiro arquivado ou com parceria encerrada.
 */
export function moverExpositorTx(t: Tx, id: ID, parceiroId: ID | null, data: ISODate = hojeISO()): Expositor {
  validarData(data);
  const e = obter(t, id);
  if (e.arquivado) throw new ErroNegocio(`O expositor ${e.codigo} está arquivado.`);
  if (e.estado === 'perdido') {
    throw new ErroNegocio(`O expositor ${e.codigo} está marcado como perdido. Se ele foi encontrado, mude o estado para "ok" antes de mover.`);
  }
  if (parceiroId) {
    const p = t.get('parceiros', parceiroId);
    if (!p) throw new ErroNegocio('Parceiro não encontrado.');
    if (p.arquivado || p.situacao === 'encerrado') {
      throw new ErroNegocio(`A parceria com ${p.nome} está encerrada. Escolha outro parceiro ou deixe o expositor em Casa.`);
    }
  }
  if ((e.parceiroId ?? null) === (parceiroId ?? null)) return e;
  if (parceiroId) return t.update('expositores', id, { parceiroId, dataInstalacao: data });
  return t.update('expositores', id, { parceiroId: null, dataInstalacao: undefined });
}

/** Muda o estado dentro de db.tx. 'perdido' grava perdidoEm e tira do parceiro; sair de 'perdido' limpa perdidoEm. */
export function marcarEstadoExpositorTx(t: Tx, id: ID, estado: EstadoExpositor, data: ISODate = hojeISO()): Expositor {
  validarData(data);
  if (!ESTADOS.includes(estado)) throw new ErroNegocio('Estado do expositor inválido.');
  const e = obter(t, id);
  if (e.arquivado) throw new ErroNegocio(`O expositor ${e.codigo} está arquivado.`);
  if (e.estado === estado) return e;
  if (estado === 'perdido') {
    return t.update('expositores', id, { estado, perdidoEm: data, parceiroId: null, dataInstalacao: undefined });
  }
  return t.update('expositores', id, { estado, perdidoEm: undefined });
}

/**
 * Cria ou atualiza um expositor. Código automático quando vazio (único, sem diferenciar maiúsculas);
 * capacidade e custo inteiros ≥ 0. Mudanças de local e de estado seguem as regras de mover/marcar estado.
 */
export function salvarExpositor(dados: DadosExpositor, data?: ISODate): Expositor {
  const dia = data ?? hojeISO();
  return db.tx((t) => {
    const atual = dados.id ? t.get('expositores', dados.id) : undefined;
    if (dados.id && !atual) throw new ErroNegocio('Expositor não encontrado.');
    if (atual?.arquivado) throw new ErroNegocio(`O expositor ${atual.codigo} está arquivado.`);
    const todos = t.all('expositores');

    let codigo = String(dados.codigo ?? atual?.codigo ?? '').trim().toUpperCase();
    if (!codigo) codigo = codigoSeguinte(todos.map((e) => e.codigo));
    const repetido = todos.find((e) => e.id !== atual?.id && e.codigo.trim().toUpperCase() === codigo);
    if (repetido) throw new ErroNegocio(`Já existe um expositor com o código ${codigo}.`);

    const capacidade = dados.capacidade ?? atual?.capacidade ?? 0;
    if (typeof capacidade !== 'number' || !Number.isInteger(capacidade) || capacidade < 0) {
      throw new ErroNegocio('A capacidade precisa ser um número inteiro (0 ou mais).');
    }
    const custoCentavos = dados.custoCentavos ?? atual?.custoCentavos ?? 0;
    if (typeof custoCentavos !== 'number' || !Number.isInteger(custoCentavos) || custoCentavos < 0) {
      throw new ErroNegocio('O custo do expositor não pode ser negativo.');
    }
    if (dados.dataInstalacao) validarData(dados.dataInstalacao);

    const campos = {
      codigo,
      modelo: String(dados.modelo ?? atual?.modelo ?? '').trim(),
      capacidade,
      custoCentavos,
      fotoDataUrl: dados.fotoDataUrl ?? atual?.fotoDataUrl,
    };

    let e: Expositor;
    if (!atual) {
      e = t.insert('expositores', { ...campos, parceiroId: null, estado: 'ok', arquivado: false });
    } else {
      e = t.update('expositores', atual.id, campos);
    }

    if (dados.estado && dados.estado !== e.estado) e = marcarEstadoExpositorTx(t, e.id, dados.estado, dia);
    // Perdido fica fora de qualquer parceiro: o local enviado pelo formulário é ignorado.
    if (e.estado === 'perdido') return e;
    if (dados.parceiroId !== undefined && (dados.parceiroId ?? null) !== (e.parceiroId ?? null)) {
      e = moverExpositorTx(t, e.id, dados.parceiroId ?? null, dados.dataInstalacao ?? dia);
    } else if (dados.dataInstalacao && e.parceiroId && dados.dataInstalacao !== e.dataInstalacao) {
      // Correção da data de instalação no mesmo parceiro.
      e = t.update('expositores', e.id, { dataInstalacao: dados.dataInstalacao });
    }
    return e;
  });
}

/** Move o expositor para um parceiro (data de instalação = `data`) ou de volta para Casa (null). */
export function moverExpositor(id: ID, parceiroId: ID | null, data?: ISODate): Expositor {
  return db.tx((t) => moverExpositorTx(t, id, parceiroId, data ?? hojeISO()));
}

/**
 * Marca o estado do expositor (ok, danificado, perdido). 'perdido' grava perdidoEm (os relatórios contam
 * a perda pelo custo) e tira o expositor do parceiro; voltar de 'perdido' limpa perdidoEm e ele fica em Casa.
 */
export function marcarEstadoExpositor(id: ID, estado: EstadoExpositor, data?: ISODate): Expositor {
  return db.tx((t) => marcarEstadoExpositorTx(t, id, estado, data ?? hojeISO()));
}

/** Arquiva o expositor (nada é apagado). Precisa estar em Casa. */
export function arquivarExpositor(id: ID): Expositor {
  return db.tx((t) => {
    const e = obter(t, id);
    if (e.arquivado) return e;
    if (e.parceiroId) {
      const nome = t.get('parceiros', e.parceiroId)?.nome ?? 'um parceiro';
      throw new ErroNegocio(`O expositor ${e.codigo} está em ${nome}. Mova para Casa antes de arquivar.`);
    }
    return t.update('expositores', id, { arquivado: true });
  });
}

/** Desfaz o arquivamento do expositor (volta para Casa). */
export function desarquivarExpositor(id: ID): Expositor {
  return db.tx((t) => {
    const e = obter(t, id);
    if (!e.arquivado) return e;
    return t.update('expositores', id, { arquivado: false });
  });
}
