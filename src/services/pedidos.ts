// Pedidos personalizados (seções 9.2 e 9.3): orçamento, etapas do Kanban, pagamentos,
// baixa de materiais (Pronto) e de itens de catálogo (Entregue), cancelamento e duplicação.
// Tudo grava via db.tx (atômico). Cada função aceita uma data explícita (dados de exemplo).
// Peça personalizada sem cor fixa (decisão 85): o orçamento usa o TIPO do filamento (custo médio do kg do tipo) e a
// cor (o carretel) é escolhida em "Pronto", quando o filamento é baixado. Itens antigos, com o carretel gravado,
// continuam custando e baixando por ele.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { ROTULO_ETAPA, ROTULO_FORMA } from '../data/defaults.ts';
import { saldoMaterial } from '../data/selectors.ts';
import type {
  CanalOrigem,
  Cents,
  Componente,
  EtapaPedido,
  FormaPagamento,
  ID,
  ISODate,
  Material,
  Mesa,
  MesaFilamento,
  Novo,
  Pagamento,
  Pedido,
  PedidoItem,
  TipoEntrega,
  TipoFilamento,
} from '../data/types.ts';
import { CASA } from '../data/types.ts';
import { addDias, agoraISO, hojeISO } from '../lib/dates.ts';
import { formatBRL, formatGramas, formatQtd } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import { pctOfCents, round4, roundTo } from '../lib/money.ts';
import { consumoFicha } from '../domain/consumo.ts';
import { carretelPadrao, custoKgDoTipo, posicoesDaFicha, TIPOS_FILAMENTO } from '../domain/filamento.ts';
import type { ContextoCusto } from '../domain/pricing.ts';
import type { LucroPedido, SituacaoFinanceira } from '../domain/pedidos.ts';
import {
  ETAPAS_FLUXO,
  calcularOrcamento,
  custoItem,
  entradaOrcamentoDoPedido,
  etapaFinal,
  etapaNoFluxo,
  lucroPedido,
  numeroPedido,
  situacaoFinanceira,
  tituloAutomatico,
  DESCRICAO_PECA_SEM_NOME,
} from '../domain/pedidos.ts';
import { calcularSaldosMateriais } from '../domain/stock.ts';
import { ErroNegocio, lancarMov, saldoTx } from './estoque.ts';
import type { CorDaPosicao } from './producao.ts';
import { coresDasPosicoes } from './producao.ts';
import type { MesaEntrada } from './produtos.ts';
import { impressoraPadrao } from './produtos.ts';

// ---------------------------------------------------------------- Tipos de entrada

/**
 * Mesa de peça personalizada, igual à do produto: o id é gerado se faltar; sem impressora, vale a primeira ativa;
 * cada filamento traz o TIPO e as gramas da mesa inteira (itens antigos trazem o carretel, materialId).
 */
export type { MesaEntrada };

export interface ItemPedidoEntrada {
  /** Mantém o id ao editar um item existente. */
  id?: ID;
  tipo: 'catalogo' | 'personalizada';
  /** Obrigatório para 'catalogo'. */
  produtoId?: ID;
  /** Padrão: nome do produto (catálogo) ou título do pedido (personalizada). */
  descricao?: string;
  /** Número inteiro de peças. */
  quantidade: number;
  /** Peça personalizada: mesas, componentes por peça e mão de obra por peça (min). */
  mesas?: MesaEntrada[];
  componentes?: Componente[];
  maoDeObraMin?: number;
}

export interface DadosPedido {
  clienteId: ID;
  /** Em branco: título automático pelos itens (tituloAutomatico), ex.: "20 × Chaveiro com nome". */
  titulo: string;
  descricao?: string;
  referencias?: Pedido['referencias'];
  itens: ItemPedidoEntrada[];
  prazo?: ISODate;
  entrega?: { tipo?: TipoEntrega; freteCentavos?: Cents; rastreio?: string };
  canalOrigem?: CanalOrigem;
  observacoes?: string;
  horasModelagem?: number;
  urgente?: boolean;
  /** Padrão: configuração (20%). */
  urgenciaPct?: number;
  descontoPct?: number;
  /** Padrão: configuração (50%). */
  sinalPct?: number;
  /** Valor final digitado pelo dono (com frete). null volta ao valor calculado. */
  totalManualCentavos?: Cents | null;
  /** Data do orçamento (padrão: hoje). A validade conta a partir dela. */
  data?: ISODate;
}

/** Campos que atualizarPedido aceita (todos opcionais). */
export type AlteracaoPedido = Partial<Omit<DadosPedido, 'data'>> & { validade?: ISODate; data?: ISODate };

export interface PagamentoEntrada {
  valorCentavos: Cents;
  forma: FormaPagamento;
  data?: ISODate;
}

/**
 * Dados de cada mudança de etapa (só os das etapas por onde o pedido passa são usados; pulando etapas, por exemplo
 * do orçamento direto para a entrega, valem os de todas elas).
 */
export interface PayloadEtapa {
  /** Data da mudança (padrão: hoje). */
  data?: ISODate;
  /** Em produção (aprovação): sinal recebido. */
  sinal?: PagamentoEntrada;
  /** Em produção (aprovação): "dispensar sinal" com motivo. */
  dispensarSinalMotivo?: string;
  /**
   * Pronto: gramas reais por item personalizado (id do item -> filamentos com o carretel, materialId),
   * substitui a estimativa. Lista vazia = usar a estimativa.
   */
  gramasReais?: Record<ID, MesaFilamento[]>;
  /** Pronto: peças perdidas em falhas por item personalizado (id do item -> quantidade). */
  perdidas?: Record<ID, number>;
  /**
   * Pronto: cor (carretel) de cada posição de filamento por item personalizado
   * (id do item -> 'mesaId:indice' -> materialId). Posição sem escolha usa a cor padrão (coresDoPedido).
   */
  cores?: Record<ID, Record<string, ID>>;
  /** Entregue: pagamento do restante. Sem ele, o restante fica "A receber". */
  pagamentoSaldo?: PagamentoEntrada;
  /** Cancelado: motivo (obrigatório). */
  motivo?: string;
  /** Cancelado: destino do que já foi pago (obrigatório se houver pagamento). */
  destinoSinal?: 'reter' | 'devolver_tudo' | 'devolver_parte';
  /** Cancelado + 'devolver_parte': valor devolvido. */
  valorDevolvidoCentavos?: Cents;
  /** Cancelado: forma da devolução (padrão PIX). */
  formaDevolucao?: FormaPagamento;
}

