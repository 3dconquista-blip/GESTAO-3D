// Cadastro de produtos (seção 7.1) e prévia de custo da ficha técnica (seção 6.3).
// Toda gravação passa por db.tx (atômica). Arquivar esconde e permite reativar; excluir marca o produto como
// excluído (some do app de vez), mas o registro fica para o histórico de movimentações, vendas e acertos.
// O preço de etiqueta nunca muda sozinho: mudar custos só gera alerta de margem (6.3).
// O produto não tem cor (decisão 85): a ficha guarda o tipo de filamento e a cor é escolhida em cada produção.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { contextoCusto } from '../data/selectors.ts';
import type { Canal, Cents, Componente, ID, ISODate, LicencaVenda, Mesa, MesaFilamento, Produto } from '../data/types.ts';
import { CASA, parceiroDoLocal } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { normalizarBusca } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import { arredondarPreco, round4, toReais } from '../lib/money.ts';
import { numeroPedido } from '../domain/pedidos.ts';
import { custoKgDoTipo, TIPO_PADRAO, TIPOS_FILAMENTO } from '../domain/filamento.ts';
import type { ComposicaoCusto, ContextoCusto, Simulacao, StatusMargem } from '../domain/pricing.ts';
import {
  canaisAtivos,
  composicaoCusto,
  custosComMargem,
  erroParametros,
  etiquetaSugerida,
  precoSugerido,
  simular,
  statusMargem,
} from '../domain/pricing.ts';
import { ErroNegocio, lancarMov, saldoTx } from './estoque.ts';

/** Mão de obra por peça padrão, em minutos (6.3). */
export const MAO_DE_OBRA_PADRAO_MIN = 2;

/** Mesa como vem do formulário: o id é gerado quando ausente. */
export interface MesaEntrada {
  id?: ID;
  /** "Peças desta mesa" (N): inteiro, 1 ou mais. */
  pecasPorMesa: number;
  /** "Tempo da mesa" em minutos. */
  tempoMin: number;
  /** Vazio: a primeira impressora ativa (com uma só impressora o formulário nem pergunta). */
  impressoraId?: ID;
  /** Um ou mais filamentos (tipo + gramas da mesa inteira); a cor é escolhida na produção. */
  filamentos: MesaFilamento[];
}

/** Dados do formulário de produto. Com `id` de um produto existente, edita; sem `id`, cria. */
export interface DadosProduto {
  /** Produto existente: edita. Id inexistente: cria com esse id (útil para dados de exemplo). */
  id?: ID;
  nome: string;
  /** Opcional: sem ela, vale a do último produto cadastrado. */
  categoria?: string;
  fotoDataUrl?: string;
  /** Padrão na criação: a etiqueta sugerida (maior preço sugerido entre os canais ativos). */
  precoEtiquetaCentavos?: Cents;
  /** Estoque mínimo em Casa (padrão 0). */
  estoqueMinimo?: number;
  /** Mão de obra por peça em minutos (padrão 2). */
  maoDeObraMin?: number;
  mesas: MesaEntrada[];
  componentes?: Componente[];
  /** Padrão 'proprio'. */
  origemModelo?: 'proprio' | 'terceiro';
  linkModelo?: string;
  /** Padrão para modelo de terceiro sem resposta: 'nao_sei'. */
  licencaVenda?: LicencaVenda;
  /** Margem de lucro própria (%). null = usar a margem padrão da configuração; ausente na edição = mantém. */
  margemPct?: number | null;
  arquivado?: boolean;
}

/** Ficha técnica para a prévia de custo (mesas ainda sem id são aceitas). */
export interface FichaPrevia {
  mesas: MesaEntrada[];
  componentes: Componente[];
  maoDeObraMin: number;
}

export interface SugestaoCanal {
  canal: Canal;
  /** Preço exato antes do arredondamento (reais), ou null se houver erro. */
  exato: number | null;
  /** Preço sugerido arredondado conforme a configuração (centavos), ou null se houver erro. */
  centavos: Cents | null;
  /** Explicação quando os parâmetros impedem o cálculo (ex.: comissão de 100%). */
  erro: string | null;
}

