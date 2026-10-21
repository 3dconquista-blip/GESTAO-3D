// Parceiros (seção 8): cadastro (8.1), mix (8.3), instalação (8.4), reposição avulsa (8.5), recolhimento,
// pausa/arquivamento e encerramento da parceria (8.10). O acerto (8.6/8.7) fica em outro serviço.
// Toda gravação passa por db.tx (atômica). As funções previa* devolvem o resumo para a confirmação
// (`confirmar({ titulo, itens })`) e o motivo de bloqueio, sem gravar nada.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import type { Acerto, Cents, Expositor, ID, ISODate, ItemMix, Parceiro, QuemRecebe, TipoParceiro } from '../data/types.ts';
import { CASA, localParceiro } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { formatBRL, formatData } from '../lib/format.ts';
import { novoId } from '../lib/id.ts';
import { roundTo } from '../lib/money.ts';
import { erroMix, mesclarNoMix, precoNoMix } from '../domain/mix.ts';
import { calcularSaldos, idsEstornados, saldoNoLocal } from '../domain/stock.ts';
import { montarTermo, rotuloDivisao, type ItemTermo, type Termo } from '../domain/termo.ts';
import { normalizarWhatsApp } from '../domain/whatsapp.ts';
import { ErroNegocio, estornarMov, lancarMov } from './estoque.ts';
import { moverExpositorTx } from './expositores.ts';

/** Leitura comum a `db` (fora de transação) e `t` (dentro de db.tx). */
type Leitor = Pick<Tx, 'get' | 'all'>;

const TIPOS: TipoParceiro[] = ['academia', 'loja', 'salao', 'cafe', 'escritorio', 'outro'];
const QUEM_RECEBE: QuemRecebe[] = ['parceiro', 'pix_dono', 'ambos'];

// ---------------------------------------------------------------- Validações e leituras internas

function validarData(data: ISODate | undefined, rotulo = 'Data'): ISODate {
  const d = String(data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ErroNegocio(`${rotulo} inválida.`);
  return d;
}

function validarPct(p: unknown): number {
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 100) {
    throw new ErroNegocio('A parte do parceiro precisa ser maior que 0% e menor que 100%.');
  }
  return roundTo(p, 2);
}

function validarFrequencia(f: unknown): number {
  if (typeof f !== 'number' || !Number.isInteger(f) || f <= 0) {
    throw new ErroNegocio('A frequência do acerto precisa ser um número inteiro de dias maior que zero.');
  }
  return f;
}

function validarWhatsApp(w: string | undefined): string {
  const bruto = String(w ?? '').trim();
  if (!bruto) return '';
  const r = normalizarWhatsApp(bruto);
  if (!r.numero) {
    throw new ErroNegocio('WhatsApp inválido. O número precisa ter de 10 a 13 dígitos (código do país + DDD + número).');
  }
  return r.numero;
}

function obterParceiro(l: Leitor, id: ID): Parceiro {
  const p = l.get('parceiros', id);
  if (!p) throw new ErroNegocio('Parceiro não encontrado.');
  return p;
}

function ultimoAcertoConcluido(l: Leitor, parceiroId: ID): Acerto | undefined {
  let ultimo: Acerto | undefined;
  for (const a of l.all('acertos')) {
    if (a.parceiroId !== parceiroId || a.situacao !== 'concluido') continue;
    if (!ultimo || a.data > ultimo.data) ultimo = a;
  }
  return ultimo;
}

/** Valida o mix contra o cadastro de produtos e devolve uma cópia limpa. */
function validarMix(l: Leitor, mix: ItemMix[], anterior: ItemMix[]): ItemMix[] {
  if (!Array.isArray(mix)) throw new ErroNegocio('Mix inválido.');
  for (const m of mix) {
    const p = l.get('produtos', m.produtoId);
    if (!p) throw new ErroNegocio('Um produto do mix não foi encontrado no cadastro.');
    if (p.arquivado && !anterior.some((a) => a.produtoId === m.produtoId)) {
      throw new ErroNegocio(`O produto "${p.nome}" está arquivado e não pode entrar no mix.`);
    }
  }
  const erro = erroMix(mix, (id) => l.get('produtos', id)?.nome ?? 'produto');
  if (erro) throw new ErroNegocio(erro);
  return mix.map((m) => ({
    produtoId: m.produtoId,
    nivelIdeal: m.nivelIdeal,
    ...(m.precoEtiquetaCentavos != null ? { precoEtiquetaCentavos: m.precoEtiquetaCentavos } : {}),
  }));
}

/** Saldos (≠ 0) de cada produto no local do parceiro. */
function saldosNoParceiro(l: Leitor, parceiroId: ID): { produtoId: ID; quantidade: number }[] {
  const local = localParceiro(parceiroId);
  const out: { produtoId: ID; quantidade: number }[] = [];
  for (const [produtoId, m] of calcularSaldos(l.all('movEstoque'))) {
    const q = m.get(local) || 0;
    if (q !== 0) out.push({ produtoId, quantidade: q });
  }
  return out;
}

/**
 * Registra uma nova divisão (8.1) dentro da transação: entra no histórico com vigenteDesde = data.
 * O acerto usa o % vigente no início do ciclo, então o ciclo em andamento continua com o % antigo.
 */