export interface ResultadoEtapa {
  pedido: Pedido;
  /** Avisos para mostrar depois (saldo negativo, valor a receber...). */
  avisos: string[];
}

// ---------------------------------------------------------------- Auxiliares

function carimbo(data?: ISODate): string {
  return data ?? agoraISO();
}

function evento(data: ISODate | undefined, texto: string): Pedido['historico'][number] {
  return { data: carimbo(data), evento: texto };
}

function obterPedido(t: Tx, id: ID): Pedido {
  const p = t.get('pedidos', id);
  if (!p) throw new ErroNegocio('Pedido não encontrado.');
  return p;
}

function exigirEditavel(p: Pedido) {
  if (etapaFinal(p.etapa)) throw new ErroNegocio(`Pedido ${ROTULO_ETAPA[p.etapa].toLowerCase()} não pode ser alterado.`);
}

/** Contexto de custo com o que está na transação (o custo do kg por tipo é calculado uma vez por tipo). */
function contextoTx(t: Tx): ContextoCusto {
  const imp = new Map(t.all('impressoras').map((i) => [i.id, i]));
  const materiais = t.all('materiais');
  const mat = new Map(materiais.map((m) => [m.id, m]));
  const porTipo = new Map<TipoFilamento, number | undefined>();
  const custoKgTipo = (tipo: TipoFilamento) => {
    if (!porTipo.has(tipo)) porTipo.set(tipo, custoKgDoTipo(materiais, tipo));
    return porTipo.get(tipo);
  };
  return { custos: db.config.custos, impressora: (id) => imp.get(id), material: (id) => mat.get(id), custoKgTipo };
}

function exigirCliente(t: Tx, clienteId: ID | undefined) {
  if (!clienteId) throw new ErroNegocio('Escolha o cliente do pedido.');
  const c = t.get('clientes', clienteId);
  if (!c) throw new ErroNegocio('Cliente não encontrado.');
  if (c.anonimizado) throw new ErroNegocio('Os dados deste cliente foram excluídos. Cadastre o cliente de novo.');
}

function exigirPct(valor: number | undefined, nome: string, max = 100) {
  if (valor == null) return;
  if (!Number.isFinite(valor) || valor < 0 || valor > max) throw new ErroNegocio(`${nome} precisa ficar entre 0% e ${max}%.`);
}

function validarParametros(d: AlteracaoPedido) {
  exigirPct(d.descontoPct, 'O desconto');
  exigirPct(d.sinalPct, 'O sinal');
  exigirPct(d.urgenciaPct, 'A urgência', 1000);
  if (d.horasModelagem != null && (!Number.isFinite(d.horasModelagem) || d.horasModelagem < 0)) {
    throw new ErroNegocio('As horas de modelagem não podem ser negativas.');
  }
  const frete = d.entrega?.freteCentavos;
  if (frete != null && (!Number.isInteger(frete) || frete < 0)) throw new ErroNegocio('O frete não pode ser negativo.');
  const manual = d.totalManualCentavos;
  if (manual != null && (!Number.isInteger(manual) || manual < 0)) throw new ErroNegocio('O valor final não pode ser negativo.');
}

/**
 * Filamento de uma mesa de peça personalizada: o TIPO (orçado pelo custo médio do kg do tipo) ou, em itens antigos,
 * um carretel cadastrado (orçado pelo custo dele).
 */
function validarFilamento(t: Tx, f: MesaFilamento, materiais: Material[]): MesaFilamento {
  const mat = f.materialId ? t.get('materiais', f.materialId) : undefined;
  if (f.materialId && !mat) throw new ErroNegocio('O filamento escolhido não existe mais no cadastro.');
  if (mat && mat.tipo !== 'filamento') throw new ErroNegocio(`"${mat.nome}" não é um filamento.`);
  if (f.tipo && !TIPOS_FILAMENTO.includes(f.tipo)) throw new ErroNegocio('Tipo de filamento inválido.');
  if (!mat) {
    if (!f.tipo) throw new ErroNegocio('Escolha o tipo de filamento da peça personalizada.');
    if (custoKgDoTipo(materiais, f.tipo) == null) {
      throw new ErroNegocio(`Cadastre um filamento ${f.tipo} (com o custo do kg) para orçar a peça.`);
    }
  }
  if (!(f.gramas >= 0)) throw new ErroNegocio('As gramas do filamento não podem ser negativas.');
  return { ...(f.tipo ? { tipo: f.tipo } : {}), ...(mat ? { materialId: mat.id } : {}), gramas: f.gramas };
}

/**
 * Valida e calcula os itens com os custos atuais. Devolve também o custo exato de cada item.
 * Peça personalizada sem descrição fica com a descrição vazia: completarTitulo põe o título do pedido.
 */
