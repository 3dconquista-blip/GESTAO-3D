// Materiais e insumos (seção 7.3): cadastro, "Compra de material", "Pesei o carretel", ajustes, perdas e estornos.
// Saldo de material = soma dos movimentos (gramas para filamento, unidades para insumo). Pode ficar negativo:
// a interface mostra em vermelho com a dica "Pese o carretel".
// Na compra, custoUnitSnapshot guarda o custo médio ANTES da compra; o preço pago é valorTotalCentavos ÷ quantidade.
import type { Tx } from '../data/db.ts';
import { db } from '../data/db.ts';
import { saldoMaterial } from '../data/selectors.ts';
import type { Cents, ID, ISODate, Material, MovMaterial, Novo, TipoFilamento, TipoMovMaterial } from '../data/types.ts';
import { hojeISO } from '../lib/dates.ts';
import { round4, roundTo, shift } from '../lib/money.ts';
import { idsEstornados } from '../domain/stock.ts';
import {
  custoDaCompra,
  custoMedioSemCompra,
  gramasRestantes,
  TARA_CARRETEL_G,
  resumoCompra,
  unidadeCompra,
  type ResumoCompra,
} from '../domain/materiais.ts';
import { ErroNegocio } from './estoque.ts';

const TIPOS_FILAMENTO: TipoFilamento[] = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro'];

function dataOuHoje(data?: ISODate | null): ISODate {
  if (data == null || data === '') return hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroNegocio('Data inválida.');
  return data;
}

