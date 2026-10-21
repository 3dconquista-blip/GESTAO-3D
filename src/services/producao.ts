// "Registrar produção" (seção 7.4): as peças boas entram em Casa e os materiais da ficha técnica são baixados.
// Filamento = para cada mesa e filamento, (gramas da mesa ÷ N) × (boas + perdidas), baixado do carretel da cor
// escolhida para aquela posição (decisão 85; sem escolha: a última cor usada no produto, a sugerida pela ficha ou
// o carretel do tipo com mais saldo). "Informar gramas reais" substitui o cálculo.
// Componentes = quantidade por peça × boas. O saldo de material pode ficar negativo (a tela mostra em vermelho).
// A falha real não muda o custo do produto (o custo já tem a taxa de falha).
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import type { ID, ISODate, Material, MesaFilamento, Producao, Produto } from '../data/types.ts';
import { CASA } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { round4, roundTo } from '../lib/money.ts';
import { consumoFicha } from '../domain/consumo.ts';
import type { PosicaoFilamento } from '../domain/filamento.ts';
import { carreteisDoTipo, carretelPadrao, posicoesDaFicha } from '../domain/filamento.ts';
import { idsEstornados } from '../domain/stock.ts';
import { ErroNegocio, estornarMov, lancarMov, saldoTx } from './estoque.ts';
import { estornarMovsMaterialDaRef, lancarMovMaterial } from './materiais.ts';

export interface DadosProducao {
  produtoId: ID;
  /** Peças boas (entram em Casa). */
  qtdBoa: number;
  /** Peças perdidas em falhas (padrão 0). */
  qtdPerdida?: number;
  data?: ISODate;
  /** "Informar gramas reais": total de gramas por filamento; substitui o cálculo pela ficha. */
  gramasReais?: MesaFilamento[];
  /** Cor (carretel) de cada posição de filamento: 'mesaId:indice' -> materialId. Faltando, vale o padrão. */
  cores?: Record<string, ID>;
}

export interface ConsumoPrevia {
  materialId: ID;
  nome: string;
  tipo: Material['tipo'];
  /** 'g' (filamento) ou a unidade do insumo. */
  unidade: string;
  /** Quanto será baixado (positivo). */
  quantidade: number;
  saldoAntes: number;
  saldoDepois: number;
  /** O saldo cobre o consumo. Se não cobrir, a baixa acontece mesmo assim e o saldo fica negativo (vermelho). */
  suficiente: boolean;
}

export interface PreviaProducao {
  produtoId: ID;
  nomeProduto: string;
  qtdBoa: number;
  qtdPerdida: number;
  /** Peças que entram em Casa (= boas). */
  entramEmCasa: number;
  saldoCasaAntes: number;
  saldoCasaDepois: number;
  /** Custo unitário atual (reais, 4 casas); fica gravado na produção. */
  custoUnit: number;
  /** Boas × custo (reais, 4 casas). */
  valorEntrada: number;
  usaGramasReais: boolean;
  consumo: ConsumoPrevia[];
  /** Algum material vai ficar com saldo negativo. */
  faltaMaterial: boolean;
}

function dataOuHoje(data?: ISODate | null): ISODate {
  if (data == null || data === '') return hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroNegocio('Data inválida.');
  return data;
}

/** Última cor usada em cada posição da ficha, nas produções não estornadas do produto (a mais recente vence). */
function ultimasCores(produtoId: ID, producoes: Producao[]): Record<string, ID> {
  const out: Record<string, ID> = {};
  const doProduto = producoes
    .filter((p) => p.produtoId === produtoId && !p.estornada && p.cores)
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
  for (const p of doProduto) Object.assign(out, p.cores);
  return out;
}

/**
 * Cor de cada posição de filamento: a escolhida; senão a última usada no produto; senão a sugerida pela ficha;
 * senão o carretel ativo do tipo com mais saldo. Posição sem nenhum carretel do tipo fica sem cor.
 */
function resolverCores(
  produto: Produto,
  escolhidas: Record<string, ID> | undefined,
  getMaterial: (id: ID) => Material | undefined,
  todosMateriais: Material[],
  producoes: Producao[],
): Record<string, ID> {
  const ultimas = ultimasCores(produto.id, producoes);
  const out: Record<string, ID> = {};
  for (const p of posicoesDaFicha(produto.mesas, getMaterial)) {
    const escolhida = escolhidas?.[p.chave];
    if (escolhida) {
      const m = getMaterial(escolhida);
      if (!m || m.tipo !== 'filamento') throw new ErroNegocio('A cor escolhida não é um filamento cadastrado.');
      out[p.chave] = m.id;
      continue;
    }
    const padrao = carretelPadrao(todosMateriais, p.tipo, saldoMaterial, [ultimas[p.chave], p.materialId]);
    if (padrao) out[p.chave] = padrao.id;
  }
  return out;
}

