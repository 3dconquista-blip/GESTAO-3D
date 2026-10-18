// Configurações (seção 12) e assistente de primeiro acesso (seção 4).
// Toda gravação passa por db.tx (atômica). Mudar custos ou canais NUNCA muda o preço de etiqueta
// dos produtos (6.3): o produto só ganha o alerta de margem; aqui devolvemos um aviso para a tela.
import { db } from '../data/db.ts';
import { CANAIS_PADRAO, MENSAGENS_PADRAO } from '../data/defaults.ts';
import { produtosAtivos, statusMargemProduto } from '../data/selectors.ts';
import type {
  Canal,
  ChaveMensagem,
  Config,
  ID,
  Impressora,
  ISODate,
  Material,
  ParametrosCusto,
  TipoCanal,
  TipoFilamento,
} from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { normalizarBusca } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import { round4 } from '../lib/money.ts';
import { erroParametros } from '../domain/pricing.ts';
import { normalizarWhatsApp } from '../domain/whatsapp.ts';
import { ErroNegocio } from './estoque.ts';
import { salvarImpressoraTx, type DadosImpressora } from './impressoras.ts';

// ---------------------------------------------------------------- utilidades

function texto(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function numeroValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Remove chaves com valor undefined (assim um patch parcial não apaga campos). */
function semUndefined<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) if (patch[k] !== undefined) out[k] = patch[k];
  return out;
}

function exigirInteiro(v: unknown, minimo: number, mensagem: string): void {
  if (!Number.isInteger(v) || (v as number) < minimo) throw new ErroNegocio(mensagem);
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios.replace('{n}', String(n));
}

// ---------------------------------------------------------------- aviso de margem

function idsEmAlerta(): Set<ID> {
  return new Set(
    produtosAtivos()
      .filter((p) => statusMargemProduto(p) === 'prejuizo')
      .map((p) => p.id),
  );
}

/** Roda a alteração e avisa quantos produtos passaram a ficar com margem abaixo da mínima. */
function comAvisoMargem<R>(alterar: () => R): { resultado: R; avisos: string[] } {
  const antes = idsEmAlerta();
  const resultado = alterar();
  let novos = 0;
  for (const id of idsEmAlerta()) if (!antes.has(id)) novos++;
  const avisos = novos
    ? [
        plural(novos, '1 produto ficou', '{n} produtos ficaram') +
          ' com margem abaixo da mínima. O preço de etiqueta não muda sozinho: confira em Estoque > Produtos.',
      ]
    : [];
  return { resultado, avisos };
}

// ---------------------------------------------------------------- Empresa

export type DadosEmpresa = Config['empresa'];

