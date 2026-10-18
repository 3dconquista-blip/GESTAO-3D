// Mix do parceiro (seção 8.3): nível ideal sugerido, preço por parceiro e validações. Funções puras.
// O mix é a lista de produtos do expositor com o "nível ideal" (quanto deve ficar após cada reposição)
// e um preço de etiqueta opcional só para aquele parceiro (padrão = etiqueta do produto).
import type { Acerto, Cents, ID, ItemMix, Produto } from '../data/types.ts';
import { roundTo } from '../lib/money.ts';

/** Mínimo de peças por produto na sugestão de nível ideal (seção 8.3). */
export const NIVEL_MINIMO_SUGERIDO = 2;

/** Quantos acertos recentes entram na média de vendas por ciclo (mesmo critério do "O que imprimir", 7.5). */
export const CICLOS_PARA_MEDIA = 3;

/**
 * Nível ideal sugerido (8.3): venda média por ciclo + 30%, arredondado para cima, mínimo 2 por produto.
 * Sem histórico, sugere o mínimo. Ex.: [6, 6, 6] -> 8; [10] -> 13; [] -> 2.
 */
export function nivelIdealSugerido(vendasPorCiclo: number[]): number {
  const v = vendasPorCiclo.filter((x) => Number.isFinite(x)).map((x) => Math.max(0, x));
  if (v.length === 0) return NIVEL_MINIMO_SUGERIDO;
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  // roundTo evita o ruído de ponto flutuante (10 × 1,3 = 13,000000000000002 subiria para 14).
  const sugerido = Math.ceil(roundTo(media * 1.3, 6));
  return Math.max(NIVEL_MINIMO_SUGERIDO, sugerido);
}

/**
 * Unidades vendidas do produto em cada acerto concluído do parceiro (do mais antigo ao mais recente),
 * só nos acertos em que o produto apareceu; devolve os últimos `ultimos` ciclos (0 = todos).
 */
export function vendasPorCiclo(acertos: Acerto[], parceiroId: ID, produtoId: ID, ultimos = CICLOS_PARA_MEDIA): number[] {
  const lista = acertos
    .filter((a) => a.parceiroId === parceiroId && a.situacao === 'concluido')
    .sort((a, b) => (a.data === b.data ? a.criadoEm.localeCompare(b.criadoEm) : a.data < b.data ? -1 : 1));
  const out: number[] = [];
  for (const a of lista) {
    const linhas = a.itens.filter((i) => i.produtoId === produtoId);
    if (linhas.length === 0) continue;
    out.push(linhas.reduce((s, i) => s + (i.vendidos || 0), 0));
  }
  return ultimos > 0 ? out.slice(-ultimos) : out;
}

/** Nível ideal sugerido para um produto do parceiro, a partir do histórico de acertos (últimos 3 ciclos). */
export function nivelSugeridoDoProduto(acertos: Acerto[], parceiroId: ID, produtoId: ID, ultimos = CICLOS_PARA_MEDIA): number {
  return nivelIdealSugerido(vendasPorCiclo(acertos, parceiroId, produtoId, ultimos));
}

/** Preço de etiqueta do produto neste mix: o preço próprio do parceiro ou o padrão do produto (centavos). */
export function precoNoMix(mix: ItemMix[], produto: Pick<Produto, 'id' | 'precoEtiquetaCentavos'>): Cents {
  const item = mix.find((m) => m.produtoId === produto.id);
  if (item?.precoEtiquetaCentavos != null) return item.precoEtiquetaCentavos;
  return produto.precoEtiquetaCentavos || 0;
}

export interface LinhaMix {
  produtoId: ID;
  /** undefined quando o produto não existe mais no cadastro. */
  produto: Produto | undefined;
  nome: string;
  nivelIdeal: number;
  /** Preço usado neste parceiro (próprio ou o de etiqueta do produto). */
  precoCentavos: Cents;
  /** Preço de etiqueta padrão do produto. */
  precoPadraoCentavos: Cents;
  /** O parceiro tem preço próprio para este produto. */
  precoProprio: boolean;
  /** Produto arquivado (continua no mix até o dono tirar). */
  arquivado: boolean;
}

/** Junta o mix com o cadastro de produtos: nome, nível ideal e preço que vale neste parceiro (na ordem do mix). */
export function produtosDoMixComPreco(mix: ItemMix[], produtos: Produto[]): LinhaMix[] {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  return mix.map((m) => {
    const produto = porId.get(m.produtoId);
    const padrao = produto?.precoEtiquetaCentavos || 0;
    const proprio = m.precoEtiquetaCentavos != null;
    return {
      produtoId: m.produtoId,
      produto,
      nome: produto?.nome ?? 'Produto removido',
      nivelIdeal: m.nivelIdeal,
      precoCentavos: proprio ? (m.precoEtiquetaCentavos as Cents) : padrao,
      precoPadraoCentavos: padrao,
      precoProprio: proprio,
      arquivado: !!produto?.arquivado,
    };
  });
}

/**
 * Valida o mix: nível ideal inteiro ≥ 0, sem produto repetido e preço próprio (se houver) inteiro > 0.
 * Devolve a primeira mensagem de erro, ou null se estiver tudo certo.
 */
export function erroMix(mix: ItemMix[], nomeDe: (produtoId: ID) => string = () => 'produto'): string | null {
  const vistos = new Set<ID>();
  for (const m of mix) {
    const nome = nomeDe(m.produtoId);
    if (vistos.has(m.produtoId)) return `O produto "${nome}" aparece duas vezes no mix.`;
    vistos.add(m.produtoId);
    if (typeof m.nivelIdeal !== 'number' || !Number.isInteger(m.nivelIdeal) || m.nivelIdeal < 0) {
      return `O nível ideal de "${nome}" precisa ser um número inteiro (0 ou mais).`;
    }
    if (m.precoEtiquetaCentavos != null && (!Number.isInteger(m.precoEtiquetaCentavos) || m.precoEtiquetaCentavos <= 0)) {
      return `O preço de "${nome}" neste parceiro precisa ser maior que zero.`;
    }
  }
  return null;
}

/**
 * Inclui no mix os produtos levados que ainda não estão nele, com nível ideal = quantidade levada
 * (instalação e reposição avulsa). Itens já no mix não mudam.
 */
export function mesclarNoMix(mix: ItemMix[], itens: { produtoId: ID; quantidade: number }[]): { mix: ItemMix[]; adicionados: ID[] } {
  const novo = mix.map((m) => ({ ...m }));
  const adicionados: ID[] = [];
  for (const it of itens) {
    if (!(it.quantidade > 0)) continue;
    if (novo.some((m) => m.produtoId === it.produtoId)) continue;
    novo.push({ produtoId: it.produtoId, nivelIdeal: it.quantidade });
    adicionados.push(it.produtoId);
  }
  return { mix: novo, adicionados };
}