export interface PreviaCusto {
  /** Composição por peça (material, energia, máquina, falhas, componentes, mão de obra), em reais. */
  composicao: ComposicaoCusto;
  /** Custo unitário com 4 casas (o mesmo que a lista de produtos mostra). */
  custoUnit: number;
  /** Preço sugerido por canal ativo. */
  sugestoes: SugestaoCanal[];
  /** Etiqueta sugerida = maior preço sugerido entre os canais ativos (centavos), ou null se houver erro. */
  etiquetaSugeridaCentavos: Cents | null;
  /** Erro geral dos parâmetros (margem ≥ 100%), ou null. */
  erro: string | null;
  /** Simulação do preço de etiqueta informado, por canal ativo (null sem preço). */
  simulacao: Simulacao | null;
  /** Cor de status da margem com o preço informado (null sem preço). */
  status: StatusMargem | null;
}

const LICENCAS: LicencaVenda[] = ['sim', 'nao', 'nao_sei'];

function texto(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function numeroValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Código automático do produto: 7 -> 'P-0007'. */
export function formatarCodigoProduto(n: number): string {
  return `P-${String(n).padStart(4, '0')}`;
}

/** Contexto de custo que enxerga o que já foi gravado na transação. */
function contextoTx(t: Tx): ContextoCusto {
  return {
    custos: db.config.custos,
    impressora: (id) => t.get('impressoras', id),
    material: (id) => t.get('materiais', id),
    custoKgTipo: (tipo) => custoKgDoTipo(t.all('materiais'), tipo),
  };
}

/** Reserva o próximo código livre (P-0001, P-0002...) e avança o contador na mesma transação. */
function proximoCodigoTx(t: Tx): string {
  const usados = new Set(t.all('produtos').map((p) => p.codigo));
  let n = Math.max(1, Math.floor(db.config.proximoCodigoProduto || 1));
  while (usados.has(formatarCodigoProduto(n))) n++;
  t.config({ proximoCodigoProduto: n + 1 });
  return formatarCodigoProduto(n);
}

/** Devolve a grafia cadastrada da categoria; se ainda não existir na lista, inclui. */
function categoriaTx(t: Tx, nome: string): string {
  const alvo = normalizarBusca(nome);
  const existente = db.config.categorias.find((c) => normalizarBusca(c) === alvo);
  if (existente) return existente;
  t.config((c) => ({ ...c, categorias: [...c.categorias, nome] }));
  return nome;
}

/** Impressora usada quando a ficha não diz: a primeira ativa pelo nome (com uma só, é ela). */
function impressoraPadraoTx(t: Pick<Tx, 'all'>): ID | undefined {
  return t
    .all('impressoras')
    .filter((i) => i.ativa)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0]?.id;
}

/** Impressora padrão para o formulário novo (a primeira ativa). */
export function impressoraPadrao(): ID | undefined {
  return impressoraPadraoTx({ all: (col) => db.all(col) });
}

/** Categoria quando o produto não informa: a do último produto cadastrado, ou a primeira da lista. */
function categoriaPadraoTx(t: Pick<Tx, 'all'>): string {
  const ultimo = t
    .all('produtos')
    .filter((p) => !p.excluido)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0];
  return ultimo?.categoria || db.config.categorias[0] || 'Outro';
}