function aplicarDivisaoTx(t: Tx, p: Parceiro, pct: number, data: ISODate): Parceiro {
  validarData(data, 'Data da mudança');
  const hist = [...(p.percentuais || [])].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  const ultimo = hist[hist.length - 1];
  if (pct === p.pctParceiro && (!ultimo || ultimo.pct === pct)) return p;
  const acerto = ultimoAcertoConcluido(t, p.id);
  if (acerto && data < acerto.data) {
    throw new ErroNegocio(
      `A nova divisão vale a partir do próximo acerto: use uma data a partir de ${formatData(acerto.data)} (dia do último acerto).`,
    );
  }
  if (ultimo && data < ultimo.vigenteDesde) {
    throw new ErroNegocio(`Já existe uma mudança de divisão em ${formatData(ultimo.vigenteDesde)}. Use uma data a partir dela.`);
  }
  if (ultimo && ultimo.vigenteDesde === data) {
    hist.pop();
    // Voltou ao % anterior no mesmo dia: a mudança some do histórico.
    if (hist.length === 0 || hist[hist.length - 1].pct !== pct) hist.push({ pct, vigenteDesde: data });
  } else {
    hist.push({ pct, vigenteDesde: data });
  }
  return t.update('parceiros', p.id, { percentuais: hist, pctParceiro: pct, lembrarReimprimirTermo: true });
}

// ---------------------------------------------------------------- Cadastro (8.1)

export interface DadosParceiro {
  /** Sem id: cria. Com id: atualiza (campos omitidos ficam como estão). */
  id?: ID;
  /** Nome do estabelecimento (obrigatório). */
  nome: string;
  tipo?: TipoParceiro;
  responsavel?: string;
  /** Qualquer formato; é guardado só com dígitos (55 + DDD + número). Vazio = sem WhatsApp. */
  whatsapp?: string;
  endereco?: string;
  bairro?: string;
  linkMapa?: string;
  /** % do parceiro (30 = "Você 70% / Parceiro 30%"). Padrão: primeira divisão das Configurações. */
  pctParceiro?: number;
  /** Padrão: frequência padrão das Configurações. */
  frequenciaDias?: number;
  /** Padrão: 'parceiro'. */
  quemRecebe?: QuemRecebe;
  /** Padrão: a data da operação. */
  dataInicio?: ISODate;
  termoAssinado?: boolean;
  termoData?: ISODate;
  termoFotoDataUrl?: string;
  notaRemessa?: string;
  observacoes?: string;
  /** Na criação, padrão []. Na atualização, omitido = mantém. */
  mix?: ItemMix[];
}

/**
 * Cria ou atualiza um parceiro. Valida nome, 0 < % < 100, frequência > 0, quem recebe e WhatsApp (10–13 dígitos).
 * Na criação: percentuais = [{ pct, vigenteDesde: dataInicio }], situação 'ativo'. Na atualização, mudar o %
 * equivale a mudarDivisao com vigência em `data` (padrão hoje).
 */
export function salvarParceiro(dados: DadosParceiro, data?: ISODate): Parceiro {
  const dia = validarData(data ?? hojeISO());
  return db.tx((t) => {
    const atual = dados.id ? t.get('parceiros', dados.id) : undefined;
    if (dados.id && !atual) throw new ErroNegocio('Parceiro não encontrado.');
    const nome = String(dados.nome ?? '').trim();
    if (!nome) throw new ErroNegocio('Informe o nome do estabelecimento.');
    const cfg = db.config.parcerias;
    const pct = validarPct(dados.pctParceiro ?? atual?.pctParceiro ?? cfg.divisoes[0] ?? 30);
    const frequenciaDias = validarFrequencia(dados.frequenciaDias ?? atual?.frequenciaDias ?? cfg.frequenciaPadraoDias);
    const quemRecebe = dados.quemRecebe ?? atual?.quemRecebe ?? 'parceiro';
    if (!QUEM_RECEBE.includes(quemRecebe)) throw new ErroNegocio('Escolha quem recebe dos clientes.');
    const tipo = dados.tipo ?? atual?.tipo ?? 'outro';
    if (!TIPOS.includes(tipo)) throw new ErroNegocio('Tipo de estabelecimento inválido.');
    const whatsapp = validarWhatsApp(dados.whatsapp ?? atual?.whatsapp);
    const dataInicio = validarData(dados.dataInicio ?? atual?.dataInicio ?? dia, 'Data de início');
    const termoAssinado = dados.termoAssinado ?? atual?.termoAssinado ?? false;
    let termoData = dados.termoData ?? atual?.termoData;
    if (termoData) validarData(termoData, 'Data do termo');
    if (termoAssinado && !termoData) termoData = dia;
    const mix = dados.mix ? validarMix(t, dados.mix, atual?.mix ?? []) : undefined;

    const campos = {
      nome,
      tipo,
      responsavel: String(dados.responsavel ?? atual?.responsavel ?? '').trim(),
      whatsapp,
      endereco: String(dados.endereco ?? atual?.endereco ?? '').trim(),
      bairro: String(dados.bairro ?? atual?.bairro ?? '').trim(),
      linkMapa: String(dados.linkMapa ?? atual?.linkMapa ?? '').trim(),
      frequenciaDias,
      quemRecebe,
      dataInicio,
      termoAssinado,
      termoData,
      termoFotoDataUrl: dados.termoFotoDataUrl ?? atual?.termoFotoDataUrl,
      notaRemessa: dados.notaRemessa != null ? String(dados.notaRemessa).trim() : atual?.notaRemessa,
      observacoes: dados.observacoes ?? atual?.observacoes,
    };

    if (!atual) {
      return t.insert('parceiros', {
        ...campos,
        pctParceiro: pct,
        percentuais: [{ pct, vigenteDesde: dataInicio }],
        situacao: 'ativo',
        mix: mix ?? [],
        arquivado: false,
      });
    }

    // A divisão inicial acompanha a data de início, se ela for corrigida.
    let percentuais = atual.percentuais;
    if (dataInicio !== atual.dataInicio && percentuais.length > 0 && percentuais[0].vigenteDesde === atual.dataInicio) {
      const segunda = percentuais[1]?.vigenteDesde;
      if (!segunda || dataInicio <= segunda) percentuais = [{ ...percentuais[0], vigenteDesde: dataInicio }, ...percentuais.slice(1)];
    }
    const novoTermo = termoAssinado && !atual.termoAssinado;
    let p = t.update('parceiros', atual.id, {
      ...campos,
      percentuais,
      ...(mix ? { mix } : {}),
      ...(novoTermo ? { lembrarReimprimirTermo: false } : {}),
    });
    if (pct !== p.pctParceiro) p = aplicarDivisaoTx(t, p, pct, dia);
    return p;
  });
}