function validarEmpresa(e: DadosEmpresa): DadosEmpresa {
  const nome = texto(e.nome);
  if (!nome) throw new ErroNegocio('Informe o nome da empresa.');
  const whatsapp = texto(e.whatsapp);
  if (whatsapp) {
    const r = normalizarWhatsApp(whatsapp);
    if (r.erro) throw new ErroNegocio(`WhatsApp da empresa: ${r.erro}`);
  }
  const corPrincipal = texto(e.corPrincipal) || '#2B4A6B';
  if (!/^#[0-9a-f]{6}$/i.test(corPrincipal)) throw new ErroNegocio('Escolha uma cor principal válida (ex.: #2B4A6B).');
  return {
    ...e,
    nome,
    corPrincipal,
    whatsapp,
    chavePix: texto(e.chavePix),
    nomePix: texto(e.nomePix),
    cidade: texto(e.cidade),
    politicaCancelamento: texto(e.politicaCancelamento),
    logoDataUrl: e.logoDataUrl || undefined,
  };
}

/** Atualiza os dados da empresa (nome, logo, cor, WhatsApp, chave PIX, recebedor, cidade, política de cancelamento). */
export function atualizarEmpresa(patch: Partial<DadosEmpresa>): DadosEmpresa {
  return db.tx((t) => {
    const empresa = validarEmpresa({ ...db.config.empresa, ...semUndefined(patch) });
    t.config({ empresa });
    return empresa;
  });
}

// ---------------------------------------------------------------- Custos e preços (6.1)

const PERCENTUAIS: [keyof ParametrosCusto, string][] = [
  ['taxaFalhaPct', 'Taxa de falha'],
  ['impostoPct', 'Imposto sobre o que você recebe'],
  ['margemDesejadaPct', 'Margem desejada'],
  ['margemMinimaPct', 'Margem mínima de alerta'],
  ['taxaCartaoPct', 'Taxa do cartão'],
];

const VALORES: [keyof ParametrosCusto, string][] = [
  ['tarifaKwh', 'Tarifa de energia'],
  ['valorHora', 'Valor da sua hora de trabalho'],
  ['valorHoraModelagem', 'Valor da hora de modelagem'],
];

const CENTAVOS: [keyof ParametrosCusto, string][] = [
  ['custosFixosMensaisCentavos', 'Custos fixos mensais'],
  ['limiteMeiCentavos', 'Limite anual do MEI'],
];

/** Valida os parâmetros de custo; lança ErroNegocio com a explicação. Devolve avisos que não bloqueiam. */
function validarCustos(c: ParametrosCusto): string[] {
  for (const [campo, rotulo] of PERCENTUAIS) {
    const v = c[campo];
    if (!numeroValido(v) || v < 0 || v > 100) throw new ErroNegocio(`"${rotulo}" precisa ficar entre 0% e 100%.`);
  }
  if (c.taxaCartaoPct >= 100) {
    throw new ErroNegocio('A taxa do cartão precisa ser menor que 100%. Assim você não recebe nada no cartão.');
  }
  const erro = erroParametros(c);
  if (erro) throw new ErroNegocio(erro);
  for (const [campo, rotulo] of VALORES) {
    const v = c[campo];
    if (!numeroValido(v) || v < 0) throw new ErroNegocio(`"${rotulo}" não pode ser negativo.`);
  }
  for (const [campo, rotulo] of CENTAVOS) {
    exigirInteiro(c[campo], 0, `"${rotulo}" não pode ser negativo.`);
  }
  if (!['noventa', 'inteiro', 'nenhum'].includes(c.arredondamento)) {
    throw new ErroNegocio('Escolha o arredondamento do preço: terminar em ,90, inteiro ou nenhum.');
  }
  const avisos: string[] = [];
  if (c.margemMinimaPct > c.margemDesejadaPct) {
    avisos.push('A margem mínima de alerta está maior que a margem desejada: até os preços sugeridos vão aparecer em vermelho.');
  }
  return avisos;
}

/** O canal do tipo 'cartao' sempre acompanha a taxa do cartão. */
function sincronizarCartao(canais: Canal[], taxaCartaoPct: number): Canal[] {
  return canais.map((c) => (c.tipo === 'cartao' ? { ...c, comissaoPct: taxaCartaoPct } : c));
}

/**
 * Atualiza os parâmetros de custo (6.1). Percentuais de 0 a 100; imposto + margem desejada abaixo de 100%;
 * valores e tarifas não negativos. Margem mínima acima da desejada é permitida, com aviso.
 * Não mexe no preço de etiqueta dos produtos: avisa quantos ficaram com margem abaixo da mínima.
 */
export function atualizarCustos(patch: Partial<ParametrosCusto>): { custos: ParametrosCusto; avisos: string[] } {
  let avisosCustos: string[] = [];
  const { resultado, avisos } = comAvisoMargem(() =>
    db.tx((t) => {
      const custos: ParametrosCusto = { ...db.config.custos, ...semUndefined(patch) };
      avisosCustos = validarCustos(custos);
      t.config((c) => ({ ...c, custos, canais: sincronizarCartao(c.canais, custos.taxaCartaoPct) }));
      return custos;
    }),
  );
  return { custos: resultado, avisos: [...avisosCustos, ...avisos] };
}

// ---------------------------------------------------------------- Canais

const TIPOS_CANAL: TipoCanal[] = ['direto', 'cartao', 'parceiro', 'marketplace', 'outro'];
const IDS_PADRAO = new Set(CANAIS_PADRAO.map((c) => c.id));

/** Canal criado pelo dono (só esses podem ser removidos; os padrão só podem ser desligados). */
export function canalPersonalizado(canal: Pick<Canal, 'id'>): boolean {
  return !IDS_PADRAO.has(canal.id);
}

function novoIdCanal(usados: Set<string>): string {
  let id = `canal_${novoId().slice(0, 8)}`;
  while (usados.has(id)) id = `canal_${novoId().slice(0, 8)}`;
  return id;
}

/** Normaliza e valida um canal. Canais padrão mantêm o tipo; o cartão segue a taxa do cartão. */
function validarCanal(c: Partial<Canal>, custos: ParametrosCusto, usados: Set<string>): Canal {
  const nome = texto(c.nome);
  if (!nome) throw new ErroNegocio('Informe o nome do canal.');
  const padrao = CANAIS_PADRAO.find((p) => p.id === c.id);
  const tipo = padrao ? padrao.tipo : (c.tipo ?? 'outro');
  if (!TIPOS_CANAL.includes(tipo)) throw new ErroNegocio(`Tipo de canal inválido em "${nome}".`);
  const comissaoPct = tipo === 'cartao' ? custos.taxaCartaoPct : (c.comissaoPct ?? 0);
  if (!numeroValido(comissaoPct) || comissaoPct < 0) {
    throw new ErroNegocio(`A comissão do canal "${nome}" não pode ser negativa.`);
  }
  if (comissaoPct >= 100) {
    throw new ErroNegocio(`A comissão do canal "${nome}" é de 100% ou mais. Assim você não recebe nada. Corrija a comissão.`);
  }
  const tarifaFixaCentavos = c.tarifaFixaCentavos ?? 0;
  exigirInteiro(tarifaFixaCentavos, 0, `A tarifa fixa do canal "${nome}" não pode ser negativa.`);
  return {
    id: texto(c.id) || novoIdCanal(usados),
    nome,
    tipo,
    comissaoPct,
    tarifaFixaCentavos,
    ativo: c.ativo !== false,
  };
}

function validarListaCanais(canais: Canal[]): void {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const c of canais) {
    if (ids.has(c.id)) throw new ErroNegocio(`O canal "${c.nome}" aparece duas vezes.`);
    const n = normalizarBusca(c.nome);
    if (nomes.has(n)) throw new ErroNegocio(`Já existe um canal com o nome "${c.nome}".`);
    ids.add(c.id);
    nomes.add(n);
  }
  for (const p of CANAIS_PADRAO) {
    if (!ids.has(p.id)) throw new ErroNegocio(`O canal "${p.nome}" é padrão e não pode ser removido. Desligue-o se não usa.`);
  }
  if (!canais.some((c) => c.ativo)) throw new ErroNegocio('Deixe pelo menos um canal ativo.');
}