function montarItens(t: Tx, entradas: ItemPedidoEntrada[]): { itens: PedidoItem[]; exatos: number[] } {
  if (!entradas.length) throw new ErroNegocio('Adicione pelo menos um item ao pedido.');
  const ctx = contextoTx(t);
  const materiais = t.all('materiais');
  const itens: PedidoItem[] = [];
  const exatos: number[] = [];
  for (const e of entradas) {
    if (!Number.isInteger(e.quantidade) || e.quantidade <= 0) {
      throw new ErroNegocio('A quantidade de cada item precisa ser um número inteiro maior que zero.');
    }
    if (e.tipo === 'catalogo') {
      if (!e.produtoId) throw new ErroNegocio('Escolha o produto do catálogo.');
      const produto = t.get('produtos', e.produtoId);
      if (!produto) throw new ErroNegocio('Produto não encontrado.');
      const c = custoItem({ tipo: 'catalogo', quantidade: e.quantidade }, ctx, produto);
      itens.push({
        id: e.id || novoId(),
        tipo: 'catalogo',
        produtoId: produto.id,
        descricao: e.descricao?.trim() || produto.nome,
        quantidade: e.quantidade,
        custoUnit: c.custoUnit,
        custoTotal: c.custoTotal,
        custoExato: c.custoTotalExato,
      });
      exatos.push(c.custoTotalExato);
      continue;
    }
    const mesas: Mesa[] = (e.mesas ?? []).map((m) => {
      if (!(m.pecasPorMesa > 0)) throw new ErroNegocio('Informe quantas peças saem em cada mesa.');
      if (!(m.tempoMin >= 0)) throw new ErroNegocio('O tempo da mesa não pode ser negativo.');
      const impressoraId = m.impressoraId || impressoraPadrao() || '';
      if (!t.get('impressoras', impressoraId)) {
        throw new ErroNegocio(
          t.all('impressoras').some((i) => i.ativa) ? 'Escolha a impressora de cada mesa.' : 'Cadastre uma impressora em Configurações antes de orçar a peça.',
        );
      }
      return {
        id: m.id || novoId(),
        pecasPorMesa: m.pecasPorMesa,
        tempoMin: m.tempoMin,
        impressoraId,
        filamentos: (m.filamentos ?? []).map((f) => validarFilamento(t, f, materiais)),
      };
    });
    const componentes: Componente[] = (e.componentes ?? []).map((c) => ({ materialId: c.materialId, quantidade: c.quantidade }));
    for (const c of componentes) {
      if (!t.get('materiais', c.materialId)) throw new ErroNegocio('Componente não encontrado no cadastro de insumos.');
      if (!(c.quantidade >= 0)) throw new ErroNegocio('A quantidade do componente não pode ser negativa.');
    }
    const maoDeObraMin = e.maoDeObraMin ?? 0;
    if (!(maoDeObraMin >= 0)) throw new ErroNegocio('A mão de obra não pode ser negativa.');
    const c = custoItem({ tipo: 'personalizada', quantidade: e.quantidade, mesas, componentes, maoDeObraMin }, ctx);
    itens.push({
      id: e.id || novoId(),
      tipo: 'personalizada',
      descricao: e.descricao?.trim() || '',
      quantidade: e.quantidade,
      mesas,
      componentes,
      maoDeObraMin,
      custoUnit: c.custoUnit,
      custoTotal: c.custoTotal,
      custoExato: c.custoTotalExato,
    });
    exatos.push(c.custoTotalExato);
  }
  return { itens, exatos };
}

/**
 * Título do pedido: o digitado ou, em branco, o automático pelos itens (tituloAutomatico; `auto` = true). Peças
 * personalizadas sem descrição ficam com o título digitado ou, com o título automático, "Peça personalizada"
 * (para não herdarem o nome de outro item). Sem título e sem nenhuma descrição, pede o título.
 */
function completarTitulo(titulo: string, itens: PedidoItem[]): { titulo: string; itens: PedidoItem[]; auto: boolean } {
  const digitado = titulo.trim();
  const final = digitado || tituloAutomatico(itens);
  if (!final) throw new ErroNegocio('Informe o título do pedido ou a descrição da peça.');
  const rotulo = digitado || DESCRICAO_PECA_SEM_NOME;
  return { titulo: final, itens: itens.map((i) => (i.descricao ? i : { ...i, descricao: rotulo })), auto: !digitado };
}

/** Normaliza um item (de entrada ou gravado) para saber se a edição mudou alguma coisa nele. */
function chaveItem(i: ItemPedidoEntrada | PedidoItem): string {
  return JSON.stringify([
    i.id ?? null,
    i.tipo,
    i.produtoId ?? null,
    i.quantidade,
    (i.descricao ?? '').trim(),
    i.tipo === 'personalizada' ? (i.maoDeObraMin ?? 0) : null,
    (i.componentes ?? []).map((c) => [c.materialId, c.quantidade]),
    (i.mesas ?? []).map((m) => [m.id ?? null, m.pecasPorMesa, m.tempoMin, m.impressoraId || null, m.filamentos.map((f) => [f.tipo ?? null, f.materialId ?? null, f.gramas])]),
  ]);
}

/** A edição mandou os mesmos itens que já estão gravados (então eles não são revalidados nem recalculados). */
function mesmosItens(entrada: ItemPedidoEntrada[], atuais: PedidoItem[]): boolean {
  return entrada.length === atuais.length && entrada.every((e, k) => chaveItem(e) === chaveItem(atuais[k]));
}

/** Recalcula custo, total calculado e sinal do pedido. Mantém o total manual se `manual` for informado. */
function aplicarOrcamento(p: Pedido, custosItens: number[], totalFinal: (calculado: Cents) => Cents): Pedido {
  const orc = calcularOrcamento(entradaOrcamentoDoPedido(p, custosItens));
  if (orc.erro) throw new ErroNegocio(orc.erro);
  const totalCentavos = totalFinal(orc.totalCentavos);
  return {
    ...p,
    custoProducao: orc.custoProducao,
    modelagemValor: orc.modelagem,
    totalCalculadoCentavos: orc.totalCentavos,
    totalCentavos,
    sinalCentavos: pctOfCents(totalCentavos, p.sinalPct),
  };
}

function inserirPagamento(
  t: Tx,
  p: Pedido,
  pg: PagamentoEntrada & { tipo: 'sinal' | 'parcela' | 'saldo'; observacao?: string },
  dataPadrao: ISODate,
): Pagamento {
  if (!Number.isInteger(pg.valorCentavos) || pg.valorCentavos <= 0) throw new ErroNegocio('Informe um valor maior que zero.');
  if (!(pg.forma in ROTULO_FORMA)) throw new ErroNegocio('Escolha a forma de pagamento.');
  const taxa = pg.forma === 'cartao' ? pctOfCents(pg.valorCentavos, db.config.custos.taxaCartaoPct) : 0;
  return t.insert('pagamentos', {
    origem: 'pedido',
    refId: p.id,
    clienteId: p.clienteId,
    direcao: 'recebido',
    valorCentavos: pg.valorCentavos,
    forma: pg.forma,
    data: pg.data ?? dataPadrao,
    tipo: pg.tipo,
    ...(taxa ? { taxaCentavos: taxa } : {}),
    ...(pg.observacao ? { observacao: pg.observacao } : {}),
  });
}