/**
 * Muda a divisão (8.1): grava { pct, vigenteDesde: data } no histórico, atualiza o % atual e liga o lembrete
 * de reimprimir o termo. O acerto em andamento usa o % de quando o ciclo começou; o novo vale no próximo.
 */
export function mudarDivisao(parceiroId: ID, novoPct: number, data: ISODate = hojeISO()): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, parceiroId);
    if (p.arquivado) throw new ErroNegocio('Este parceiro está arquivado.');
    return aplicarDivisaoTx(t, p, validarPct(novoPct), data);
  });
}

/** Marca o termo como assinado (data e foto opcionais) e desliga o lembrete de reimprimir. */
export function registrarTermoAssinado(parceiroId: ID, opts?: { data?: ISODate; fotoDataUrl?: string }): Parceiro {
  const data = validarData(opts?.data ?? hojeISO(), 'Data do termo');
  return db.tx((t) => {
    const p = obterParceiro(t, parceiroId);
    return t.update('parceiros', p.id, {
      termoAssinado: true,
      termoData: data,
      termoFotoDataUrl: opts?.fotoDataUrl ?? p.termoFotoDataUrl,
      lembrarReimprimirTermo: false,
    });
  });
}

/** Desliga o lembrete de reimprimir o termo sem registrar novo termo. */
export function dispensarLembreteTermo(parceiroId: ID): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, parceiroId);
    if (!p.lembrarReimprimirTermo) return p;
    return t.update('parceiros', p.id, { lembrarReimprimirTermo: false });
  });
}

// ---------------------------------------------------------------- Mix (8.3)

/**
 * Grava o mix do parceiro (8.3): nível ideal inteiro ≥ 0, sem produto repetido e preço próprio opcional (> 0).
 * Produto arquivado só continua se já estava no mix.
 */
export function salvarMix(parceiroId: ID, mix: ItemMix[]): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, parceiroId);
    if (p.arquivado) throw new ErroNegocio('Este parceiro está arquivado.');
    return t.update('parceiros', p.id, { mix: validarMix(t, mix, p.mix) });
  });
}

// ---------------------------------------------------------------- Remessas, reposição e recolhimento

export interface ItemQtd {
  produtoId: ID;
  quantidade: number;
}

export interface LinhaMovimento {
  produtoId: ID;
  nome: string;
  quantidade: number;
  /** Preço de etiqueta neste parceiro (centavos). */
  precoCentavos: Cents;
  valorCentavos: Cents;
  /** Saldo atual no local de onde sai (Casa nas remessas, parceiro no recolhimento). */
  saldoOrigem: number;
}

export interface FaltaSaldo {
  produtoId: ID;
  nome: string;
  /** Saldo no local de origem. */
  ha: number;
  precisa: number;
}

export interface ResumoMovimento {
  parceiroId: ID;
  parceiroNome: string;
  data: ISODate;
  /** refId comum às movimentações desta operação. */
  lote: ID;
  linhas: LinhaMovimento[];
  totalPecas: number;
  /** Soma a preço de etiqueta (centavos). */
  totalCentavos: Cents;
  /** Produtos que entraram no mix nesta operação (nível ideal = quantidade levada). */
  adicionadosAoMix: ID[];
  movIds: ID[];
}

export interface ResumoInstalacao extends ResumoMovimento {
  expositores: { id: ID; codigo: string; modelo: string }[];
  /** Itens no formato de montarTermo / termoDoParceiro. */
  itensTermo: ItemTermo[];
}

interface Plano {
  parceiro: Parceiro;
  linhas: LinhaMovimento[];
  faltas: FaltaSaldo[];
  mix: ItemMix[];
  adicionados: ID[];
}