/**
 * Substitui a lista de canais (nome, comissão, tarifa fixa, ativo). Comissão menor que 100%,
 * pelo menos um canal ativo, canais padrão não podem sumir e o canal 'cartao' sempre usa a taxa do cartão.
 */
export function atualizarCanais(canais: Canal[]): { canais: Canal[]; avisos: string[] } {
  const { resultado, avisos } = comAvisoMargem(() =>
    db.tx((t) => {
      const custos = db.config.custos;
      const usados = new Set(canais.map((c) => c.id).filter(Boolean));
      const lista = canais.map((c) => validarCanal(c, custos, usados));
      validarListaCanais(lista);
      t.config({ canais: lista });
      return lista;
    }),
  );
  return { canais: resultado, avisos };
}

/** Dados de um canal novo criado pelo dono. */
export interface DadosCanal {
  nome: string;
  /** Padrão 'outro'. */
  tipo?: TipoCanal;
  comissaoPct?: number;
  tarifaFixaCentavos?: number;
  /** Padrão true. */
  ativo?: boolean;
}

/** Adiciona um canal personalizado (ex.: outro marketplace). */
export function adicionarCanal(dados: DadosCanal): { canal: Canal; avisos: string[] } {
  const { resultado, avisos } = comAvisoMargem(() =>
    db.tx((t) => {
      const atuais = db.config.canais;
      const canal = validarCanal({ ...dados, id: undefined }, db.config.custos, new Set(atuais.map((c) => c.id)));
      const lista = [...atuais, canal];
      validarListaCanais(lista);
      t.config({ canais: lista });
      return canal;
    }),
  );
  return { canal: resultado, avisos };
}

/** Remove um canal criado pelo dono. Os canais padrão não podem ser removidos (só desligados). */
export function removerCanal(id: string): Canal[] {
  return db.tx((t) => {
    const canal = db.config.canais.find((c) => c.id === id);
    if (!canal) throw new ErroNegocio('Canal não encontrado.');
    if (!canalPersonalizado(canal)) {
      throw new ErroNegocio(`O canal "${canal.nome}" é padrão e não pode ser removido. Desligue-o se não usa.`);
    }
    const lista = db.config.canais.filter((c) => c.id !== id);
    validarListaCanais(lista);
    t.config({ canais: lista });
    return lista;
  });
}

