// Dados derivados (custos, saldos), recalculados só quando o banco muda (db.version).
import type { Cents } from '../lib/money.ts';
import { round4 } from '../lib/money.ts';
import { db } from './db.ts';
import type { ID, LocalId, Material, ParametrosCusto, Parceiro, Produto, TipoFilamento } from './types.ts';
import { CASA, localParceiro } from './types.ts';
import type { ComposicaoCusto, ContextoCusto, StatusMargem } from '../domain/pricing.ts';
import { composicaoCusto, custosComMargem, statusMargem } from '../domain/pricing.ts';
import { calcularSaldos, calcularSaldosMateriais, resumoSaldos, type SaldosProduto } from '../domain/stock.ts';
import { custoKgDoTipo } from '../domain/filamento.ts';

/** Memoiza o resultado enquanto db.version não mudar. */
export function memo<T>(fn: () => T): () => T {
  let versao = -1;
  let valor: T;
  return () => {
    if (versao !== db.version) {
      valor = fn();
      versao = db.version;
    }
    return valor;
  };
}

/** Memoiza por chave enquanto db.version não mudar. */
export function memoPorChave<T>(fn: (chave: string) => T): (chave: string) => T {
  let versao = -1;
  let mapa = new Map<string, T>();
  return (chave: string) => {
    if (versao !== db.version) {
      mapa = new Map();
      versao = db.version;
    }
    if (!mapa.has(chave)) mapa.set(chave, fn(chave));
    return mapa.get(chave) as T;
  };
}

// ---------------------------------------------------------------- Custos

export const contextoCusto = memo((): ContextoCusto => {
  const imp = new Map(db.all('impressoras').map((i) => [i.id, i]));
  const materiais = db.all('materiais');
  const mat = new Map(materiais.map((m) => [m.id, m]));
  const porTipo = new Map<TipoFilamento, number | undefined>();
  const custoKgTipo = (tipo: TipoFilamento) => {
    if (!porTipo.has(tipo)) porTipo.set(tipo, custoKgDoTipo(materiais, tipo));
    return porTipo.get(tipo);
  };
  return { custos: db.config.custos, impressora: (id) => imp.get(id), material: (id) => mat.get(id), custoKgTipo };
});

export const composicaoProduto = memoPorChave((produtoId): ComposicaoCusto | null => {
  const p = db.get('produtos', produtoId);
  if (!p) return null;
  return composicaoCusto(p, contextoCusto());
});

/** Custo unitário atual do produto (reais, 4 casas). */
export function custoProduto(produtoId: ID): number {
  const c = composicaoProduto(produtoId);
  return c ? round4(c.total) : 0;
}

/** Parâmetros de custo do produto: a margem própria dele (se tiver) no lugar da margem padrão. */
export function custosDoProduto(p: Pick<Produto, 'margemPct'> | null | undefined): ParametrosCusto {
  return custosComMargem(db.config.custos, p?.margemPct);
}

/** Margem do produto em %: a própria ou a padrão. */
export function margemDoProduto(p: Pick<Produto, 'margemPct'> | null | undefined): number {
  return p?.margemPct ?? db.config.custos.margemDesejadaPct;
}

export function statusMargemProduto(p: Produto): StatusMargem {
  return statusMargem(p.precoEtiquetaCentavos, custoProduto(p.id), db.config.canais, custosDoProduto(p));
}

// ---------------------------------------------------------------- Estoque

export const saldosEstoque = memo(() => calcularSaldos(db.all('movEstoque')));

export function saldosDoProduto(produtoId: ID): SaldosProduto {
  return resumoSaldos(saldosEstoque().get(produtoId));
}

export function saldoEm(produtoId: ID, local: LocalId): number {
  return saldosEstoque().get(produtoId)?.get(local) || 0;
}

export function saldoCasa(produtoId: ID): number {
  return saldoEm(produtoId, CASA);
}

export function saldoNoParceiro(produtoId: ID, parceiroId: ID): number {
  return saldoEm(produtoId, localParceiro(parceiroId));
}

/** Itens com saldo no expositor do parceiro: [{ produtoId, qtd }] */
export function estoqueDoParceiro(parceiroId: ID): { produtoId: ID; qtd: number }[] {
  const local = localParceiro(parceiroId);
  const out: { produtoId: ID; qtd: number }[] = [];
  for (const [produtoId, m] of saldosEstoque()) {
    const q = m.get(local) || 0;
    if (q !== 0) out.push({ produtoId, qtd: q });
  }
  return out;
}

export const saldosMateriais = memo(() => calcularSaldosMateriais(db.all('movMateriais')));

/** Saldo do material em gramas (filamento) ou unidades (insumo). */
export function saldoMaterial(materialId: ID): number {
  return saldosMateriais().get(materialId) || 0;
}

// ---------------------------------------------------------------- Cadastros

export function produtosAtivos(): Produto[] {
  return db
    .all('produtos')
    .filter((p) => !p.arquivado)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function materiaisAtivos(tipo?: Material['tipo']): Material[] {
  return db
    .all('materiais')
    .filter((m) => !m.arquivado && (!tipo || m.tipo === tipo))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function parceirosAtivos(): Parceiro[] {
  return db
    .all('parceiros')
    .filter((p) => !p.arquivado && p.situacao === 'ativo')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Nome do produto; produto excluído aparece como "Nome (excluído)" no histórico. */
export function nomeProduto(id: ID | undefined): string {
  const p = id ? db.get('produtos', id) : undefined;
  if (!p) return 'Produto removido';
  return p.excluido ? `${p.nome} (excluído)` : p.nome;
}

export function nomeMaterial(id: ID | undefined): string {
  return (id && db.get('materiais', id)?.nome) || 'Material removido';
}

export function nomeCliente(id: ID | null | undefined): string {
  if (!id) return 'Cliente avulso';
  return db.get('clientes', id)?.nome || 'Cliente removido';
}

/** Preço de etiqueta do produto neste parceiro (preço próprio do mix ou o padrão). */
export function precoNoParceiro(parceiro: Parceiro, produtoId: ID): Cents {
  const item = parceiro.mix.find((m) => m.produtoId === produtoId);
  if (item?.precoEtiquetaCentavos != null) return item.precoEtiquetaCentavos;
  return db.get('produtos', produtoId)?.precoEtiquetaCentavos || 0;
}