/** Valida e limpa a lista de itens: produto existe, quantidade inteira ≥ 0, sem repetição; descarta zeros. */
function normalizarItens(l: Leitor, itens: ItemQtd[], permitirArquivado: boolean): ItemQtd[] {
  if (!Array.isArray(itens)) throw new ErroNegocio('Lista de itens inválida.');
  const vistos = new Set<ID>();
  const out: ItemQtd[] = [];
  for (const it of itens) {
    const p = l.get('produtos', it.produtoId);
    if (!p) throw new ErroNegocio('Produto não encontrado.');
    if (vistos.has(it.produtoId)) throw new ErroNegocio(`O produto "${p.nome}" aparece duas vezes na lista.`);
    vistos.add(it.produtoId);
    if (typeof it.quantidade !== 'number' || !Number.isInteger(it.quantidade) || it.quantidade < 0) {
      throw new ErroNegocio(`A quantidade de "${p.nome}" precisa ser um número inteiro (0 ou mais).`);
    }
    if (it.quantidade === 0) continue;
    if (p.arquivado && !permitirArquivado) throw new ErroNegocio(`O produto "${p.nome}" está arquivado.`);
    out.push({ produtoId: it.produtoId, quantidade: it.quantidade });
  }
  if (out.length === 0) throw new ErroNegocio('Informe a quantidade de pelo menos um produto.');
  return out;
}

/** Casa -> parceiro (instalação ou reposição avulsa): valida, calcula preços do mix e o que falta em Casa. */
function planejarRemessa(l: Leitor, parceiroId: ID, itens: ItemQtd[], modo: 'instalacao' | 'reposicao'): Plano {
  const parceiro = obterParceiro(l, parceiroId);
  if (parceiro.arquivado) throw new ErroNegocio('Este parceiro está arquivado.');
  if (parceiro.situacao === 'encerrado') throw new ErroNegocio('Esta parceria está encerrada. Reative o parceiro antes de levar itens.');
  if (parceiro.situacao === 'pausado') throw new ErroNegocio('Este parceiro está pausado. Reative o parceiro antes de levar itens.');
  if (modo === 'reposicao' && !parceiro.instaladoEm) {
    throw new ErroNegocio('Este parceiro ainda não foi instalado. Use "Instalação" para a primeira remessa.');
  }
  const validos = normalizarItens(l, itens, false);
  const { mix, adicionados } = mesclarNoMix(parceiro.mix, validos);
  const movs = l.all('movEstoque');
  const linhas: LinhaMovimento[] = validos.map(({ produtoId, quantidade }) => {
    const prod = l.get('produtos', produtoId)!;
    const precoCentavos = precoNoMix(mix, prod);
    return {
      produtoId,
      nome: prod.nome,
      quantidade,
      precoCentavos,
      valorCentavos: quantidade * precoCentavos,
      saldoOrigem: saldoNoLocal(movs, produtoId, CASA),
    };
  });
  const faltas = linhas
    .filter((li) => li.quantidade > li.saldoOrigem)
    .map((li) => ({ produtoId: li.produtoId, nome: li.nome, ha: li.saldoOrigem, precisa: li.quantidade }));
  return { parceiro, linhas, faltas, mix, adicionados };
}

/** Parceiro -> Casa: valida e calcula o que passa do saldo no parceiro. */
function planejarRecolhimento(l: Leitor, parceiroId: ID, itens: ItemQtd[]): Plano {
  const parceiro = obterParceiro(l, parceiroId);
  const validos = normalizarItens(l, itens, true);
  const movs = l.all('movEstoque');
  const local = localParceiro(parceiroId);
  const linhas: LinhaMovimento[] = validos.map(({ produtoId, quantidade }) => {
    const prod = l.get('produtos', produtoId)!;
    const precoCentavos = precoNoMix(parceiro.mix, prod);
    return {
      produtoId,
      nome: prod.nome,
      quantidade,
      precoCentavos,
      valorCentavos: quantidade * precoCentavos,
      saldoOrigem: saldoNoLocal(movs, produtoId, local),
    };
  });
  const faltas = linhas
    .filter((li) => li.quantidade > li.saldoOrigem)
    .map((li) => ({ produtoId: li.produtoId, nome: li.nome, ha: li.saldoOrigem, precisa: li.quantidade }));
  return { parceiro, linhas, faltas, mix: parceiro.mix, adicionados: [] };
}

/** Expositores escolhidos na instalação: existem, não arquivados/perdidos e estão em Casa (ou já neste parceiro). */
function planejarExpositores(l: Leitor, parceiro: Parceiro, ids: ID[]): Expositor[] {
  const out: Expositor[] = [];
  for (const id of Array.from(new Set(ids ?? []))) {
    const e = l.get('expositores', id);
    if (!e) throw new ErroNegocio('Expositor não encontrado.');
    if (e.arquivado) throw new ErroNegocio(`O expositor ${e.codigo} está arquivado.`);
    if (e.estado === 'perdido') throw new ErroNegocio(`O expositor ${e.codigo} está marcado como perdido.`);
    if (e.parceiroId && e.parceiroId !== parceiro.id) {
      const outro = l.get('parceiros', e.parceiroId)?.nome ?? 'outro parceiro';
      throw new ErroNegocio(`O expositor ${e.codigo} está em ${outro}. Mova para Casa antes de instalar.`);
    }
    out.push(e);
  }
  return out;
}