function validarMesas(t: Tx, mesas: MesaEntrada[] | undefined): Mesa[] {
  if (!Array.isArray(mesas) || mesas.length === 0) {
    throw new ErroNegocio('Adicione pelo menos uma mesa na ficha técnica.');
  }
  const ids = new Set<ID>();
  return mesas.map((m, i) => {
    const rotulo = `Mesa ${i + 1}`;
    const impressoraId = m.impressoraId || impressoraPadraoTx(t);
    if (!impressoraId || !t.get('impressoras', impressoraId)) {
      throw new ErroNegocio(t.all('impressoras').some((x) => x.ativa) ? `${rotulo}: escolha a impressora.` : 'Cadastre uma impressora em Configurações antes do produto.');
    }
    if (!Number.isInteger(m.pecasPorMesa) || m.pecasPorMesa < 1) {
      throw new ErroNegocio(`${rotulo}: "Peças desta mesa" precisa ser um número inteiro, 1 ou mais.`);
    }
    if (!numeroValido(m.tempoMin) || m.tempoMin <= 0) {
      throw new ErroNegocio(`${rotulo}: informe o tempo da mesa.`);
    }
    if (!Array.isArray(m.filamentos) || m.filamentos.length === 0) {
      throw new ErroNegocio(`${rotulo}: informe pelo menos um filamento, com as gramas da mesa inteira.`);
    }
    // O produto guarda só o TIPO do filamento; um carretel informado fica como cor sugerida para a produção.
    const filamentos = m.filamentos.map((f) => {
      const mat = f.materialId ? t.get('materiais', f.materialId) : undefined;
      if (f.materialId && !mat) throw new ErroNegocio(`${rotulo}: o filamento escolhido não existe mais.`);
      if (mat && mat.tipo !== 'filamento') throw new ErroNegocio(`${rotulo}: "${mat.nome}" não é um filamento.`);
      const tipo = f.tipo ?? mat?.material ?? TIPO_PADRAO;
      if (!TIPOS_FILAMENTO.includes(tipo)) throw new ErroNegocio(`${rotulo}: tipo de filamento inválido.`);
      if (!numeroValido(f.gramas) || f.gramas <= 0) {
        throw new ErroNegocio(`${rotulo}: informe as gramas de ${tipo} (do fatiador, da mesa inteira).`);
      }
      return mat ? { tipo, materialId: mat.id, gramas: f.gramas } : { tipo, gramas: f.gramas };
    });
    const id = m.id && !ids.has(m.id) ? m.id : novoId();
    ids.add(id);
    return { id, pecasPorMesa: m.pecasPorMesa, tempoMin: m.tempoMin, impressoraId, filamentos };
  });
}

/** Margem própria do produto: vazia = padrão da configuração; senão de 0% até menos de 100%. */
function validarMargem(margemPct: number | null | undefined): number | null {
  if (margemPct == null) return null;
  if (!numeroValido(margemPct) || margemPct < 0 || margemPct >= 100) {
    throw new ErroNegocio('A margem de lucro do produto precisa ficar entre 0% e 99%.');
  }
  return margemPct;
}

function validarComponentes(t: Tx, componentes: Componente[] | undefined): Componente[] {
  return (componentes ?? []).map((c) => {
    const mat = c.materialId ? t.get('materiais', c.materialId) : undefined;
    if (!mat) throw new ErroNegocio('Escolha um componente cadastrado em Materiais.');
    if (mat.tipo !== 'insumo') {
      throw new ErroNegocio(`"${mat.nome}" não é um insumo. Componentes são itens como argola, corrente e saquinho.`);
    }
    if (!numeroValido(c.quantidade) || c.quantidade <= 0) {
      throw new ErroNegocio(`A quantidade de "${mat.nome}" por peça precisa ser maior que zero.`);
    }
    return { materialId: c.materialId, quantidade: c.quantidade };
  });
}

/**
 * Cria ou edita um produto dentro de uma transação já aberta (para quem grava vários registros juntos).
 * Na criação gera o código automático e aplica os padrões; na edição mantém o código.
 */