function textoPagamento(pg: Pagamento): string {
  const rotulo = pg.tipo === 'sinal' ? 'Sinal recebido' : pg.tipo === 'saldo' ? 'Saldo recebido' : 'Pagamento recebido';
  return `${rotulo}: ${formatBRL(pg.valorCentavos)} (${ROTULO_FORMA[pg.forma]})`;
}

function proximoNumero(t: Tx): number {
  const maior = t.all('pedidos').reduce((m, p) => Math.max(m, p.numero || 0), 0);
  const numero = Math.max(db.config.pedidos.proximoNumero || 1, maior + 1);
  t.config((c) => ({ ...c, pedidos: { ...c.pedidos, proximoNumero: numero + 1 } }));
  return numero;
}

function criarPedidoTx(t: Tx, dados: DadosPedido, eventoInicial = 'Orçamento criado'): Pedido {
  exigirCliente(t, dados.clienteId);
  validarParametros(dados);
  const cfg = db.config;
  const data = dados.data ?? hojeISO();
  const m = montarItens(t, dados.itens || []);
  const exatos = m.exatos;
  const { titulo, itens, auto } = completarTitulo(dados.titulo || '', m.itens);
  const numero = proximoNumero(t);
  const base: Pedido = {
    id: novoId(),
    criadoEm: '',
    atualizadoEm: '',
    numero,
    clienteId: dados.clienteId,
    titulo,
    ...(auto ? { tituloAuto: true } : {}),
    descricao: dados.descricao?.trim() || undefined,
    referencias: dados.referencias ?? [],
    itens,
    prazo: dados.prazo || undefined,
    entrega: {
      tipo: dados.entrega?.tipo ?? 'retirada',
      freteCentavos: dados.entrega?.freteCentavos ?? 0,
      ...(dados.entrega?.rastreio?.trim() ? { rastreio: dados.entrega.rastreio.trim() } : {}),
    },
    canalOrigem: dados.canalOrigem ?? 'whatsapp',
    observacoes: dados.observacoes?.trim() || undefined,
    etapa: 'orcamento',
    horasModelagem: dados.horasModelagem ?? 0,
    urgente: !!dados.urgente,
    urgenciaPct: dados.urgenciaPct ?? cfg.pedidos.urgenciaPct,
    descontoPct: dados.descontoPct ?? 0,
    sinalPct: dados.sinalPct ?? cfg.pedidos.sinalPct,
    pedidoMinimoCentavos: cfg.pedidos.pedidoMinimoCentavos,
    margemPct: cfg.custos.margemDesejadaPct,
    valorHoraModelagem: cfg.custos.valorHoraModelagem,
    arredondamento: cfg.custos.arredondamento,
    custoProducao: 0,
    modelagemValor: 0,
    totalCalculadoCentavos: 0,
    totalCentavos: 0,
    sinalCentavos: 0,
    validade: addDias(data, cfg.pedidos.validadeDias),
    // O checklist saiu do app, mas continua gravado: versões antigas em outros aparelhos sincronizados leem.
    checklist: { modeloAprovado: false, impresso: false, acabamento: false },
    historico: [evento(dados.data, eventoInicial)],
    materiaisBaixados: false,
    catalogoBaixado: false,
  };
  const manual = dados.totalManualCentavos;
  const calc = aplicarOrcamento(base, exatos, (calculado) => (manual != null ? manual : calculado));
  if (calc.totalCentavos !== calc.totalCalculadoCentavos) {
    calc.historico.push(evento(dados.data, `Valor alterado de ${formatBRL(calc.totalCalculadoCentavos)} para ${formatBRL(calc.totalCentavos)}`));
  }
  const { id, criadoEm: _c, atualizadoEm: _a, ...resto } = calc;
  const novo: Novo<Pedido> = { ...resto, id };
  return t.insert('pedidos', novo);
}

// ---------------------------------------------------------------- Orçamento

/**
 * Cria um pedido na etapa "Orçamento": número sequencial (#0001), parâmetros fotografados da
 * configuração, custo dos itens com os custos atuais, total pelo motor da 9.2 (ou o valor manual),
 * validade = data + validade do orçamento e histórico "Orçamento criado".
 */
export function criarPedido(dados: DadosPedido): Pedido {
  return db.tx((t) => criarPedidoTx(t, dados));
}

/**
 * Altera um pedido ainda não entregue nem cancelado. Itens novos são recalculados com os custos
 * atuais; os parâmetros fotografados (margem, hora de modelagem, arredondamento, pedido
 * mínimo) continuam os do orçamento. Pagamentos são mantidos. Se o total mudar, grava
 * "Valor alterado de R$ X para R$ Y". Um valor manual é mantido enquanto o valor calculado não mudar.
 * Título em branco vira o título automático pelos itens.
 */