function mensagemFaltaCasa(faltas: FaltaSaldo[]): string {
  const lista = faltas.map((f) => `${f.nome} (há ${f.ha}, precisa de ${f.precisa})`).join('; ');
  return `Falta estoque em Casa: ${lista}. Registre a produção ou diminua as quantidades.`;
}

function mensagemFaltaParceiro(faltas: FaltaSaldo[]): string {
  const lista = faltas.map((f) => `${f.nome} (há ${f.ha}, recolher ${f.precisa})`).join('; ');
  return `Não dá para recolher mais do que há no parceiro: ${lista}.`;
}

function totais(linhas: LinhaMovimento[]) {
  return {
    totalPecas: linhas.reduce((s, li) => s + li.quantidade, 0),
    totalCentavos: linhas.reduce((s, li) => s + li.valorCentavos, 0),
  };
}

function pecas(n: number): string {
  return `${n} ${n === 1 ? 'peça' : 'peças'}`;
}

export interface DadosInstalacao {
  parceiroId: ID;
  /** Expositores levados (em Casa ou já neste parceiro). Pode ser vazio. */
  expositorIds: ID[];
  /** Quantidades (padrão na tela = nível ideal do mix). Linhas com 0 são ignoradas. */
  itens: ItemQtd[];
  data?: ISODate;
}

/**
 * Instalação (8.4): remessas Casa -> parceiro (refTipo 'instalacao'), bloqueada se faltar estoque em Casa
 * (a mensagem lista o que falta). Leva os expositores ao parceiro, grava instaladoEm (se vazio) e inclui no mix
 * os produtos que faltavam (nível ideal = quantidade). Devolve o resumo para o termo.
 */
export function instalar(dados: DadosInstalacao): ResumoInstalacao {
  const data = validarData(dados.data ?? hojeISO());
  return db.tx((t) => {
    const plano = planejarRemessa(t, dados.parceiroId, dados.itens, 'instalacao');
    const exps = planejarExpositores(t, plano.parceiro, dados.expositorIds);
    if (plano.faltas.length) throw new ErroNegocio(mensagemFaltaCasa(plano.faltas));
    const p = plano.parceiro;
    t.update('parceiros', p.id, { mix: plano.mix, instaladoEm: p.instaladoEm ?? data });
    const lote = novoId();
    const movIds = plano.linhas.map(
      (li) =>
        lancarMov(t, {
          data,
          produtoId: li.produtoId,
          quantidade: li.quantidade,
          origem: CASA,
          destino: localParceiro(p.id),
          tipo: 'remessa',
          refTipo: 'instalacao',
          refId: lote,
          precoUnitCentavos: li.precoCentavos,
        }).id,
    );
    const movidos = exps.map((e) => moverExpositorTx(t, e.id, p.id, data));
    return {
      parceiroId: p.id,
      parceiroNome: p.nome,
      data,
      lote,
      linhas: plano.linhas,
      ...totais(plano.linhas),
      adicionadosAoMix: plano.adicionados,
      movIds,
      expositores: movidos.map((e) => ({ id: e.id, codigo: e.codigo, modelo: e.modelo })),
      itensTermo: plano.linhas.map((li) => ({ nome: li.nome, quantidade: li.quantidade, precoCentavos: li.precoCentavos })),
    };
  });
}

export interface DadosReposicao {
  parceiroId: ID;
  itens: ItemQtd[];
  data?: ISODate;
}

/**
 * Reposição avulsa (8.5): remessas Casa -> parceiro (refTipo 'reposicao') sem acerto. Entra no saldo do
 * parceiro e, por isso, no "Esperado" do próximo acerto. Bloqueada se faltar estoque em Casa.
 */
export function reposicaoAvulsa(dados: DadosReposicao): ResumoMovimento {
  const data = validarData(dados.data ?? hojeISO());
  return db.tx((t) => {
    const plano = planejarRemessa(t, dados.parceiroId, dados.itens, 'reposicao');
    if (plano.faltas.length) throw new ErroNegocio(mensagemFaltaCasa(plano.faltas));
    const p = plano.parceiro;
    if (plano.adicionados.length) t.update('parceiros', p.id, { mix: plano.mix });
    const lote = novoId();
    const movIds = plano.linhas.map(
      (li) =>
        lancarMov(t, {
          data,
          produtoId: li.produtoId,
          quantidade: li.quantidade,
          origem: CASA,
          destino: localParceiro(p.id),
          tipo: 'remessa',
          refTipo: 'reposicao',
          refId: lote,
          precoUnitCentavos: li.precoCentavos,
        }).id,
    );
    return {
      parceiroId: p.id,
      parceiroNome: p.nome,
      data,
      lote,
      linhas: plano.linhas,
      ...totais(plano.linhas),
      adicionadosAoMix: plano.adicionados,
      movIds,
    };
  });
}

export interface DesfazerRemessa {
  parceiroId: ID;
  /** Lote da remessa (ResumoMovimento.lote). */
  lote: ID;
  /** Mix e data de instalação de antes de levar as peças. */
  mixAnterior: ItemMix[];
  instaladoEmAnterior?: ISODate;
  /** Expositores que saíram de Casa nesta instalação (voltam para Casa). */
  expositorIds?: ID[];
}