export function salvarProdutoTx(t: Tx, dados: DadosProduto): Produto {
  const atual = dados.id ? t.get('produtos', dados.id) : undefined;
  if (atual?.excluido) throw new ErroNegocio('Este produto foi excluído e não pode mais ser alterado.');
  // Na edição, campos ausentes mantêm o valor atual.
  const d: DadosProduto = atual ? { ...atual, ...dados } : dados;

  const nome = texto(d.nome);
  if (!nome) throw new ErroNegocio('Informe o nome do produto.');
  // Categoria é opcional: sem ela, vale a do último produto cadastrado (ou a primeira da lista).
  const categoriaInformada = texto(d.categoria) || categoriaPadraoTx(t);

  const maoDeObraMin = d.maoDeObraMin ?? MAO_DE_OBRA_PADRAO_MIN;
  if (!numeroValido(maoDeObraMin) || maoDeObraMin < 0) {
    throw new ErroNegocio('A mão de obra por peça (min) não pode ser negativa.');
  }
  const estoqueMinimo = d.estoqueMinimo ?? 0;
  if (!Number.isInteger(estoqueMinimo) || estoqueMinimo < 0) {
    throw new ErroNegocio('O estoque mínimo em Casa precisa ser um número inteiro, 0 ou mais.');
  }
  const origemModelo = d.origemModelo ?? 'proprio';
  if (origemModelo !== 'proprio' && origemModelo !== 'terceiro') {
    throw new ErroNegocio('Escolha a origem do modelo: próprio ou de terceiro.');
  }
  let licencaVenda = d.licencaVenda || undefined;
  if (licencaVenda && !LICENCAS.includes(licencaVenda)) {
    throw new ErroNegocio('Licença permite venda: escolha sim, não ou não sei.');
  }
  if (origemModelo === 'terceiro' && !licencaVenda) licencaVenda = 'nao_sei';

  const mesas = validarMesas(t, d.mesas);
  const componentes = validarComponentes(t, d.componentes);
  const margemPct = validarMargem(d.margemPct);

  let precoEtiquetaCentavos = d.precoEtiquetaCentavos;
  if (precoEtiquetaCentavos == null) {
    const custo = composicaoCusto({ mesas, componentes, maoDeObraMin }, contextoTx(t)).total;
    precoEtiquetaCentavos = etiquetaSugerida(custo, db.config.canais, custosComMargem(db.config.custos, margemPct)) ?? 0;
  }
  if (!Number.isInteger(precoEtiquetaCentavos) || precoEtiquetaCentavos < 0) {
    throw new ErroNegocio('O preço de etiqueta precisa ser um valor em reais, 0 ou mais.');
  }

  const campos = {
    nome,
    categoria: categoriaTx(t, categoriaInformada),
    fotoDataUrl: d.fotoDataUrl || undefined,
    precoEtiquetaCentavos,
    estoqueMinimo,
    maoDeObraMin,
    mesas,
    componentes,
    origemModelo,
    linkModelo: texto(d.linkModelo) || undefined,
    licencaVenda,
    margemPct: margemPct ?? undefined,
    arquivado: d.arquivado ?? false,
  };
  if (atual) return t.update('produtos', atual.id, campos);
  return t.insert('produtos', { ...campos, codigo: proximoCodigoTx(t), ...(dados.id ? { id: dados.id } : {}) });
}

/**
 * Cria ou edita um produto (7.1). Na criação: código automático P-0001 (sequência da configuração),
 * mão de obra 2 min, estoque mínimo 0, origem própria, ativo. Erros de regra lançam ErroNegocio.
 */
export function salvarProduto(dados: DadosProduto): Produto {
  return db.tx((t) => salvarProdutoTx(t, dados));
}

/** Nome livre para a cópia: 'Nome "cópia"', depois 'Nome "cópia 2"', 'Nome "cópia 3"'... */
export function nomeDaCopia(nome: string, existentes: Iterable<string>): string {
  const usados = new Set(Array.from(existentes, (n) => normalizarBusca(n)));
  let candidato = `${nome} "cópia"`;
  for (let n = 2; usados.has(normalizarBusca(candidato)); n++) candidato = `${nome} "cópia ${n}"`;
  return candidato;
}

/**
 * "Copiar produto" (um clique): novo produto com tudo igual — modelo, cor, categoria, foto, ficha técnica, preço,
 * mínimo, margem e licença —, nome com "cópia" entre aspas, código novo e estoque zerado.
 */
export function copiarProduto(produtoId: ID): Produto {
  return db.tx((t) => {
    const orig = t.get('produtos', produtoId);
    if (!orig || orig.excluido) throw new ErroNegocio('Produto não encontrado.');
    const nomes = t
      .all('produtos')
      .filter((p) => !p.excluido)
      .map((p) => p.nome);
    return salvarProdutoTx(t, {
      nome: nomeDaCopia(orig.nome, nomes),
      categoria: orig.categoria,
      fotoDataUrl: orig.fotoDataUrl,
      precoEtiquetaCentavos: orig.precoEtiquetaCentavos,
      estoqueMinimo: orig.estoqueMinimo,
      maoDeObraMin: orig.maoDeObraMin,
      mesas: orig.mesas.map(({ id: _id, ...m }) => ({ ...m, filamentos: m.filamentos.map((f) => ({ ...f })) })),
      componentes: orig.componentes.map((c) => ({ ...c })),
      origemModelo: orig.origemModelo,
      linkModelo: orig.linkModelo,
      licencaVenda: orig.licencaVenda,
      margemPct: orig.margemPct ?? null,
    });
  });
}

