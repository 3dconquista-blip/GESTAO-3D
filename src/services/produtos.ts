// Cadastro de produtos (seção 7.1) e prévia de custo da ficha técnica (seção 6.3).
// Toda gravação passa por db.tx (atômica). Produtos não são apagados: são arquivados.
// O preço de etiqueta nunca muda sozinho: mudar custos só gera alerta de margem (6.3).
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { contextoCusto } from '../data/selectors.ts';
import type { Canal, Cents, Componente, ID, LicencaVenda, Mesa, MesaFilamento, Produto } from '../data/types.ts';
import { normalizarBusca } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import { round4 } from '../lib/money.ts';
import type { ComposicaoCusto, ContextoCusto, Simulacao, StatusMargem } from '../domain/pricing.ts';
import {
  canaisAtivos,
  composicaoCusto,
  erroParametros,
  etiquetaSugerida,
  precoSugerido,
  simular,
  statusMargem,
} from '../domain/pricing.ts';
import { ErroNegocio } from './estoque.ts';

/** Mão de obra por peça padrão, em minutos (6.3). */
export const MAO_DE_OBRA_PADRAO_MIN = 2;

/** Mesa como vem do formulário: o id é gerado quando ausente. */
export interface MesaEntrada {
  id?: ID;
  /** "Peças desta mesa" (N): inteiro, 1 ou mais. */
  pecasPorMesa: number;
  /** "Tempo da mesa" em minutos. */
  tempoMin: number;
  impressoraId: ID;
  /** Um ou mais filamentos, com as gramas da mesa inteira. */
  filamentos: MesaFilamento[];
}

/** Dados do formulário de produto. Com `id` de um produto existente, edita; sem `id`, cria. */
export interface DadosProduto {
  /** Produto existente: edita. Id inexistente: cria com esse id (útil para dados de exemplo). */
  id?: ID;
  nome: string;
  /** Agrupa as cores do mesmo produto. Padrão: o nome. */
  modelo?: string;
  cor?: string;
  categoria: string;
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
  /** Erro geral dos parâmetros (imposto + margem ≥ 100%), ou null. */
  erro: string | null;
  /** Simulação do preço de etiqueta informado, por canal ativo (null sem preço). */
  simulacao: Simulacao | null;
  /** Cor de status da margem com o preço informado (null sem preço). */
  status: StatusMargem | null;
}

const LICENCAS: LicencaVenda[] = ['sim', 'nao', 'nao_sei'];
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

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