/**
 * "Desfazer" logo depois de levar ou recolher peças (decisão 93): estorna os movimentos do lote (as peças voltam
 * para onde estavam), devolve o mix de antes e, numa instalação, leva os expositores de volta para Casa e desfaz a
 * data de instalação.
 */
export function desfazerRemessa(d: DesfazerRemessa): void {
  db.tx((t) => {
    const p = obterParceiro(t, d.parceiroId);
    const todos = t.all('movEstoque');
    const estornados = idsEstornados(todos);
    // Remessa (levar peças) ou recolhimento: os dois gravam o lote em refId.
    const movs = todos.filter((m) => m.refId === d.lote && (m.tipo === 'remessa' || m.tipo === 'recolhimento'));
    if (!movs.length) throw new ErroNegocio('Movimento não encontrado.');
    if (movs.some((m) => estornados.has(m.id))) throw new ErroNegocio('Este movimento já foi desfeito.');
    for (const m of movs) estornarMov(t, m.id, 'Desfeito logo após registrar', { data: m.data });
    for (const id of d.expositorIds ?? []) {
      if (t.get('expositores', id)?.parceiroId === p.id) moverExpositorTx(t, id, null, movs[0].data);
    }
    t.update('parceiros', p.id, { mix: d.mixAnterior, instaladoEm: d.instaladoEmAnterior });
  });
}

export interface DadosRecolhimento {
  parceiroId: ID;
  itens: ItemQtd[];
  data?: ISODate;
  motivo?: string;
}

/** Recolher (fora do acerto): movimentos 'recolhimento' parceiro -> Casa. Bloqueado acima do saldo no parceiro. */
export function recolher(dados: DadosRecolhimento): ResumoMovimento {
  const data = validarData(dados.data ?? hojeISO());
  const motivo = String(dados.motivo ?? '').trim() || undefined;
  return db.tx((t) => {
    const plano = planejarRecolhimento(t, dados.parceiroId, dados.itens);
    if (plano.faltas.length) throw new ErroNegocio(mensagemFaltaParceiro(plano.faltas));
    const p = plano.parceiro;
    const lote = novoId();
    const movIds = plano.linhas.map(
      (li) =>
        lancarMov(t, {
          data,
          produtoId: li.produtoId,
          quantidade: li.quantidade,
          origem: localParceiro(p.id),
          destino: CASA,
          tipo: 'recolhimento',
          motivo,
          refTipo: 'recolhimento',
          refId: lote,
          precoUnitCentavos: li.precoCentavos,
        }).id,
    );
    return {
      parceiroId: p.id,
      parceiroNome: p.nome,
      data,
      lote,
      linhas: plano.linhas,
      ...totais(plano.linhas),
      adicionadosAoMix: [],
      movIds,
    };
  });
}

// ---------------------------------------------------------------- Situação, arquivo e encerramento

/** Pausa um parceiro ativo (sai da agenda de acertos; o estoque no expositor continua). */
export function pausarParceiro(id: ID): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, id);
    if (p.arquivado) throw new ErroNegocio('Este parceiro está arquivado.');
    if (p.situacao === 'pausado') return p;
    if (p.situacao !== 'ativo') throw new ErroNegocio('Só parceiros ativos podem ser pausados.');
    return t.update('parceiros', p.id, { situacao: 'pausado' });
  });
}

/** Reativa um parceiro pausado ou com parceria encerrada (volta para a agenda). */
export function reativarParceiro(id: ID): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, id);
    if (p.arquivado) throw new ErroNegocio('Este parceiro está arquivado. Desarquive antes de reativar.');
    if (p.situacao === 'ativo') return p;
    return t.update('parceiros', p.id, { situacao: 'ativo' });
  });
}

/** Arquiva o parceiro (nada é apagado). Precisa estar sem peças e sem expositores. */
export function arquivarParceiro(id: ID): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, id);
    if (p.arquivado) return p;
    const restantes = saldosNoParceiro(t, p.id);
    if (restantes.length) {
      const total = restantes.reduce((s, x) => s + x.quantidade, 0);
      throw new ErroNegocio(`Ainda há ${pecas(total)} no parceiro. Recolha tudo ou encerre a parceria antes de arquivar.`);
    }
    const exp = t.all('expositores').find((e) => e.parceiroId === p.id);
    if (exp) throw new ErroNegocio(`O expositor ${exp.codigo} ainda está neste parceiro. Mova para Casa antes de arquivar.`);
    return t.update('parceiros', p.id, { arquivado: true });
  });
}

/** Desfaz o arquivamento do parceiro (a situação não muda). */
export function desarquivarParceiro(id: ID): Parceiro {
  return db.tx((t) => {
    const p = obterParceiro(t, id);
    if (!p.arquivado) return p;
    return t.update('parceiros', p.id, { arquivado: false });
  });
}

export interface ResumoEncerramento {
  parceiroId: ID;
  data: ISODate;
  /** Códigos dos expositores que voltaram para Casa. */
  expositoresDevolvidos: string[];
}

/**
 * Encerrar parceria (8.10): exige estoque zero no parceiro (a tela faz antes o acerto final recolhendo tudo),
 * leva os expositores de volta para Casa e muda a situação para 'encerrado'. Pendências e histórico continuam.
 */