// ---------------------------------------------------------------- Parcerias, pedidos e estoque

/**
 * Atualiza os padrões de parceria: divisões disponíveis (% do parceiro, maior que 0 e menor que 100),
 * frequência padrão (dias), dias de aviso e limite de baixo desempenho (centavos).
 */
export function atualizarParcerias(patch: Partial<Config['parcerias']>): Config['parcerias'] {
  return db.tx((t) => {
    const p = { ...db.config.parcerias, ...semUndefined(patch) };
    if (!Array.isArray(p.divisoes)) throw new ErroNegocio('Informe as divisões disponíveis.');
    const divisoes: number[] = [];
    for (const d of p.divisoes) {
      if (!numeroValido(d) || d <= 0 || d >= 100) {
        throw new ErroNegocio('Cada divisão é o % do parceiro e precisa ficar entre 0% e 100% (ex.: 30 para 70/30).');
      }
      if (!divisoes.includes(d)) divisoes.push(d);
    }
    if (!divisoes.length) throw new ErroNegocio('Deixe pelo menos uma divisão disponível.');
    exigirInteiro(p.frequenciaPadraoDias, 1, 'A frequência padrão precisa ser de pelo menos 1 dia.');
    exigirInteiro(p.diasAviso, 0, 'Os dias de aviso não podem ser negativos.');
    exigirInteiro(p.limiteBaixoDesempenhoCentavos, 0, 'O limite de baixo desempenho não pode ser negativo.');
    const parcerias = { ...p, divisoes };
    t.config({ parcerias });
    return parcerias;
  });
}

/** Padrões dos pedidos (9.2): pedido mínimo, validade, urgência, desconto por quantidade e sinal. O número do pedido não é editável. */
export function atualizarPedidosConfig(patch: Partial<Omit<Config['pedidos'], 'proximoNumero'>>): Config['pedidos'] {
  return db.tx((t) => {
    const { proximoNumero: _ignorado, ...resto } = patch as Partial<Config['pedidos']>;
    const p = { ...db.config.pedidos, ...semUndefined(resto) };
    exigirInteiro(p.pedidoMinimoCentavos, 0, 'O pedido mínimo não pode ser negativo.');
    exigirInteiro(p.validadeDias, 1, 'A validade do orçamento precisa ser de pelo menos 1 dia.');
    const pcts: [number, string][] = [
      [p.urgenciaPct, 'A urgência'],
      [p.descontoQtdPct, 'O desconto por quantidade'],
      [p.sinalPct, 'O sinal'],
    ];
    for (const [v, rotulo] of pcts) {
      if (!numeroValido(v) || v < 0 || v > 100) throw new ErroNegocio(`${rotulo} precisa ficar entre 0% e 100%.`);
    }
    if (p.descontoQtdPct >= 100) throw new ErroNegocio('O desconto por quantidade precisa ser menor que 100%.');
    exigirInteiro(p.descontoQtdAPartir, 1, 'O desconto por quantidade precisa começar em pelo menos 1 unidade.');
    t.config({ pedidos: p });
    return p;
  });
}

/** Padrões de estoque: dias sem venda para o alerta (7.6) e mínimo padrão de filamento em gramas (7.3). */
export function atualizarEstoqueConfig(patch: Partial<Config['estoque']>): Config['estoque'] {
  return db.tx((t) => {
    const e = { ...db.config.estoque, ...semUndefined(patch) };
    exigirInteiro(e.diasSemVendaAlerta, 1, 'Os dias sem venda para o alerta precisam ser pelo menos 1.');
    if (!numeroValido(e.minimoFilamentoPadraoG) || e.minimoFilamentoPadraoG < 0) {
      throw new ErroNegocio('O mínimo padrão de filamento não pode ser negativo.');
    }
    t.config({ estoque: e });
    return e;
  });
}

// ---------------------------------------------------------------- Mensagens

function exigirChave(chave: ChaveMensagem): void {
  if (!Object.prototype.hasOwnProperty.call(MENSAGENS_PADRAO, chave)) throw new ErroNegocio('Modelo de mensagem desconhecido.');
}

