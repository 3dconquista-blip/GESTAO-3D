// Cadastro de impressoras (seção 6.2).
// custo_hora_máquina = valor_pago ÷ vida_útil_horas + manutenção_por_hora
// Impressoras não são apagadas: são desativadas (os produtos antigos continuam com custo).
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { MODELOS_IMPRESSORA } from '../data/defaults.ts';
import type { ID, Impressora, Novo } from '../data/types.ts';
import { normalizarBusca } from '../lib/format.ts';
import { custoHoraMaquina } from '../domain/pricing.ts';
import { ErroNegocio } from './estoque.ts';

/** Dados do formulário. Campo vazio (undefined/null) usa o valor atual ou o padrão do modelo. */
export interface DadosImpressora {
  /** Impressora existente: edita. Id inexistente: cria com esse id (útil para dados de exemplo). */
  id?: ID;
  /** Padrão: o nome do modelo ("A1 mini", "A1 mini 2"...). */
  nome?: string;
  /** 'A1 mini', 'A1' ou outro texto. Padrão: 'Outra'. */
  modelo?: string;
  /** R$ */
  valorPago?: number | null;
  vidaUtilH?: number | null;
  potenciaW?: number | null;
  /** R$/h */
  manutencaoH?: number | null;
  ativa?: boolean;
}

type PadroesImpressora = Omit<Novo<Impressora>, 'nome'>;

function texto(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function numeroValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Padrões de cadastro pelo modelo (6.2): A1 mini R$ 2.179,00 e 100 W; A1 R$ 2.998,00 e 95 W;
 * vida útil 5.000 h; manutenção R$ 0,05/h. Modelo desconhecido usa os padrões de 'Outra' (valor pago 0).
 */
export function padroesDoModelo(modelo: string | null | undefined): PadroesImpressora {
  const m = texto(modelo);
  const chave = Object.keys(MODELOS_IMPRESSORA).find((k) => normalizarBusca(k) === normalizarBusca(m));
  const base = MODELOS_IMPRESSORA[chave ?? 'Outra'];
  return { ...base, modelo: chave ?? (m || 'Outra') };
}

/** Nome livre a partir do modelo: 'A1 mini', depois 'A1 mini 2', 'A1 mini 3'... */
function nomeLivre(t: Tx, base: string): string {
  const usados = new Set(t.all('impressoras').map((i) => normalizarBusca(i.nome)));
  if (!usados.has(normalizarBusca(base))) return base;
  let n = 2;
  while (usados.has(normalizarBusca(`${base} ${n}`))) n++;
  return `${base} ${n}`;
}

/** Cria ou edita uma impressora dentro de uma transação já aberta (para quem grava vários registros juntos). */
export function salvarImpressoraTx(t: Tx, dados: DadosImpressora): Impressora {
  const atual = dados.id ? t.get('impressoras', dados.id) : undefined;
  const pad = padroesDoModelo(texto(dados.modelo) || atual?.modelo);
  const valorPago = dados.valorPago ?? atual?.valorPago ?? pad.valorPago;
  const vidaUtilH = dados.vidaUtilH ?? atual?.vidaUtilH ?? pad.vidaUtilH;
  const potenciaW = dados.potenciaW ?? atual?.potenciaW ?? pad.potenciaW;
  const manutencaoH = dados.manutencaoH ?? atual?.manutencaoH ?? pad.manutencaoH;

  if (!numeroValido(valorPago) || valorPago < 0) throw new ErroNegocio('O valor pago não pode ser negativo.');
  if (!numeroValido(vidaUtilH) || vidaUtilH <= 0) throw new ErroNegocio('A vida útil (horas) precisa ser maior que zero.');
  if (!numeroValido(potenciaW) || potenciaW < 0) throw new ErroNegocio('A potência (W) não pode ser negativa.');
  if (!numeroValido(manutencaoH) || manutencaoH < 0) throw new ErroNegocio('A manutenção (R$/hora) não pode ser negativa.');

  const campos = {
    nome: texto(dados.nome) || atual?.nome || nomeLivre(t, pad.modelo),
    modelo: pad.modelo,
    valorPago,
    vidaUtilH,
    potenciaW,
    manutencaoH,
    ativa: dados.ativa ?? atual?.ativa ?? true,
  };
  if (atual) return t.update('impressoras', atual.id, campos);
  return t.insert('impressoras', { ...campos, ...(dados.id ? { id: dados.id } : {}) });
}

/**
 * Cria ou edita uma impressora (6.2). Campos não informados vêm do padrão do modelo
 * (MODELOS_IMPRESSORA) na criação, ou ficam como estão na edição.
 */
export function salvarImpressora(dados: DadosImpressora): Impressora {
  return db.tx((t) => salvarImpressoraTx(t, dados));
}

/** Desativa (padrão) ou reativa uma impressora. Produtos que já a usam continuam com o custo calculado. */
export function desativarImpressora(id: ID, ativa = false): Impressora {
  return db.tx((t) => {
    if (!t.get('impressoras', id)) throw new ErroNegocio('Impressora não encontrada.');
    return t.update('impressoras', id, { ativa });
  });
}

/** Custo hora máquina atual da impressora em reais (sem arredondar), ou null se não existir. */
export function custoHoraDe(id: ID): number | null {
  const imp = db.get('impressoras', id);
  return imp ? custoHoraMaquina(imp) : null;
}