export interface CorDaPosicao {
  chave: string;
  /** "PLA", ou "Mesa 2 (PLA)" quando o produto tem mais de uma posição. */
  rotulo: string;
  tipo: Material['material'];
  /** Cor que será usada se nada for escolhido. */
  padrao: ID | undefined;
  /** Carretéis ativos do tipo, para escolher. */
  opcoes: Material[];
}

/**
 * Rótulo, cor padrão e cores disponíveis (carretéis ativos do tipo, pelo nome) de cada posição de filamento.
 * Usado na produção e na baixa de peças personalizadas dos pedidos.
 */
export function coresDasPosicoes(posicoes: PosicaoFilamento[], padrao: Record<string, ID>, materiais: Material[]): CorDaPosicao[] {
  const variasMesas = new Set(posicoes.map((p) => p.mesaId)).size > 1;
  const variasCores = posicoes.some((p) => p.indice > 0);
  return posicoes.map((p) => ({
    chave: p.chave,
    rotulo:
      posicoes.length <= 1
        ? p.tipo
        : `${[variasMesas ? `Mesa ${p.mesaIndice + 1}` : '', variasCores ? `Cor ${p.indice + 1}` : ''].filter(Boolean).join(' · ')} (${p.tipo})`,
    tipo: p.tipo,
    padrao: padrao[p.chave],
    opcoes: carreteisDoTipo(materiais, p.tipo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }));
}

/** Posições de filamento do produto com a cor padrão e as cores disponíveis (para a tela de produção). */
export function coresDaProducao(produtoId: ID): CorDaPosicao[] {
  const produto = db.get('produtos', produtoId);
  if (!produto) return [];
  const getMaterial = (id: ID) => db.get('materiais', id);
  const padrao = resolverCores(produto, undefined, getMaterial, db.all('materiais'), db.all('producoes'));
  return coresDasPosicoes(posicoesDaFicha(produto.mesas, getMaterial), padrao, db.all('materiais'));
}

interface ProducaoValidada {
  produto: Produto;
  qtdBoa: number;
  qtdPerdida: number;
  gramasReais?: MesaFilamento[];
  /** Cor usada em cada posição de filamento. */
  cores: Record<string, ID>;
  /** Consumo por material (positivo): filamentos e depois componentes. */
  consumo: { materialId: ID; quantidade: number }[];
}

function validar(
  dados: DadosProducao,
  getProduto: (id: ID) => Produto | undefined,
  getMaterial: (id: ID) => Material | undefined,
  todosMateriais: Material[],
  producoes: Producao[],
): ProducaoValidada {
  const produto = getProduto(dados.produtoId);
  if (!produto) throw new ErroNegocio('Produto não encontrado.');
  const qtdBoa = dados.qtdBoa ?? 0;
  const qtdPerdida = dados.qtdPerdida ?? 0;
  if (!Number.isInteger(qtdBoa) || qtdBoa < 0) throw new ErroNegocio('A quantidade boa precisa ser um número inteiro (0 ou mais).');
  if (!Number.isInteger(qtdPerdida) || qtdPerdida < 0) throw new ErroNegocio('A quantidade perdida precisa ser um número inteiro (0 ou mais).');
  if (qtdBoa + qtdPerdida <= 0) throw new ErroNegocio('Informe quantas peças foram produzidas.');
  if (!produto.mesas || produto.mesas.length === 0) {
    throw new ErroNegocio(`"${produto.nome}" ainda não tem ficha técnica. Cadastre pelo menos uma mesa antes de registrar a produção.`);
  }
  let gramasReais: MesaFilamento[] | undefined;
  if (dados.gramasReais && dados.gramasReais.length > 0) {
    gramasReais = dados.gramasReais.map((g) => {
      if (!g.materialId || !getMaterial(g.materialId)) throw new ErroNegocio('Filamento das gramas reais não encontrado.');
      if (!Number.isFinite(g.gramas) || g.gramas < 0) throw new ErroNegocio('As gramas reais precisam ser 0 ou mais.');
      return { materialId: g.materialId, gramas: roundTo(g.gramas, 2) };
    });
  }
  const cores = resolverCores(produto, dados.cores, getMaterial, todosMateriais, producoes);
  const c = consumoFicha(produto, qtdBoa, qtdPerdida, gramasReais, cores);
  if (c.semCor.length) {
    const tipos = Array.from(new Set(posicoesDaFicha(produto.mesas, getMaterial).filter((p) => c.semCor.includes(p.chave)).map((p) => p.tipo)));
    throw new ErroNegocio(`Cadastre um filamento ${tipos.join(' e ')} (em Estoque > Materiais) para registrar a produção.`);
  }
  const consumo = [
    ...c.filamentos.map((f) => ({ materialId: f.materialId, quantidade: f.gramas })),
    ...c.componentes.map((k) => ({ materialId: k.materialId, quantidade: k.quantidade })),
  ];
  for (const k of consumo) {
    if (!getMaterial(k.materialId)) throw new ErroNegocio(`Um material da ficha de "${produto.nome}" não foi encontrado. Revise a ficha técnica.`);
  }
  return { produto, qtdBoa, qtdPerdida, gramasReais, cores, consumo };
}

/** Resumo de "Registrar produção" para a confirmação: consumo por material, saldos antes/depois e peças que entram em Casa. Não grava. */
export function previaProducao(dados: DadosProducao): PreviaProducao {
  const v = validar(
    dados,
    (id) => db.get('produtos', id),
    (id) => db.get('materiais', id),
    db.all('materiais'),
    db.all('producoes'),
  );
  const custoUnit = custoProduto(v.produto.id);
  const consumo: ConsumoPrevia[] = v.consumo.map((k) => {
    const m = db.get('materiais', k.materialId) as Material;
    const saldoAntes = roundTo(saldoMaterial(m.id), 4);
    const saldoDepois = roundTo(saldoAntes - k.quantidade, 4);
    return {
      materialId: m.id,
      nome: m.nome,
      tipo: m.tipo,
      unidade: m.tipo === 'filamento' ? 'g' : m.unidade || 'un',
      quantidade: k.quantidade,
      saldoAntes,
      saldoDepois,
      suficiente: saldoDepois >= 0,
    };
  });
  const saldoCasaAntes = saldoCasa(v.produto.id);
  return {
    produtoId: v.produto.id,
    nomeProduto: v.produto.nome,
    qtdBoa: v.qtdBoa,
    qtdPerdida: v.qtdPerdida,
    entramEmCasa: v.qtdBoa,
    saldoCasaAntes,
    saldoCasaDepois: saldoCasaAntes + v.qtdBoa,
    custoUnit,
    valorEntrada: round4(v.qtdBoa * custoUnit),
    usaGramasReais: !!v.gramasReais,
    consumo,
    faltaMaterial: consumo.some((k) => !k.suficiente),
  };
}

/**
 * "Registrar produção": grava a produção (com o custo unitário do momento), lança a entrada das boas em Casa
 * e a baixa de filamentos e componentes (movimentos 'producao'). Tudo numa transação.
 */
export function registrarProducao(dados: DadosProducao): Producao {
  const custoUnit = custoProduto(dados.produtoId);
  return db.tx((t) => {
    const v = validar(
      dados,
      (id) => t.get('produtos', id),
      (id) => t.get('materiais', id),
      t.all('materiais'),
      t.all('producoes'),
    );
    const data = dataOuHoje(dados.data);
    const producao = t.insert('producoes', {
      data,
      produtoId: v.produto.id,
      qtdBoa: v.qtdBoa,
      qtdPerdida: v.qtdPerdida,
      gramasReais: v.gramasReais,
      cores: v.cores,
      custoUnit: round4(custoUnit),
    });
    if (v.qtdBoa > 0) {
      lancarMov(t, {
        data,
        produtoId: v.produto.id,
        quantidade: v.qtdBoa,
        origem: null,
        destino: CASA,
        tipo: 'producao',
        refTipo: 'producao',
        refId: producao.id,
        custoUnit,
      });
    }
    for (const k of v.consumo) {
      if (!(k.quantidade > 0)) continue;
      lancarMovMaterial(t, {
        materialId: k.materialId,
        tipo: 'producao',
        quantidade: -k.quantidade,
        data,
        refTipo: 'producao',
        refId: producao.id,
      });
    }
    return producao;
  });
}

/**
 * Estorna uma produção: tira de Casa as peças que ela colocou (bloqueia se Casa não tiver mais essas peças),
 * devolve os materiais baixados e marca a produção como estornada.
 */
export function estornarProducao(producaoId: ID, motivo: string, data?: ISODate): Producao {
  return db.tx((t) => {
    const producao = t.get('producoes', producaoId);
    if (!producao) throw new ErroNegocio('Produção não encontrada.');
    if (producao.estornada) throw new ErroNegocio('Esta produção já foi estornada.');
    const m = (motivo ?? '').trim();
    if (!m) throw new ErroNegocio('Informe o motivo do estorno.');
    const dataEstorno = dataOuHoje(data);

    const movs = t.all('movEstoque');
    const est = idsEstornados(movs);
    const entradas = movs.filter((mv) => mv.refTipo === 'producao' && mv.refId === producaoId && mv.tipo === 'producao' && !est.has(mv.id));
    for (const mv of entradas) {
      const local = mv.destino ?? CASA;
      const saldo = saldoTx(t, mv.produtoId, local);
      if (saldo < mv.quantidade) {
        const nome = t.get('produtos', mv.produtoId)?.nome ?? 'produto';
        throw new ErroNegocio(
          `Não dá para estornar: esta produção colocou ${mv.quantidade} de "${nome}" em Casa, mas agora há só ${saldo}. ` +
            'Para corrigir a quantidade, faça um ajuste de inventário.',
        );
      }
      estornarMov(t, mv.id, m, { data: dataEstorno, permitirNegativo: false });
    }
    estornarMovsMaterialDaRef(t, 'producao', producaoId, m, dataEstorno);
    return t.update('producoes', producaoId, { estornada: true });
  });
}