/** Salva o texto de um modelo de mensagem (variáveis entre chaves, ex.: {cliente}). */
export function atualizarMensagem(chave: ChaveMensagem, textoNovo: string): string {
  exigirChave(chave);
  const t2 = texto(textoNovo);
  if (!t2) throw new ErroNegocio('A mensagem não pode ficar vazia. Use "Restaurar padrão" para voltar ao texto original.');
  return db.tx((t) => {
    t.config((c) => ({ ...c, mensagens: { ...c.mensagens, [chave]: t2 } }));
    return t2;
  });
}

/** Volta o modelo de mensagem ao texto padrão. */
export function restaurarMensagem(chave: ChaveMensagem): string {
  exigirChave(chave);
  const padrao = MENSAGENS_PADRAO[chave];
  return db.tx((t) => {
    t.config((c) => ({ ...c, mensagens: { ...c.mensagens, [chave]: padrao } }));
    return padrao;
  });
}

// ---------------------------------------------------------------- Categorias

function acharCategoria(nome: string): string | undefined {
  const alvo = normalizarBusca(nome);
  return db.config.categorias.find((c) => normalizarBusca(c) === alvo);
}

/** Adiciona uma categoria de produto (sem repetir, ignorando maiúsculas e acentos). */
export function adicionarCategoria(nome: string): string[] {
  const n = texto(nome);
  if (!n) throw new ErroNegocio('Informe o nome da categoria.');
  return db.tx((t) => {
    const existente = acharCategoria(n);
    if (existente) throw new ErroNegocio(`Já existe a categoria "${existente}".`);
    return t.config((c) => ({ ...c, categorias: [...c.categorias, n] })).categorias;
  });
}

/** Renomeia uma categoria e troca o nome em todos os produtos que a usam (inclusive arquivados), na mesma transação. */
export function renomearCategoria(atual: string, novo: string): { categorias: string[]; produtosAlterados: number } {
  const n = texto(novo);
  if (!n) throw new ErroNegocio('Informe o novo nome da categoria.');
  return db.tx((t) => {
    const antiga = acharCategoria(atual);
    if (!antiga) throw new ErroNegocio('Categoria não encontrada.');
    const conflito = acharCategoria(n);
    if (conflito && conflito !== antiga) throw new ErroNegocio(`Já existe a categoria "${conflito}".`);
    const categorias = t.config((c) => ({ ...c, categorias: c.categorias.map((x) => (x === antiga ? n : x)) })).categorias;
    const alvo = normalizarBusca(antiga);
    let produtosAlterados = 0;
    for (const p of t.all('produtos')) {
      if (normalizarBusca(p.categoria) !== alvo || p.categoria === n) continue;
      t.update('produtos', p.id, { categoria: n });
      produtosAlterados++;
    }
    return { categorias, produtosAlterados };
  });
}

/** Remove uma categoria. Recusa se algum produto (inclusive arquivado) a usa, ou se for a última. */
export function removerCategoria(nome: string): string[] {
  return db.tx((t) => {
    const cat = acharCategoria(nome);
    if (!cat) throw new ErroNegocio('Categoria não encontrada.');
    const alvo = normalizarBusca(cat);
    const emUso = t.all('produtos').filter((p) => normalizarBusca(p.categoria) === alvo).length;
    if (emUso) {
      throw new ErroNegocio(
        `A categoria "${cat}" está em ${plural(emUso, '1 produto', '{n} produtos')}. Troque a categoria ${plural(emUso, 'dele', 'deles')} antes de remover.`,
      );
    }
    if (db.config.categorias.length <= 1) throw new ErroNegocio('Deixe pelo menos uma categoria.');
    return t.config((c) => ({ ...c, categorias: c.categorias.filter((x) => x !== cat) })).categorias;
  });
}

// ---------------------------------------------------------------- Assistente de primeiro acesso (4)

const TIPOS_FILAMENTO: TipoFilamento[] = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro'];

/** Filamento informado no passo 3 do assistente. */
export interface FilamentoInicial {
  material: TipoFilamento;
  corNome: string;
  corHex?: string;
  marca?: string;
  /** Padrão: "<material> <cor>" (ex.: 'PLA Preto'); para 'Outro', "Filamento <cor>". */
  nome?: string;
  /** Custo médio em R$ por kg (maior que zero). */
  custoMedio: number;
  /** Saldo inicial em gramas (vira um ajuste "Saldo inicial"; 0 ou vazio não lança nada). */
  gramasIniciais?: number | null;
}