function texto(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function exigirMaterial(m: Material | undefined): Material {
  if (!m) throw new ErroNegocio('Material não encontrado.');
  return m;
}

// ---------------------------------------------------------------- Primitivas (dentro de db.tx)

/** Saldo do material dentro da transação (gramas ou unidades), incluindo o que já foi lançado nela. */
export function saldoMaterialTx(t: Tx, materialId: ID): number {
  let s = 0;
  for (const mv of t.all('movMateriais')) if (mv.materialId === materialId) s += mv.quantidade;
  return roundTo(s, 4);
}

export interface NovoMovMaterial {
  materialId: ID;
  tipo: TipoMovMaterial;
  /** +entrada / −saída, em gramas (filamento) ou unidades (insumo). */
  quantidade: number;
  data?: ISODate;
  valorTotalCentavos?: Cents;
  /** Padrão: custo médio atual do material (R$/kg ou R$/un). */
  custoUnitSnapshot?: number;
  motivo?: string;
  refTipo?: MovMaterial['refTipo'];
  refId?: ID;
  estornoDe?: ID;
}

/** Lança um movimento de material (chame dentro de db.tx). Não bloqueia saldo negativo. */
export function lancarMovMaterial(t: Tx, mov: NovoMovMaterial): MovMaterial {
  if (!Number.isFinite(mov.quantidade) || mov.quantidade === 0) {
    throw new ErroNegocio('A quantidade precisa ser um número diferente de zero.');
  }
  const material = exigirMaterial(t.get('materiais', mov.materialId));
  const rec: Novo<MovMaterial> = {
    materialId: material.id,
    data: dataOuHoje(mov.data),
    tipo: mov.tipo,
    quantidade: roundTo(mov.quantidade, 4),
    custoUnitSnapshot: round4(mov.custoUnitSnapshot ?? material.custoMedio ?? 0),
    valorTotalCentavos: mov.valorTotalCentavos,
    motivo: mov.motivo,
    refTipo: mov.refTipo,
    refId: mov.refId,
    estornoDe: mov.estornoDe,
  };
  return t.insert('movMateriais', rec);
}

/**
 * Estorna (dentro de db.tx) os movimentos de material ainda não estornados de uma referência
 * (usado por estornar produção; serve também para pedidos). Retorna os estornos lançados.
 */
export function estornarMovsMaterialDaRef(
  t: Tx,
  refTipo: NonNullable<MovMaterial['refTipo']>,
  refId: ID,
  motivo: string,
  data?: ISODate,
): MovMaterial[] {
  const movs = t.all('movMateriais');
  const est = idsEstornados(movs);
  const alvos = movs.filter((m) => m.refTipo === refTipo && m.refId === refId && m.tipo !== 'estorno' && !est.has(m.id));
  return alvos.map((orig) =>
    lancarMovMaterial(t, {
      materialId: orig.materialId,
      tipo: 'estorno',
      quantidade: -orig.quantidade,
      data,
      custoUnitSnapshot: orig.custoUnitSnapshot,
      motivo,
      refTipo: orig.refTipo,
      refId: orig.refId,
      estornoDe: orig.id,
    }),
  );
}

// ---------------------------------------------------------------- Cadastro

export interface DadosMaterial {
  /** Informe para editar; sem id, cadastra um novo. */
  id?: ID;
  tipo: Material['tipo'];
  /** Obrigatório. Filamento sem nome vira "<material> <cor>" (ex.: "PLA Preto"). */
  nome?: string;
  material?: TipoFilamento;
  corNome?: string;
  corHex?: string;
  marca?: string;
  /** Insumo: padrão 'un'. Filamento é sempre 'g'. */
  unidade?: string;
  /** Filamento: R$/kg. Insumo: R$/unidade. Padrão 0. */
  custoMedio?: number;
  /** Filamento: gramas (padrão da configuração, 250). Insumo: unidades (padrão 0). */
  minimo?: number;
  /** Só no cadastro: saldo que já existe (gramas ou unidades). Gera um ajuste "Saldo inicial". */
  saldoInicial?: number;
  /** Data do ajuste de saldo inicial (padrão hoje). */
  data?: ISODate;
}

function numeroNaoNegativo(v: number | undefined, padrao: number, erro: string): number {
  const n = v ?? padrao;
  if (!Number.isFinite(n) || n < 0) throw new ErroNegocio(erro);
  return n;
}

/** Cadastra ou edita um material (filamento ou insumo). Campos não informados mantêm o valor atual (ou o padrão). */
export function salvarMaterial(dados: DadosMaterial): Material {
  return db.tx((t) => {
    const atual = dados.id ? t.get('materiais', dados.id) : undefined;
    if (dados.id && !atual) throw new ErroNegocio('Material não encontrado.');
    const tipo = dados.tipo ?? atual?.tipo;
    if (tipo !== 'filamento' && tipo !== 'insumo') throw new ErroNegocio('Escolha se é filamento ou outro insumo.');
    if (atual && atual.tipo !== tipo && t.all('movMateriais').some((m) => m.materialId === atual.id)) {
      throw new ErroNegocio('Este material já tem movimentações. Não dá para trocar entre filamento e insumo; cadastre um novo.');
    }
    const filamento = tipo === 'filamento';
    const material = filamento ? (dados.material ?? atual?.material ?? 'PLA') : undefined;
    if (material && !TIPOS_FILAMENTO.includes(material)) throw new ErroNegocio('Tipo de filamento inválido.');
    const corNome = dados.corNome !== undefined ? texto(dados.corNome) : atual?.corNome;
    let nome = dados.nome !== undefined ? texto(dados.nome) : (atual?.nome ?? '');
    if (!nome && filamento) nome = [material, corNome].filter(Boolean).join(' ');
    if (!nome) throw new ErroNegocio('Informe o nome do material.');

    const custoMedio = numeroNaoNegativo(dados.custoMedio, atual?.custoMedio ?? 0, 'O custo não pode ser negativo.');
    const minimoPadrao = atual?.minimo ?? (filamento ? db.config.estoque.minimoFilamentoPadraoG : 0);
    const minimo = numeroNaoNegativo(dados.minimo, minimoPadrao, 'O mínimo não pode ser negativo.');
    const unidade = filamento ? 'g' : texto(dados.unidade) || atual?.unidade || 'un';

    const campos = {
      tipo,
      nome,
      material,
      corNome,
      corHex: dados.corHex !== undefined ? texto(dados.corHex) : atual?.corHex,
      marca: dados.marca !== undefined ? texto(dados.marca) : atual?.marca,
      unidade,
      custoMedio: round4(custoMedio),
      minimo,
    };

    if (atual) {
      if (dados.saldoInicial) throw new ErroNegocio('Para mudar o saldo use "Compra de material", "Pesei o carretel" ou um ajuste.');
      return t.update('materiais', atual.id, campos);
    }
    const saldoInicial = numeroNaoNegativo(dados.saldoInicial, 0, 'O saldo inicial não pode ser negativo.');
    const novo = t.insert('materiais', { ...campos, arquivado: false });
    if (saldoInicial > 0) {
      lancarMovMaterial(t, { materialId: novo.id, tipo: 'ajuste', quantidade: saldoInicial, motivo: 'Saldo inicial', refTipo: 'ajuste', data: dados.data });
    }
    return novo;
  });
}

/** Arquiva (some das listas e da escolha de materiais) ou reativa um material. O histórico fica. */
export function arquivarMaterial(id: ID, arquivado = true): Material {
  return db.tx((t) => {
    exigirMaterial(t.get('materiais', id));
    return t.update('materiais', id, { arquivado });
  });
}

// ---------------------------------------------------------------- Compra de material

export interface DadosCompra {
  materialId: ID;
  /** Filamento: kg. Insumo: unidades. */
  quantidade: number;
  /** Valor total pago, com frete (centavos). */
  valorTotalCentavos: Cents;
  data?: ISODate;
}

export interface PreviaCompra extends ResumoCompra {
  material: Material;
  /** 'kg' (filamento) ou a unidade do insumo: como a quantidade foi digitada. */
  unidadeCompra: string;
}

export interface ResultadoCompra extends PreviaCompra {
  mov: MovMaterial;
}

function validarCompra(dados: DadosCompra): void {
  if (!Number.isFinite(dados.quantidade) || !(dados.quantidade > 0)) throw new ErroNegocio('Informe a quantidade comprada.');
  if (!Number.isInteger(dados.valorTotalCentavos) || dados.valorTotalCentavos < 0) throw new ErroNegocio('Informe o valor total pago.');
}

/** Resumo da compra para a confirmação: saldo antes/depois, custo da compra e novo custo médio. Não grava. */
export function previaCompra(dados: DadosCompra): PreviaCompra {
  const material = exigirMaterial(db.get('materiais', dados.materialId));
  validarCompra(dados);
  const r = resumoCompra(material, saldoMaterial(material.id), dados.quantidade, dados.valorTotalCentavos);
  return { ...r, material, unidadeCompra: unidadeCompra(material) };
}

/**
 * "Compra de material": soma ao saldo (filamento: kg × 1000 gramas) e recalcula o custo médio
 * com o saldo de antes da compra (7.3). Tudo numa transação.
 */
export function comprarMaterial(dados: DadosCompra): ResultadoCompra {
  return db.tx((t) => {
    const material = exigirMaterial(t.get('materiais', dados.materialId));
    validarCompra(dados);
    const r = resumoCompra(material, saldoMaterialTx(t, material.id), dados.quantidade, dados.valorTotalCentavos);
    const mov = lancarMovMaterial(t, {
      materialId: material.id,
      tipo: 'compra',
      quantidade: r.qtdNoSaldo,
      data: dados.data,
      valorTotalCentavos: dados.valorTotalCentavos,
      custoUnitSnapshot: material.custoMedio,
      refTipo: 'compra',
    });
    const atualizado = t.update('materiais', material.id, { custoMedio: round4(r.custoNovo) });
    return { ...r, material: atualizado, unidadeCompra: unidadeCompra(material), mov };
  });
}

// ---------------------------------------------------------------- Pesei o carretel

export interface PreviaPesagem {
  material: Material;
  taraCarretelG: number;
  /** Peso na balança − carretel vazio. */
  gramasRestantes: number;
  saldoAtual: number;
  /** Ajuste que será lançado (gramas restantes − saldo atual). 0 = nada muda. */
  delta: number;
}

function calcularPesagem(material: Material, pesoBalancaG: number, saldoAtual: number): PreviaPesagem {
  if (material.tipo !== 'filamento') throw new ErroNegocio('Só filamentos podem ser pesados.');
  if (!Number.isFinite(pesoBalancaG) || pesoBalancaG < 0) throw new ErroNegocio('Informe o peso na balança, em gramas.');
  const tara = TARA_CARRETEL_G;
  const g = gramasRestantes(pesoBalancaG, tara);
  return { material, taraCarretelG: tara, gramasRestantes: g, saldoAtual, delta: roundTo(g - saldoAtual, 2) };
}

/** Resumo de "Pesei o carretel" para a confirmação. Não grava. */
export function previaPesagem(dados: { materialId: ID; pesoBalancaG: number }): PreviaPesagem {
  const material = exigirMaterial(db.get('materiais', dados.materialId));
  return calcularPesagem(material, dados.pesoBalancaG, saldoMaterial(material.id));
}

/**
 * "Pesei o carretel": lança um ajuste igual a (gramas restantes − saldo atual), motivo "Pesei o carretel".
 * Retorna o ajuste em gramas (0 = saldo já estava certo, nada é lançado).
 */
export function pesarCarretel(dados: { materialId: ID; pesoBalancaG: number; data?: ISODate }): number {
  return db.tx((t) => {
    const material = exigirMaterial(t.get('materiais', dados.materialId));
    const p = calcularPesagem(material, dados.pesoBalancaG, saldoMaterialTx(t, material.id));
    if (p.delta === 0) return 0;
    lancarMovMaterial(t, {
      materialId: material.id,
      tipo: 'ajuste',
      quantidade: p.delta,
      data: dados.data,
      motivo: 'Pesei o carretel',
      refTipo: 'pesagem',
    });
    return p.delta;
  });
}

// ---------------------------------------------------------------- Ajustes e perdas

/** Ajuste manual do saldo de um material (+ entra / − sai), com motivo obrigatório. */
export function ajustarMaterial(dados: { materialId: ID; quantidade: number; motivo: string; data?: ISODate }): MovMaterial {
  return db.tx((t) => {
    exigirMaterial(t.get('materiais', dados.materialId));
    const motivo = texto(dados.motivo);
    if (!motivo) throw new ErroNegocio('Informe o motivo do ajuste.');
    return lancarMovMaterial(t, {
      materialId: dados.materialId,
      tipo: 'ajuste',
      quantidade: dados.quantidade,
      data: dados.data,
      motivo,
      refTipo: 'ajuste',
    });
  });
}

/** Perda de material (quantidade > 0, sai do saldo), com motivo e o custo médio do momento. */
export function registrarPerdaMaterial(dados: { materialId: ID; quantidade: number; motivo: string; data?: ISODate }): MovMaterial {
  return db.tx((t) => {
    exigirMaterial(t.get('materiais', dados.materialId));
    if (!Number.isFinite(dados.quantidade) || !(dados.quantidade > 0)) throw new ErroNegocio('Informe a quantidade perdida.');
    const motivo = texto(dados.motivo);
    if (!motivo) throw new ErroNegocio('Informe o motivo da perda.');
    return lancarMovMaterial(t, {
      materialId: dados.materialId,
      tipo: 'perda',
      quantidade: -dados.quantidade,
      data: dados.data,
      motivo,
    });
  });
}

// ---------------------------------------------------------------- Estorno

function bloqueioEstorno(mov: MovMaterial | undefined, movs: MovMaterial[]): string | null {
  if (!mov) return 'Movimento não encontrado.';
  if (mov.tipo === 'estorno') return 'Não é possível estornar um estorno.';
  if (mov.tipo === 'producao' || mov.refTipo === 'producao') return 'Este consumo veio de uma produção. Para desfazer, estorne a produção.';
  if (mov.tipo === 'pedido' || mov.refTipo === 'pedido') return 'Este consumo veio de um pedido. Corrija pelo próprio pedido.';
  if (idsEstornados(movs).has(mov.id)) return 'Este movimento já foi estornado.';
  return null;
}

/** Por que um movimento de material não pode ser estornado aqui (null = pode). Para mostrar ou esconder o botão. */
export function bloqueioEstornoMaterial(movId: ID): string | null {
  return bloqueioEstorno(db.get('movMateriais', movId), db.all('movMateriais'));
}

/**
 * Estorna um movimento manual de material (compra, ajuste, pesagem ou perda): lança o inverso com tipo 'estorno'.
 * Estornar uma compra desfaz o efeito dela no custo médio. Consumos de produção e de pedido são
 * estornados pelo próprio fluxo (estornar produção / pedido).
 */
export function estornarMovMaterial(movId: ID, motivo: string, data?: ISODate): MovMaterial {
  return db.tx((t) => {
    const orig = t.get('movMateriais', movId);
    const bloqueio = bloqueioEstorno(orig, t.all('movMateriais'));
    if (bloqueio || !orig) throw new ErroNegocio(bloqueio || 'Movimento não encontrado.');
    const m = texto(motivo);
    if (!m) throw new ErroNegocio('Informe o motivo do estorno.');
    const material = exigirMaterial(t.get('materiais', orig.materialId));

    if (orig.tipo === 'compra') {
      // Desfaz a compra no custo médio: devolução pelo custo da compra. Se não sobrar saldo
      // (ou a conta não fechar), volta ao custo médio de antes da compra.
      const qtdDigitada = material.tipo === 'filamento' ? shift(orig.quantidade, -3) : orig.quantidade;
      const custoCompra = custoDaCompra(material, qtdDigitada, orig.valorTotalCentavos || 0);
      const semCompra = Number.isFinite(custoCompra)
        ? custoMedioSemCompra(saldoMaterialTx(t, material.id), material.custoMedio, orig.quantidade, custoCompra)
        : null;
      const custo = semCompra ?? orig.custoUnitSnapshot ?? material.custoMedio;
      t.update('materiais', material.id, { custoMedio: round4(custo) });
    }

    return lancarMovMaterial(t, {
      materialId: orig.materialId,
      tipo: 'estorno',
      quantidade: -orig.quantidade,
      data,
      valorTotalCentavos: orig.valorTotalCentavos != null ? -orig.valorTotalCentavos : undefined,
      custoUnitSnapshot: orig.custoUnitSnapshot,
      motivo: m,
      refTipo: orig.refTipo,
      refId: orig.refId,
      estornoDe: orig.id,
    });
  });
}