export function encerrarParceria(parceiroId: ID, data?: ISODate): ResumoEncerramento {
  const dia = validarData(data ?? hojeISO());
  return db.tx((t) => encerrarParceriaTx(t, parceiroId, dia));
}

/** Encerrar dentro de outra transação (o acerto final encerra a parceria ao ser concluído). */
export function encerrarParceriaTx(t: Tx, parceiroId: ID, dia: ISODate): ResumoEncerramento {
  const p = obterParceiro(t, parceiroId);
  if (p.situacao === 'encerrado') throw new ErroNegocio('Esta parceria já foi encerrada.');
  const restantes = saldosNoParceiro(t, p.id);
  if (restantes.length) {
    const total = restantes.reduce((s, x) => s + x.quantidade, 0);
    throw new ErroNegocio(`Ainda há ${pecas(total)} no parceiro. Faça o acerto final recolhendo tudo antes de encerrar.`);
  }
  const exps = t.all('expositores').filter((e) => e.parceiroId === p.id);
  for (const e of exps) moverExpositorTx(t, e.id, null, dia);
  t.update('parceiros', p.id, { situacao: 'encerrado' });
  return { parceiroId: p.id, data: dia, expositoresDevolvidos: exps.map((e) => e.codigo) };
}

// ---------------------------------------------------------------- Termo (8.12)

/**
 * Termo de consignação do parceiro com os dados atuais: itens = saldo no parceiro (ou `opts.itens`, por
 * exemplo `ResumoInstalacao.itensTermo`), expositores que estão nele, empresa e cidade das Configurações.
 */