export interface DadosOnboarding {
  /** Passo 1: nome da empresa e chave PIX. */
  empresa: { nome: string; chavePix: string; nomePix: string; whatsapp?: string };
  /** Passo 2: impressoras (campos vazios usam o padrão do modelo). */
  impressoras: DadosImpressora[];
  /** Passo 3: filamentos. */
  filamentos: FilamentoInicial[];
  /** Data do ajuste de saldo inicial (padrão: hoje). */
  data?: ISODate;
}

/** Nome padrão do filamento: 'PLA Preto'; para material 'Outro', 'Filamento Preto'. */
export function nomeFilamento(material: TipoFilamento, corNome: string): string {
  const cor = texto(corNome);
  return material === 'Outro' ? `Filamento ${cor}` : `${material} ${cor}`;
}

/**
 * Conclui o assistente de primeiro acesso numa única transação: salva a empresa, cria as impressoras e
 * os filamentos (saldo inicial como ajuste "Saldo inicial"; 0 não lança movimento) e marca o onboarding
 * como concluído. Se algo for inválido, nada é gravado.
 */
export function concluirOnboarding(dados: DadosOnboarding): { config: Config; impressoras: Impressora[]; materiais: Material[] } {
  return db.tx((t) => {
    if (db.config.onboardingConcluido) throw new ErroNegocio('O assistente de primeiro acesso já foi concluído.');
    const e = dados.empresa;
    const nomeEmpresa = texto(e.nome);
    const chavePix = texto(e.chavePix);
    const empresa = validarEmpresa({
      ...db.config.empresa,
      nome: nomeEmpresa,
      chavePix,
      // Sem nome do recebedor, as mensagens perderiam a linha do PIX: usa o nome da empresa.
      nomePix: texto(e.nomePix) || (chavePix ? nomeEmpresa : ''),
      whatsapp: texto(e.whatsapp) || db.config.empresa.whatsapp,
    });
    t.config({ empresa });

    const impressoras = (dados.impressoras ?? []).map(({ id: _id, ...imp }) => salvarImpressoraTx(t, imp));

    const data = dados.data ?? hojeISO();
    const nomes = new Set(
      t
        .all('materiais')
        .filter((m) => !m.arquivado)
        .map((m) => normalizarBusca(m.nome)),
    );
    const materiais = (dados.filamentos ?? []).map((f, i) => {
      if (!TIPOS_FILAMENTO.includes(f.material)) {
        throw new ErroNegocio(`Filamento ${i + 1}: escolha o material (PLA, PETG, TPU, ABS, ASA ou outro).`);
      }
      const corNome = texto(f.corNome);
      if (!corNome) throw new ErroNegocio(`Filamento ${i + 1}: informe a cor.`);
      const nome = texto(f.nome) || nomeFilamento(f.material, corNome);
      if (!numeroValido(f.custoMedio) || f.custoMedio <= 0) {
        throw new ErroNegocio(`Filamento "${nome}": informe o custo do kg (maior que zero).`);
      }
      const gramas = f.gramasIniciais ?? 0;
      if (!numeroValido(gramas) || gramas < 0) {
        throw new ErroNegocio(`Filamento "${nome}": o saldo inicial em gramas não pode ser negativo.`);
      }
      const chave = normalizarBusca(nome);
      if (nomes.has(chave)) throw new ErroNegocio(`O filamento "${nome}" já foi informado.`);
      nomes.add(chave);

      const mat = t.insert('materiais', {
        tipo: 'filamento',
        nome,
        material: f.material,
        corNome,
        corHex: texto(f.corHex) || undefined,
        marca: texto(f.marca) || undefined,
        unidade: 'g',
        custoMedio: round4(f.custoMedio),
        minimo: db.config.estoque.minimoFilamentoPadraoG,
        arquivado: false,
      });
      if (gramas > 0) {
        t.insert('movMateriais', {
          materialId: mat.id,
          data,
          tipo: 'ajuste',
          quantidade: gramas,
          custoUnitSnapshot: mat.custoMedio,
          motivo: 'Saldo inicial',
          refTipo: 'ajuste',
        });
      }
      return mat;
    });

    const config = t.config({ onboardingConcluido: true });
    return { config, impressoras, materiais };
  });
}