export function atualizarPedido(id: ID, dados: AlteracaoPedido): Pedido {
  return db.tx((t) => {
    const atual = obterPedido(t, id);
    exigirEditavel(atual);
    validarParametros(dados);
    if (dados.clienteId !== undefined && dados.clienteId !== atual.clienteId) exigirCliente(t, dados.clienteId);
    if (dados.itens && atual.materiaisBaixados) {
      throw new ErroNegocio('Os materiais deste pedido já foram baixados. Não dá para mudar os itens agora.');
    }
    let itens = atual.itens;
    let custos = atual.itens.map((i) => i.custoExato ?? i.custoTotal);
    // Itens iguais aos gravados ficam como estão (o formulário manda todos ao salvar qualquer campo): sem isso,
    // mudar só o prazo recalcularia tudo e travaria se o tipo de filamento não tivesse mais carretel.
    if (dados.itens && !mesmosItens(dados.itens, atual.itens)) {
      const m = montarItens(t, dados.itens);
      itens = m.itens;
      custos = m.exatos;
    }
    // Título automático segue automático (refeito pelos itens) até o dono digitar outro.
    const digitado = dados.titulo !== undefined ? dados.titulo.trim() : undefined;
    const seguirAuto = !!atual.tituloAuto && (digitado === undefined || digitado === '' || digitado === atual.titulo);
    const comTitulo = completarTitulo(seguirAuto ? '' : (digitado ?? atual.titulo), itens);
    const novo: Pedido = {
      ...atual,
      clienteId: dados.clienteId ?? atual.clienteId,
      titulo: comTitulo.titulo,
      tituloAuto: comTitulo.auto || undefined,
      itens: comTitulo.itens,
      descricao: dados.descricao !== undefined ? dados.descricao.trim() || undefined : atual.descricao,
      referencias: dados.referencias ?? atual.referencias,
      prazo: dados.prazo !== undefined ? dados.prazo || undefined : atual.prazo,
      validade: dados.validade || atual.validade,
      entrega: dados.entrega
        ? {
            tipo: dados.entrega.tipo ?? atual.entrega.tipo,
            freteCentavos: dados.entrega.freteCentavos ?? atual.entrega.freteCentavos,
            rastreio: dados.entrega.rastreio !== undefined ? dados.entrega.rastreio.trim() || undefined : atual.entrega.rastreio,
          }
        : atual.entrega,
      canalOrigem: dados.canalOrigem ?? atual.canalOrigem,
      observacoes: dados.observacoes !== undefined ? dados.observacoes.trim() || undefined : atual.observacoes,
      horasModelagem: dados.horasModelagem ?? atual.horasModelagem,
      urgente: dados.urgente ?? atual.urgente,
      urgenciaPct: dados.urgenciaPct ?? atual.urgenciaPct,
      descontoPct: dados.descontoPct ?? atual.descontoPct,
      sinalPct: dados.sinalPct ?? atual.sinalPct,
      historico: [...atual.historico],
    };
    const eraManual = atual.totalCentavos !== atual.totalCalculadoCentavos;
    const calc = aplicarOrcamento(novo, custos, (calculado) => {
      if (dados.totalManualCentavos === null) return calculado;
      if (dados.totalManualCentavos !== undefined) return dados.totalManualCentavos;
      return eraManual && calculado === atual.totalCalculadoCentavos ? atual.totalCentavos : calculado;
    });
    if (calc.totalCentavos !== atual.totalCentavos) {
      calc.historico.push(evento(dados.data, `Valor alterado de ${formatBRL(atual.totalCentavos)} para ${formatBRL(calc.totalCentavos)}`));
    } else if (dados.itens) {
      calc.historico.push(evento(dados.data, 'Itens alterados'));
    }
    return t.update('pedidos', id, () => calc);
  });
}

/** "O valor final é editável": define o total do pedido (centavos, com frete) e grava no histórico. */
export function definirTotalManual(pedidoId: ID, totalCentavos: Cents, data?: ISODate): Pedido {
  return atualizarPedido(pedidoId, { totalManualCentavos: totalCentavos, data });
}

/** Lucro, margem, sinal e saldo se o valor final for `totalCentavos` (para mostrar enquanto o dono edita). */
export function previewTotalManual(
  pedidoId: ID,
  totalCentavos: Cents,
): LucroPedido & { sinalCentavos: Cents; saldoCentavos: Cents; creditoCentavos: Cents } {
  const p = db.get('pedidos', pedidoId);
  if (!p) throw new ErroNegocio('Pedido não encontrado.');
  const pagamentos = db.all('pagamentos');
  const fin = situacaoFinanceira({ ...p, totalCentavos }, pagamentos);
  return {
    ...lucroPedido({
      totalCentavos,
      freteCentavos: p.entrega.freteCentavos,
      taxasCartaoCentavos: fin.taxasCartaoCentavos,
      custoProducao: p.custoProducao,
      modelagem: p.modelagemValor,
    }),
    sinalCentavos: pctOfCents(totalCentavos, p.sinalPct),
    saldoCentavos: fin.saldoCentavos,
    creditoCentavos: fin.creditoCentavos,
  };
}

/**
 * "Duplicar orçamento": novo pedido em Orçamento com os mesmos itens e escolhas do pedido
 * (urgência, desconto, sinal, modelagem, frete), recalculado com os custos e parâmetros atuais.
 */
export function duplicarOrcamento(pedidoId: ID, data?: ISODate): Pedido {
  return db.tx((t) => {
    const p = obterPedido(t, pedidoId);
    const novo = criarPedidoTx(
      t,
      {
        clienteId: p.clienteId,
        titulo: p.tituloAuto ? '' : p.titulo,
        descricao: p.descricao,
        referencias: p.referencias.map((r) => ({ ...r })),
        itens: p.itens.map((i) => ({
          tipo: i.tipo,
          produtoId: i.produtoId,
          descricao: i.descricao,
          quantidade: i.quantidade,
          mesas: i.mesas?.map((m) => ({ ...m, id: undefined, filamentos: m.filamentos.map((f) => ({ ...f })) })),
          componentes: i.componentes?.map((c) => ({ ...c })),
          maoDeObraMin: i.maoDeObraMin,
        })),
        entrega: { tipo: p.entrega.tipo, freteCentavos: p.entrega.freteCentavos },
        canalOrigem: p.canalOrigem,
        observacoes: p.observacoes,
        horasModelagem: p.horasModelagem,
        urgente: p.urgente,
        descontoPct: p.descontoPct,
        sinalPct: p.sinalPct,
        data,
      },
      `Orçamento criado (cópia do ${numeroPedido(p.numero)})`,
    );
    t.update('pedidos', p.id, (atual) => ({
      ...atual,
      historico: [...atual.historico, evento(data, `Orçamento duplicado como ${numeroPedido(novo.numero)}`)],
    }));
    return novo;
  });
}

// ---------------------------------------------------------------- Pagamentos

/**
 * Registra um pagamento do cliente (sinal, parcela ou saldo). No cartão grava a taxa
 * (taxa do cartão % da configuração), que reduz o lucro do pedido. Pagamento acima do total
 * vira crédito do cliente (calculado; ver situacao.creditoCentavos).
 */