/** Arquiva (some das listas e seleções, mantém o histórico) ou reativa um produto. */
export function arquivarProduto(id: ID, arquivado = true): Produto {
  return db.tx((t) => arquivarProdutoTx(t, id, arquivado));
}

function arquivarProdutoTx(t: Tx, id: ID, arquivado: boolean): Produto {
  const p = t.get('produtos', id);
  if (!p) throw new ErroNegocio('Produto não encontrado.');
  if (p.excluido) throw new ErroNegocio(`"${p.nome}" foi excluído e não pode ser reativado.`);
  return t.update('produtos', id, { arquivado });
}

// ---------------------------------------------------------------- Excluir

export interface PreviaExclusao {
  produto: Produto;
  /** Peças em Casa que saem do estoque com um ajuste "Produto excluído" (negativo: saldo a zerar). */
  emCasa: number;
  /** Parceiros cujo mix perde este produto. */
  mixes: string[];
  /** Motivo que impede excluir (peças em parceiro ou pedido em aberto), ou null. */
  bloqueio: string | null;
}

/** Só leitura: serve tanto dentro de uma transação quanto direto no banco. */
type Leitor = Pick<Tx, 'get' | 'all'>;

function previaExclusaoTx(t: Leitor, id: ID): PreviaExclusao {
  const produto = t.get('produtos', id);
  if (!produto || produto.excluido) throw new ErroNegocio('Produto não encontrado.');
  const porParceiro = new Map<ID, number>();
  for (const mv of t.all('movEstoque')) {
    if (mv.produtoId !== id) continue;
    const de = mv.origem ? parceiroDoLocal(mv.origem) : null;
    const para = mv.destino ? parceiroDoLocal(mv.destino) : null;
    if (de) porParceiro.set(de, (porParceiro.get(de) || 0) - mv.quantidade);
    if (para) porParceiro.set(para, (porParceiro.get(para) || 0) + mv.quantidade);
  }
  const comPecas = Array.from(porParceiro).filter(([, q]) => q !== 0);
  let bloqueio: string | null = null;
  if (comPecas.length) {
    const lista = comPecas.map(([pid, q]) => `${t.get('parceiros', pid)?.nome ?? 'parceiro'} (${q})`).join(', ');
    bloqueio = `"${produto.nome}" ainda tem peças em parceiros: ${lista}. Recolha ou faça o acerto antes de excluir.`;
  }
  const pedidos = t
    .all('pedidos')
    .filter((pd) => pd.etapa !== 'entregue' && pd.etapa !== 'cancelado' && pd.itens.some((i) => i.tipo === 'catalogo' && i.produtoId === id));
  if (!bloqueio && pedidos.length) {
    bloqueio = `"${produto.nome}" está em pedido em aberto (${pedidos.map((pd) => numeroPedido(pd.numero)).join(', ')}). Tire do pedido ou conclua antes de excluir.`;
  }
  const mixes = t
    .all('parceiros')
    .filter((pa) => pa.mix.some((m) => m.produtoId === id))
    .map((pa) => pa.nome);
  return { produto, emCasa: saldoTx(t, id, CASA), mixes, bloqueio };
}

/** O que acontece ao excluir o produto (para a confirmação). Não grava. */
export function previaExclusao(id: ID): PreviaExclusao {
  return previaExclusaoTx({ get: (col, i) => db.get(col, i), all: (col) => db.all(col) }, id);
}