function validarMesas(t: Tx, mesas: MesaEntrada[] | undefined): Mesa[] {
  if (!Array.isArray(mesas) || mesas.length === 0) {
    throw new ErroNegocio('Adicione pelo menos uma mesa na ficha técnica.');
  }
  const ids = new Set<ID>();
  return mesas.map((m, i) => {
    const rotulo = `Mesa ${i + 1}`;
    if (!m.impressoraId || !t.get('impressoras', m.impressoraId)) {
      throw new ErroNegocio(`${rotulo}: escolha a impressora.`);
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
    const filamentos = m.filamentos.map((f) => {
      const mat = f.materialId ? t.get('materiais', f.materialId) : undefined;
      if (!mat) throw new ErroNegocio(`${rotulo}: escolha um filamento cadastrado em Materiais.`);
      if (mat.tipo !== 'filamento') throw new ErroNegocio(`${rotulo}: "${mat.nome}" não é um filamento.`);
      if (!numeroValido(f.gramas) || f.gramas < 0) {
        throw new ErroNegocio(`${rotulo}: informe as gramas de "${mat.nome}" (0 ou mais).`);
      }
      return { materialId: f.materialId, gramas: f.gramas };
    });
    const id = m.id && !ids.has(m.id) ? m.id : novoId();
    ids.add(id);
    return { id, pecasPorMesa: m.pecasPorMesa, tempoMin: m.tempoMin, impressoraId: m.impressoraId, filamentos };
  });
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
  // Na edição, campos ausentes mantêm o valor atual.
  const d: DadosProduto = atual ? { ...atual, ...dados } : dados;

  const nome = texto(d.nome);
  if (!nome) throw new ErroNegocio('Informe o nome do produto.');
  const categoriaInformada = texto(d.categoria);
  if (!categoriaInformada) throw new ErroNegocio('Escolha a categoria do produto.');

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

  let precoEtiquetaCentavos = d.precoEtiquetaCentavos;
  if (precoEtiquetaCentavos == null) {
    const custo = composicaoCusto({ mesas, componentes, maoDeObraMin }, contextoTx(t)).total;
    precoEtiquetaCentavos = etiquetaSugerida(custo, db.config.canais, db.config.custos) ?? 0;
  }
  if (!Number.isInteger(precoEtiquetaCentavos) || precoEtiquetaCentavos < 0) {
    throw new ErroNegocio('O preço de etiqueta precisa ser um valor em reais, 0 ou mais.');
  }

  const campos = {
    nome,
    modelo: texto(d.modelo) || nome,
    cor: texto(d.cor),
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

/**
 * Nome da cópia em outra cor: troca a cor antiga no nome pela nova ou, se a cor não aparece no nome,
 * acrescenta a nova cor no fim. Ex.: ('Chaveiro Kettlebell Preto', 'Preto', 'Rosa') -> 'Chaveiro Kettlebell Rosa'.
 */
export function nomeParaCor(nome: string, corAtual: string, corNova: string): string {
  const n = nome.trim();
  const antiga = corAtual.trim();
  const nova = corNova.trim();
  if (antiga) {
    const baixo = n.toLocaleLowerCase('pt-BR');
    const alvo = antiga.toLocaleLowerCase('pt-BR');
    let i = baixo.lastIndexOf(alvo);
    while (i >= 0) {
      const antes = i > 0 ? n[i - 1] : '';
      const depois = n[i + antiga.length] ?? '';
      // Só troca palavra inteira ("Preto" em "Pretinho" não conta).
      if (!LETRA_OU_NUMERO.test(antes) && !LETRA_OU_NUMERO.test(depois)) {
        return n.slice(0, i) + nova + n.slice(i + antiga.length);
      }
      i = i > 0 ? baixo.lastIndexOf(alvo, i - 1) : -1;
    }
  }
  return n ? `${n} ${nova}` : nova;
}

/** Junta filamentos repetidos numa mesa somando as gramas (acontece ao trocar uma cor por outra já presente). */
function juntarFilamentos(lista: MesaFilamento[]): MesaFilamento[] {
  const m = new Map<ID, number>();
  for (const f of lista) m.set(f.materialId, (m.get(f.materialId) || 0) + f.gramas);
  return Array.from(m, ([materialId, gramas]) => ({ materialId, gramas }));
}

export interface OpcoesDuplicarCor {
  /** Nova cor (obrigatória e diferente da atual). */
  cor: string;
  /** Nome da cópia. Padrão: o nome com a cor trocada (ver nomeParaCor). */
  nome?: string;
  /** Troca este filamento pelo da nova cor em todas as mesas. */
  trocarFilamento?: { de: ID; para: ID };
}

/**
 * "Duplicar para outra cor": cria outro produto (outro item de estoque) com o mesmo modelo, categoria,
 * ficha técnica, preço e mínimo, nova cor, novo nome e novo código. A foto não é copiada.
 */
export function duplicarParaOutraCor(produtoId: ID, opcoes: OpcoesDuplicarCor): Produto {
  return db.tx((t) => {
    const orig = t.get('produtos', produtoId);
    if (!orig) throw new ErroNegocio('Produto não encontrado.');
    const cor = texto(opcoes.cor);
    if (!cor) throw new ErroNegocio('Informe a nova cor.');
    if (orig.cor && normalizarBusca(cor) === normalizarBusca(orig.cor)) {
      throw new ErroNegocio(`Este produto já é da cor "${orig.cor}". Escolha outra cor.`);
    }

    let mesas: MesaEntrada[] = orig.mesas.map(({ id: _id, ...m }) => ({
      ...m,
      filamentos: m.filamentos.map((f) => ({ ...f })),
    }));
    const troca = opcoes.trocarFilamento;
    if (troca) {
      if (!mesas.some((m) => m.filamentos.some((f) => f.materialId === troca.de))) {
        throw new ErroNegocio('O filamento a trocar não está na ficha técnica deste produto.');
      }
      const novo = troca.para ? t.get('materiais', troca.para) : undefined;
      if (!novo || novo.tipo !== 'filamento') throw new ErroNegocio('Escolha o filamento da nova cor.');
      mesas = mesas.map((m) => ({
        ...m,
        filamentos: juntarFilamentos(
          m.filamentos.map((f) => (f.materialId === troca.de ? { ...f, materialId: troca.para } : f)),
        ),
      }));
    }

    return salvarProdutoTx(t, {
      nome: texto(opcoes.nome) || nomeParaCor(orig.nome, orig.cor, cor),
      modelo: orig.modelo,
      cor,
      categoria: orig.categoria,
      precoEtiquetaCentavos: orig.precoEtiquetaCentavos,
      estoqueMinimo: orig.estoqueMinimo,
      maoDeObraMin: orig.maoDeObraMin,
      mesas,
      componentes: orig.componentes.map((c) => ({ ...c })),
      origemModelo: orig.origemModelo,
      linkModelo: orig.linkModelo,
      licencaVenda: orig.licencaVenda,
    });
  });
}

/** Arquiva (some das listas e seleções, mantém o histórico) ou reativa um produto. */
export function arquivarProduto(id: ID, arquivado = true): Produto {
  return db.tx((t) => {
    if (!t.get('produtos', id)) throw new ErroNegocio('Produto não encontrado.');
    return t.update('produtos', id, { arquivado });
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
 */
export function previaCusto(ficha: FichaPrevia, precoEtiquetaCentavos?: Cents | null): PreviaCusto {
  const ctx = contextoCusto();
  const { custos, canais } = db.config;
  const mesas: Mesa[] = (ficha.mesas ?? []).map((m, i) => ({
    id: m.id || `previa-${i}`,
    pecasPorMesa: m.pecasPorMesa,
    tempoMin: m.tempoMin,
    impressoraId: m.impressoraId,
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