export function registrarPagamentoPedido(dados: {
  pedidoId: ID;
  valorCentavos: Cents;
  forma: FormaPagamento;
  data?: ISODate;
  tipo: 'sinal' | 'parcela' | 'saldo';
  observacao?: string;
}): { pagamento: Pagamento; situacao: SituacaoFinanceira } {
  return db.tx((t) => {
    const p = obterPedido(t, dados.pedidoId);
    if (p.etapa === 'cancelado') throw new ErroNegocio('Pedido cancelado não recebe pagamentos.');
    const pagamento = inserirPagamento(t, p, dados, hojeISO());
    const situacao = situacaoFinanceira(p, t.all('pagamentos'));
    const hist = [evento(dados.data, textoPagamento(pagamento))];
    if (situacao.creditoCentavos > 0) hist.push(evento(dados.data, `Crédito do cliente: ${formatBRL(situacao.creditoCentavos)}`));
    t.update('pedidos', p.id, (atual) => ({ ...atual, historico: [...atual.historico, ...hist] }));
    return { pagamento, situacao };
  });
}

/** Corrige um pagamento lançado errado: grava o estorno (o original fica registrado). */
export function estornarPagamentoPedido(pagamentoId: ID, motivo: string, data?: ISODate): Pagamento {
  return db.tx((t) => {
    const orig = t.get('pagamentos', pagamentoId);
    if (!orig || orig.origem !== 'pedido') throw new ErroNegocio('Pagamento não encontrado.');
    if (orig.estornoDe) throw new ErroNegocio('Não é possível estornar um estorno.');
    if (t.all('pagamentos').some((pg) => pg.estornoDe === orig.id)) throw new ErroNegocio('Este pagamento já foi estornado.');
    const m = (motivo || '').trim();
    if (!m) throw new ErroNegocio('Informe o motivo do estorno.');
    const p = obterPedido(t, orig.refId);
    const est = t.insert('pagamentos', {
      origem: 'pedido',
      refId: orig.refId,
      clienteId: orig.clienteId,
      direcao: orig.direcao === 'recebido' ? 'pago' : 'recebido',
      valorCentavos: orig.valorCentavos,
      forma: orig.forma,
      data: data ?? hojeISO(),
      tipo: orig.tipo,
      ...(orig.taxaCentavos ? { taxaCentavos: orig.taxaCentavos } : {}),
      observacao: m,
      estornoDe: orig.id,
    });
    t.update('pedidos', p.id, (atual) => ({
      ...atual,
      historico: [...atual.historico, evento(data, `Pagamento de ${formatBRL(orig.valorCentavos)} estornado: ${m}`)],
    }));
    return est;
  });
}

export const MOTIVO_PAGAMENTO_DESFEITO = 'Desfeito logo após registrar';

/**
 * "Desfazer" logo depois de registrar um pagamento: estorna com a data do próprio pagamento, para um pagamento
 * lançado com data passada não ficar somado num mês e descontado em outro ("dinheiro que entrou").
 */
export function desfazerPagamentoPedido(pagamentoId: ID): Pagamento {
  const orig = db.get('pagamentos', pagamentoId);
  if (!orig || orig.origem !== 'pedido') throw new ErroNegocio('Pagamento não encontrado.');
  return estornarPagamentoPedido(pagamentoId, MOTIVO_PAGAMENTO_DESFEITO, orig.data);
}

// ---------------------------------------------------------------- Etapas

/**
 * Em produção ("Aprovado" e "Em produção" são uma etapa só): exige o sinal (grava o pagamento) ou o motivo para
 * dispensá-lo, a não ser que algo já tenha sido pago; o prazo conta daqui. Uma linha só no histórico.
 */
function entrarProducao(t: Tx, p: Pedido, payload: PayloadEtapa, data: ISODate): Pedido {
  let texto: string;
  let sinalDispensadoMotivo = p.sinalDispensadoMotivo;
  if (payload.sinal) {
    const pg = inserirPagamento(t, p, { ...payload.sinal, tipo: 'sinal' }, data);
    texto = `Aprovado e em produção. ${textoPagamento(pg)}`;
  } else if (payload.dispensarSinalMotivo?.trim()) {
    sinalDispensadoMotivo = payload.dispensarSinalMotivo.trim();
    texto = `Aprovado e em produção sem sinal: ${sinalDispensadoMotivo}`;
  } else if (situacaoFinanceira(p, t.all('pagamentos')).pagoCentavos > 0) {
    texto = 'Aprovado e em produção';
  } else {
    throw new ErroNegocio('Registre o sinal ou dispense o sinal informando o motivo.');
  }
  return t.update('pedidos', p.id, (atual) => ({
    ...atual,
    etapa: 'producao',
    aprovadoEm: data,
    producaoEm: data,
    sinalDispensadoMotivo,
    historico: [...atual.historico, evento(payload.data, texto)],
  }));
}

/**
 * Cor padrão de cada posição de filamento de uma peça personalizada: a cor já gravada no item (depois de Pronto);
 * senão o carretel do item antigo, se ainda ativo; senão o carretel ativo do tipo com mais saldo.
 */
function coresPadraoDoItem(item: PedidoItem, materiais: Material[], saldo: (id: ID) => number): Record<string, ID> {
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const out: Record<string, ID> = {};
  for (const p of posicoesDaFicha(item.mesas ?? [], (id) => porId.get(id))) {
    const m = carretelPadrao(materiais, p.tipo, saldo, [item.cores?.[p.chave], p.materialId]);
    if (m) out[p.chave] = m.id;
  }
  return out;
}

/** Cores das posições de filamento de uma peça personalizada do pedido (para a tela de "Pronto"). */
export interface CoresDoItem {
  itemId: ID;
  descricao: string;
  posicoes: CorDaPosicao[];
}

/**
 * Peças personalizadas do pedido com filamento: posições, cor padrão e cores disponíveis, para escolher a cor ao
 * mover para "Pronto" (payload.cores). Só leitura.
 */
export function coresDoPedido(pedidoId: ID): CoresDoItem[] {
  const p = db.get('pedidos', pedidoId);
  if (!p) return [];
  const materiais = db.all('materiais');
  const porId = new Map(materiais.map((m) => [m.id, m]));
  const out: CoresDoItem[] = [];
  for (const item of p.itens) {
    if (item.tipo !== 'personalizada') continue;
    const posicoes = posicoesDaFicha(item.mesas ?? [], (id) => porId.get(id));
    if (!posicoes.length) continue;
    const padrao = coresPadraoDoItem(item, materiais, saldoMaterial);
    out.push({ itemId: item.id, descricao: item.descricao, posicoes: coresDasPosicoes(posicoes, padrao, materiais) });
  }
  return out;
}