export function termoDoParceiro(parceiroId: ID, opts?: { data?: ISODate; itens?: ItemTermo[]; cidade?: string }): Termo {
  const p = obterParceiro(db, parceiroId);
  const itens =
    opts?.itens ??
    saldosNoParceiro(db, p.id)
      .filter((x) => x.quantidade > 0)
      .map((x) => {
        const prod = db.get('produtos', x.produtoId);
        return {
          nome: prod?.nome ?? 'Produto removido',
          quantidade: x.quantidade,
          precoCentavos: prod ? precoNoMix(p.mix, prod) : 0,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const expositores = db
    .all('expositores')
    .filter((e) => e.parceiroId === p.id && !e.arquivado)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  return montarTermo({
    empresa: db.config.empresa,
    parceiro: p,
    expositores,
    itens,
    data: opts?.data ?? hojeISO(),
    cidade: opts?.cidade,
  });
}

// ---------------------------------------------------------------- Prévias para confirmação

export interface Previa {
  /** Título para confirmar({ titulo }). */
  titulo: string;
  /** Linhas do resumo para confirmar({ itens }). */
  itens: string[];
  /** Motivo pelo qual a operação será recusada (mesma mensagem do serviço), ou null. */
  bloqueio: string | null;
}

export interface PreviaMovimento extends Previa {
  linhas: LinhaMovimento[];
  faltas: FaltaSaldo[];
  totalPecas: number;
  totalCentavos: Cents;
}

function previaVazia(titulo: string, e: unknown): PreviaMovimento {
  if (!(e instanceof ErroNegocio)) throw e;
  return { titulo, itens: [], bloqueio: e.message, linhas: [], faltas: [], totalPecas: 0, totalCentavos: 0 };
}

function linhasDeItens(linhas: LinhaMovimento[]): string[] {
  return linhas.map((li) => `${li.nome}: ${li.quantidade} × ${formatBRL(li.precoCentavos)}`);
}

/** Resumo da instalação antes de confirmar (o que sai de Casa, expositores, mix) e o bloqueio, se houver. */
export function previaInstalacao(dados: DadosInstalacao): PreviaMovimento {
  const titulo = 'Confirmar instalação?';
  try {
    if (dados.data) validarData(dados.data);
    const plano = planejarRemessa(db, dados.parceiroId, dados.itens, 'instalacao');
    const exps = planejarExpositores(db, plano.parceiro, dados.expositorIds);
    const tot = totais(plano.linhas);
    const nome = plano.parceiro.nome;
    const itens = [
      `Sai de Casa e vai para ${nome}: ${pecas(tot.totalPecas)} (${formatBRL(tot.totalCentavos)} a preço de etiqueta)`,
      ...linhasDeItens(plano.linhas),
      exps.length
        ? `${exps.length > 1 ? 'Expositores' : 'Expositor'} ${exps.map((e) => e.codigo).join(', ')} ${exps.length > 1 ? 'ficam' : 'fica'} em ${nome}`
        : 'Nenhum expositor escolhido',
    ];
    if (plano.adicionados.length) {
      const nomes = plano.linhas.filter((li) => plano.adicionados.includes(li.produtoId)).map((li) => li.nome);
      itens.push(`Entram no mix: ${nomes.join(', ')} (nível ideal = quantidade levada)`);
    }
    itens.push('Depois, imprima ou envie o Termo de consignação');
    return {
      titulo,
      itens,
      bloqueio: plano.faltas.length ? mensagemFaltaCasa(plano.faltas) : null,
      linhas: plano.linhas,
      faltas: plano.faltas,
      ...tot,
    };
  } catch (e) {
    return previaVazia(titulo, e);
  }
}

/** Resumo da reposição avulsa antes de confirmar e o bloqueio, se houver. */
export function previaReposicao(dados: DadosReposicao): PreviaMovimento {
  const titulo = 'Confirmar reposição avulsa?';
  try {
    if (dados.data) validarData(dados.data);
    const plano = planejarRemessa(db, dados.parceiroId, dados.itens, 'reposicao');
    const tot = totais(plano.linhas);
    const itens = [
      `Sai de Casa e vai para ${plano.parceiro.nome}: ${pecas(tot.totalPecas)} (${formatBRL(tot.totalCentavos)} a preço de etiqueta)`,
      ...linhasDeItens(plano.linhas),
      'Entra no saldo do parceiro e no "Esperado" do próximo acerto. Nenhum acerto é feito agora.',
    ];
    if (plano.adicionados.length) {
      const nomes = plano.linhas.filter((li) => plano.adicionados.includes(li.produtoId)).map((li) => li.nome);
      itens.push(`Entram no mix: ${nomes.join(', ')} (nível ideal = quantidade levada)`);
    }
    return {
      titulo,
      itens,
      bloqueio: plano.faltas.length ? mensagemFaltaCasa(plano.faltas) : null,
      linhas: plano.linhas,
      faltas: plano.faltas,
      ...tot,
    };
  } catch (e) {
    return previaVazia(titulo, e);
  }
}

/** Resumo do recolhimento antes de confirmar e o bloqueio, se houver. */
export function previaRecolhimento(dados: DadosRecolhimento): PreviaMovimento {
  const titulo = 'Confirmar recolhimento?';
  try {
    if (dados.data) validarData(dados.data);
    const plano = planejarRecolhimento(db, dados.parceiroId, dados.itens);
    const tot = totais(plano.linhas);
    const itens = [`Volta de ${plano.parceiro.nome} para Casa: ${pecas(tot.totalPecas)}`, ...linhasDeItens(plano.linhas)];
    const motivo = String(dados.motivo ?? '').trim();
    if (motivo) itens.push(`Motivo: ${motivo}`);
    return {
      titulo,
      itens,
      bloqueio: plano.faltas.length ? mensagemFaltaParceiro(plano.faltas) : null,
      linhas: plano.linhas,
      faltas: plano.faltas,
      ...tot,
    };
  } catch (e) {
    return previaVazia(titulo, e);
  }
}

/** Resumo do encerramento: peças que ainda estão no parceiro (bloqueio), expositores que voltam e o que continua. */
export function previaEncerramento(parceiroId: ID): Previa & { pecasNoParceiro: number; expositores: string[] } {
  const titulo = 'Encerrar parceria?';
  const p = db.get('parceiros', parceiroId);
  if (!p) return { titulo, itens: [], bloqueio: 'Parceiro não encontrado.', pecasNoParceiro: 0, expositores: [] };
  const restantes = saldosNoParceiro(db, p.id);
  const pecasNoParceiro = restantes.reduce((s, x) => s + x.quantidade, 0);
  const expositores = db
    .all('expositores')
    .filter((e) => e.parceiroId === p.id)
    .map((e) => e.codigo)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  let bloqueio: string | null = null;
  if (p.situacao === 'encerrado') bloqueio = 'Esta parceria já foi encerrada.';
  else if (restantes.length) {
    bloqueio = `Ainda há ${pecas(pecasNoParceiro)} no parceiro. Faça o acerto final recolhendo tudo antes de encerrar.`;
  }
  const itens = [
    expositores.length ? `Voltam para Casa: ${expositores.join(', ')}` : 'Nenhum expositor neste parceiro',
    `${p.nome} passa para "encerrado" e sai da agenda de acertos`,
    'Pendências continuam a receber e o histórico fica guardado',
  ];
  return { titulo, itens, bloqueio, pecasNoParceiro, expositores };
}

/** Resumo da mudança de divisão (8.1): atual, nova, quando passa a valer e o lembrete do termo. */
export function previaMudancaDivisao(parceiroId: ID, novoPct: number, data: ISODate = hojeISO()): Previa {
  const titulo = 'Mudar a divisão?';
  const p = db.get('parceiros', parceiroId);
  if (!p) return { titulo, itens: [], bloqueio: 'Parceiro não encontrado.' };
  let bloqueio: string | null = null;
  try {
    validarPct(novoPct);
    validarData(data, 'Data da mudança');
    const acerto = ultimoAcertoConcluido(db, p.id);
    if (acerto && data < acerto.data) {
      bloqueio = `A nova divisão vale a partir do próximo acerto: use uma data a partir de ${formatData(acerto.data)} (dia do último acerto).`;
    }
  } catch (e) {
    if (!(e instanceof ErroNegocio)) throw e;
    bloqueio = e.message;
  }
  const inicioCiclo = ultimoAcertoConcluido(db, p.id)?.data ?? p.instaladoEm;
  const itens = [
    `Divisão atual: ${rotuloDivisao(p.pctParceiro)}`,
    `Nova divisão: ${Number.isFinite(novoPct) ? rotuloDivisao(novoPct) : '—'}`,
    inicioCiclo
      ? `Vale a partir do próximo acerto. O acerto em andamento (desde ${formatData(inicioCiclo)}) usa a divisão atual.`
      : 'Vale a partir do próximo acerto.',
    'Lembre de reimprimir o termo e pegar nova assinatura.',
  ];
  return { titulo, itens, bloqueio };
}