function excluirProdutoTx(t: Tx, id: ID, data: ISODate): Produto {
  const pr = previaExclusaoTx(t, id);
  if (pr.bloqueio) throw new ErroNegocio(pr.bloqueio);
  const base = { data, produtoId: id, tipo: 'ajuste' as const, motivo: 'Produto excluído', refTipo: 'exclusao' as const, refId: id };
  if (pr.emCasa > 0) lancarMov(t, { ...base, quantidade: pr.emCasa, origem: CASA, destino: null });
  if (pr.emCasa < 0) lancarMov(t, { ...base, quantidade: -pr.emCasa, origem: null, destino: CASA });
  for (const pa of t.all('parceiros')) {
    if (pa.mix.some((m) => m.produtoId === id)) t.update('parceiros', pa.id, { mix: pa.mix.filter((m) => m.produtoId !== id) });
  }
  return t.update('produtos', id, { excluido: true, excluidoEm: data, arquivado: true });
}

/**
 * Exclui o produto: some das listas, seleções e relatórios de produtos, e não volta. O histórico continua:
 * movimentações, vendas, acertos e pedidos antigos mostram "Nome (excluído)". Peças em Casa saem com um ajuste
 * "Produto excluído" (não conta como perda); o produto sai do mix dos parceiros. Bloqueia se houver peças em
 * parceiros ou pedido em aberto com o produto.
 */
export function excluirProduto(id: ID, data: ISODate = hojeISO()): Produto {
  return db.tx((t) => excluirProdutoTx(t, id, data));
}

// ---------------------------------------------------------------- Edição em massa

export type AjustePreco =
  | { modo: 'definir'; centavos: Cents }
  /** Reajuste percentual (+10 sobe 10%, −5 desce 5%), arredondado como os preços sugeridos. */
  | { modo: 'percentual'; pct: number }
  /** Etiqueta sugerida de cada produto (custo atual e margem do produto). */
  | { modo: 'sugerido' };

export interface EdicaoEmMassa {
  categoria?: string;
  estoqueMinimo?: number;
  /** Número = margem própria; null = voltar à margem padrão; ausente = não mexe. */
  margemPct?: number | null;
  preco?: AjustePreco;
  /** true arquiva, false reativa. */
  arquivado?: boolean;
}

/**
 * Novo preço de etiqueta de um produto com o ajuste em massa (centavos), ou null se não der para sugerir.
 * `margemPct` é a margem que o produto vai ter depois da edição (null = padrão).
 */
export function precoEmMassa(p: Produto, ajuste: AjustePreco, margemPct: number | null, ctx: ContextoCusto = contextoCusto()): Cents | null {
  if (ajuste.modo === 'definir') return ajuste.centavos;
  if (ajuste.modo === 'percentual') {
    return arredondarPreco(toReais(p.precoEtiquetaCentavos) * (1 + ajuste.pct / 100), db.config.custos.arredondamento);
  }
  const custo = composicaoCusto(p, ctx).total;
  return etiquetaSugerida(custo, db.config.canais, custosComMargem(db.config.custos, margemPct));
}

/** Aplica as mesmas alterações a vários produtos, tudo ou nada. Devolve os produtos alterados. */
export function editarProdutosEmMassa(ids: ID[], e: EdicaoEmMassa): Produto[] {
  if (!ids.length) throw new ErroNegocio('Selecione pelo menos um produto.');
  return db.tx((t) => {
    const ctx = contextoTx(t);
    const categoria = e.categoria != null && texto(e.categoria) ? categoriaTx(t, texto(e.categoria)) : undefined;
    if (e.estoqueMinimo != null && (!Number.isInteger(e.estoqueMinimo) || e.estoqueMinimo < 0)) {
      throw new ErroNegocio('O estoque mínimo em Casa precisa ser um número inteiro, 0 ou mais.');
    }
    const margem = e.margemPct === undefined ? undefined : validarMargem(e.margemPct);
    if (e.preco?.modo === 'definir' && (!Number.isInteger(e.preco.centavos) || e.preco.centavos < 0)) {
      throw new ErroNegocio('O preço de etiqueta precisa ser um valor em reais, 0 ou mais.');
    }
    if (e.preco?.modo === 'percentual' && (!numeroValido(e.preco.pct) || e.preco.pct <= -100)) {
      throw new ErroNegocio('O reajuste precisa ser maior que −100%.');
    }
    return ids.map((id) => {
      const p = t.get('produtos', id);
      if (!p || p.excluido) throw new ErroNegocio('Um dos produtos selecionados não existe mais.');
      const patch: Partial<Produto> = {};
      if (categoria) patch.categoria = categoria;
      if (e.estoqueMinimo != null) patch.estoqueMinimo = e.estoqueMinimo;
      if (margem !== undefined) patch.margemPct = margem ?? undefined;
      const margemFinal = margem !== undefined ? margem : (p.margemPct ?? null);
      if (e.preco) {
        const novo = precoEmMassa(p, e.preco, margemFinal, ctx);
        if (novo == null) throw new ErroNegocio(`Não deu para sugerir o preço de "${p.nome}": confira a margem e as comissões dos canais.`);
        patch.precoEtiquetaCentavos = novo;
      }
      if (e.arquivado != null && e.arquivado !== p.arquivado) arquivarProdutoTx(t, id, e.arquivado);
      return Object.keys(patch).length ? t.update('produtos', id, patch) : (t.get('produtos', id) as Produto);
    });
  });
}