/**
 * Pronto: baixa os materiais estimados (ou as gramas reais) das peças personalizadas. O filamento sai da cor
 * escolhida para cada posição (payload.cores) ou da cor padrão, e as cores usadas ficam gravadas no item.
 */
function entrarPronto(t: Tx, p: Pedido, payload: PayloadEtapa, data: ISODate, avisos: string[]): Pedido {
  const baixas: string[] = [];
  const coresUsadas = new Map<ID, Record<string, ID>>();
  if (!p.materiaisBaixados) {
    const total = new Map<ID, number>();
    const somar = (materialId: ID, q: number) => total.set(materialId, (total.get(materialId) || 0) + q);
    const materiais = t.all('materiais');
    const porId = new Map(materiais.map((m) => [m.id, m]));
    const saldos = calcularSaldosMateriais(t.all('movMateriais'));
    const saldo = (id: ID) => saldos.get(id) || 0;
    for (const item of p.itens) {
      if (item.tipo !== 'personalizada') continue;
      const perdidas = payload.perdidas?.[item.id] ?? 0;
      if (!Number.isInteger(perdidas) || perdidas < 0) throw new ErroNegocio('As peças perdidas precisam ser um número inteiro (0 ou mais).');
      const reais = payload.gramasReais?.[item.id]?.length ? payload.gramasReais[item.id] : undefined;
      if (reais?.some((g) => !(g.gramas >= 0))) throw new ErroNegocio('As gramas reais não podem ser negativas.');
      if (reais?.some((g) => !g.materialId || porId.get(g.materialId)?.tipo !== 'filamento')) {
        throw new ErroNegocio('Escolha o filamento (cor) de cada valor de gramas reais.');
      }
      const posicoes = posicoesDaFicha(item.mesas ?? [], (id) => porId.get(id));
      const padrao = coresPadraoDoItem(item, materiais, saldo);
      const escolhidas = payload.cores?.[item.id] ?? {};
      const cores: Record<string, ID> = {};
      for (const pos of posicoes) {
        const escolhida = escolhidas[pos.chave];
        if (escolhida && porId.get(escolhida)?.tipo !== 'filamento') throw new ErroNegocio('A cor escolhida não é um filamento cadastrado.');
        const cor = escolhida || padrao[pos.chave];
        if (cor) cores[pos.chave] = cor;
      }
      const c = consumoFicha({ mesas: item.mesas ?? [], componentes: item.componentes ?? [] }, item.quantidade, perdidas, reais, cores);
      if (c.semCor.length) {
        const tipos = Array.from(new Set(posicoes.filter((pos) => c.semCor.includes(pos.chave)).map((pos) => pos.tipo)));
        throw new ErroNegocio(`Cadastre um filamento ${tipos.join(' e ')} (em Estoque > Materiais) para dar baixa no pedido.`);
      }
      // Com gramas reais, o filamento sai dos carretéis informados nelas: grava só as cores que estão nelas.
      const usadas = reais ? Object.fromEntries(Object.entries(cores).filter(([, id]) => reais.some((g) => g.materialId === id))) : cores;
      if (Object.keys(usadas).length) coresUsadas.set(item.id, usadas);
      for (const f of c.filamentos) somar(f.materialId, f.gramas);
      for (const comp of c.componentes) somar(comp.materialId, comp.quantidade);
    }
    const ref = numeroPedido(p.numero);
    for (const [materialId, bruto] of total) {
      const qtd = roundTo(bruto, 4);
      if (!(qtd > 0)) continue;
      const mat = t.get('materiais', materialId);
      if (!mat) throw new ErroNegocio('Um dos materiais do pedido não está mais no cadastro.');
      t.insert('movMateriais', {
        materialId,
        data,
        tipo: 'pedido',
        quantidade: -qtd,
        custoUnitSnapshot: round4(mat.custoMedio),
        motivo: `Pedido ${ref}`,
        refTipo: 'pedido',
        refId: p.id,
      });
      baixas.push(mat.tipo === 'filamento' ? `${mat.nome} ${formatGramas(qtd)}` : `${mat.nome} ${formatQtd(qtd)} ${mat.unidade}`);
    }
    if (baixas.length) {
      const saldos = calcularSaldosMateriais(t.all('movMateriais'));
      for (const materialId of total.keys()) {
        const mat = t.get('materiais', materialId);
        if (mat && (saldos.get(materialId) || 0) < 0) {
          avisos.push(
            mat.tipo === 'filamento'
              ? `O saldo de "${mat.nome}" ficou negativo. Pese o carretel.`
              : `O saldo de "${mat.nome}" ficou negativo.`,
          );
        }
      }
    }
  }
  const texto = baixas.length ? `Pronto. Materiais baixados: ${baixas.join(', ')}` : 'Pronto';
  return t.update('pedidos', p.id, (atual) => ({
    ...atual,
    etapa: 'pronto',
    prontoEm: data,
    materiaisBaixados: true,
    itens: atual.itens.map((i) => (coresUsadas.has(i.id) ? { ...i, cores: coresUsadas.get(i.id) } : i)),
    historico: [...atual.historico, evento(payload.data, texto)],
  }));
}

/** Entregue: baixa os itens de catálogo de Casa (permitido negativo, com aviso) e registra o saldo pago. */
function entrarEntregue(t: Tx, p: Pedido, payload: PayloadEtapa, data: ISODate, avisos: string[]): Pedido {
  const hist: Pedido['historico'] = [];
  if (!p.catalogoBaixado) {
    for (const item of p.itens) {
      if (item.tipo !== 'catalogo' || !item.produtoId) continue;
      const saldo = saldoTx(t, item.produtoId, CASA);
      lancarMov(
        t,
        {
          data,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          origem: CASA,
          destino: null,
          tipo: 'venda_direta',
          motivo: `Pedido ${numeroPedido(p.numero)}`,
          refTipo: 'pedido',
          refId: p.id,
          custoUnit: item.custoUnit,
        },
        { permitirNegativo: true },
      );
      if (item.quantidade > saldo) {
        const faltam = item.quantidade - Math.max(0, saldo);
        avisos.push(`Faltavam ${faltam} ${faltam === 1 ? 'unidade' : 'unidades'} de "${item.descricao}" em Casa. O saldo ficou negativo.`);
      }
    }
  }
  if (payload.pagamentoSaldo) {
    const pg = inserirPagamento(t, p, { ...payload.pagamentoSaldo, tipo: 'saldo' }, data);
    hist.push(evento(payload.data, textoPagamento(pg)));
  }
  const fin = situacaoFinanceira({ ...p, etapa: 'entregue' }, t.all('pagamentos'));
  if (fin.saldoCentavos > 0) {
    hist.push(evento(payload.data, `Entregue. A receber: ${formatBRL(fin.saldoCentavos)}`));
    avisos.push(`Ficou ${formatBRL(fin.saldoCentavos)} a receber deste pedido.`);
  } else {
    hist.push(evento(payload.data, 'Entregue'));
  }
  if (fin.creditoCentavos > 0) hist.push(evento(payload.data, `Crédito do cliente: ${formatBRL(fin.creditoCentavos)}`));
  return t.update('pedidos', p.id, (atual) => ({
    ...atual,
    etapa: 'entregue',
    entregueEm: data,
    catalogoBaixado: true,
    historico: [...atual.historico, ...hist],
  }));
}

/** Cancelado: motivo obrigatório; destino do que foi pago (reter, devolver tudo ou parte). Material gasto continua baixado. */
function cancelar(t: Tx, p: Pedido, payload: PayloadEtapa, data: ISODate): Pedido {
  const motivo = (payload.motivo || '').trim();
  if (!motivo) throw new ErroNegocio('Informe o motivo do cancelamento.');
  const pago = situacaoFinanceira(p, t.all('pagamentos')).pagoCentavos;
  const hist: Pedido['historico'] = [evento(payload.data, `Cancelado: ${motivo}`)];
  let destino = payload.destinoSinal;
  if (pago > 0) {
    if (!destino) throw new ErroNegocio('Escolha o destino do sinal: reter, devolver tudo ou devolver parte.');
    let devolver = 0;
    if (destino === 'devolver_tudo') devolver = pago;
    else if (destino === 'devolver_parte') {
      const v = payload.valorDevolvidoCentavos;
      if (v == null || !Number.isInteger(v) || v <= 0 || v > pago) {
        throw new ErroNegocio(`Informe quanto vai devolver (de R$ 0,01 até ${formatBRL(pago)}).`);
      }
      devolver = v;
    }
    if (devolver > 0) {
      const forma = payload.formaDevolucao ?? 'pix';
      t.insert('pagamentos', {
        origem: 'pedido',
        refId: p.id,
        clienteId: p.clienteId,
        direcao: 'pago',
        valorCentavos: devolver,
        forma,
        data,
        tipo: 'devolucao',
        observacao: `Devolução do pedido ${numeroPedido(p.numero)}`,
      });
      hist.push(evento(payload.data, `Devolvido ao cliente: ${formatBRL(devolver)} (${ROTULO_FORMA[forma] ?? forma})`));
    }
    if (pago - devolver > 0) hist.push(evento(payload.data, `Valor retido: ${formatBRL(pago - devolver)}`));
  } else {
    destino = undefined;
  }
  return t.update('pedidos', p.id, (atual) => ({
    ...atual,
    etapa: 'cancelado',
    canceladoEm: data,
    motivoCancelamento: motivo,
    destinoSinal: destino,
    historico: [...atual.historico, ...hist],
  }));
}

/**
 * Muda a etapa do pedido com os efeitos da tabela 9.3. Só avança (pode pular etapas: os efeitos
 * das etapas puladas também acontecem, na ordem) ou cancela a partir de qualquer etapa não final.
 * - Em produção ("Aprovado" e "Em produção" numa etapa só; 'aprovado' é aceito como sinônimo): payload.sinal
 *   (grava o pagamento) ou payload.dispensarSinalMotivo; o prazo conta daqui.
 * - Pronto: baixa os materiais das peças personalizadas (payload.cores / payload.gramasReais / payload.perdidas
 *   por item).
 * - Entregue: baixa os itens de catálogo de Casa; payload.pagamentoSaldo registra o restante,
 *   senão fica "A receber".
 * - Cancelado: payload.motivo e payload.destinoSinal (+ valorDevolvidoCentavos em 'devolver_parte').
 * Pedido antigo na etapa obsoleta 'aprovado' conta como "Em produção" (vai direto para Pronto, sem aprovar de novo).
 * Tudo numa transação: se algo falhar, nada muda.
 */
export function moverEtapa(pedidoId: ID, etapa: EtapaPedido, payload: PayloadEtapa = {}): ResultadoEtapa {
  return db.tx((t) => {
    let p = obterPedido(t, pedidoId);
    const data = payload.data ?? hojeISO();
    const avisos: string[] = [];
    const atual = etapaNoFluxo(p.etapa);
    const destino = etapaNoFluxo(etapa);
    if (atual === destino) throw new ErroNegocio(`O pedido já está em "${ROTULO_ETAPA[destino]}".`);
    if (etapaFinal(atual)) throw new ErroNegocio(`Pedido ${ROTULO_ETAPA[atual].toLowerCase()} não muda mais de etapa.`);
    if (destino === 'cancelado') return { pedido: cancelar(t, p, payload, data), avisos };
    const de = ETAPAS_FLUXO.indexOf(atual);
    const para = ETAPAS_FLUXO.indexOf(destino);
    if (para < 0) throw new ErroNegocio('Etapa desconhecida.');
    if (para < de) throw new ErroNegocio('O pedido só avança. Para desistir, cancele o pedido.');
    for (let i = de + 1; i <= para; i++) {
      const prox = ETAPAS_FLUXO[i];
      if (prox === 'producao') p = entrarProducao(t, p, payload, data);
      else if (prox === 'pronto') p = entrarPronto(t, p, payload, data, avisos);
      else if (prox === 'entregue') p = entrarEntregue(t, p, payload, data, avisos);
    }
    return { pedido: p, avisos };
  });
}