/** Exclui vários produtos de uma vez (tudo ou nada: se um estiver bloqueado, nenhum é excluído). */
export function excluirProdutos(ids: ID[], data: ISODate = hojeISO()): number {
  if (!ids.length) throw new ErroNegocio('Selecione pelo menos um produto.');
  return db.tx((t) => {
    for (const id of ids) excluirProdutoTx(t, id, data);
    return ids.length;
  });
}

/** Alerta discreto de licença: modelo de terceiro com licença "não" ou "não sei" (sem resposta conta como "não sei"). */
export function alertaLicenca(produto: Pick<Produto, 'origemModelo' | 'licencaVenda'>): boolean {
  return produto.origemModelo === 'terceiro' && produto.licencaVenda !== 'sim';
}

/**
 * Prévia do formulário de produto, antes de salvar: composição do custo por peça, preço sugerido por
 * canal ativo e etiqueta sugerida (custo com precisão total, como no Exemplo A). Com `precoEtiquetaCentavos`,
 * inclui a simulação por canal e o status da margem (com o custo de 4 casas, igual à lista de produtos).
 * Com a margem própria do produto (margemPct), usa ela no lugar da margem padrão.
 */
export function previaCusto(ficha: FichaPrevia, precoEtiquetaCentavos?: Cents | null, margemPct?: number | null): PreviaCusto {
  const ctx = contextoCusto();
  const { canais } = db.config;
  const custos = custosComMargem(db.config.custos, margemPct);
  const mesas: Mesa[] = (ficha.mesas ?? []).map((m, i) => ({
    id: m.id || `previa-${i}`,
    pecasPorMesa: m.pecasPorMesa,
    tempoMin: m.tempoMin,
    impressoraId: m.impressoraId || impressoraPadrao() || '',
    filamentos: m.filamentos ?? [],
  }));
  const composicao = composicaoCusto(
    { mesas, componentes: ficha.componentes ?? [], maoDeObraMin: ficha.maoDeObraMin ?? MAO_DE_OBRA_PADRAO_MIN },
    ctx,
  );
  const custoUnit = round4(composicao.total);
  const sugestoes: SugestaoCanal[] = canaisAtivos(canais).map((canal) => {
    const s = precoSugerido(composicao.total, canal, custos);
    return 'erro' in s
      ? { canal, exato: null, centavos: null, erro: s.erro }
      : { canal, exato: s.exato, centavos: s.centavos, erro: null };
  });
  const temPreco = precoEtiquetaCentavos != null && Number.isFinite(precoEtiquetaCentavos) && precoEtiquetaCentavos > 0;
  return {
    composicao,
    custoUnit,
    sugestoes,
    etiquetaSugeridaCentavos: etiquetaSugerida(composicao.total, canais, custos),
    erro: erroParametros(custos),
    simulacao: temPreco ? simular(precoEtiquetaCentavos, custoUnit, canais, custos) : null,
    status: temPreco ? statusMargem(precoEtiquetaCentavos, custoUnit, canais, custos) : null,
  };
}
