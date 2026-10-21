// Alertas de estoque (seções 7.1, 7.3 e 7.6; bloco "Hoje" do Início, seção 11.1). Funções puras.
// - Saldo negativo de produto (qualquer local) e de material (filamento: "Pese o carretel"): vermelho.
// - Produto abaixo do mínimo em Casa; filamento ou insumo abaixo do mínimo: amarelo.
// - Produto sem venda há N dias (padrão 60): sem 'venda_direta' nem 'venda_parceiro' não estornada no
//   período, contado desde a última venda ou, sem venda, desde que o produto existe (cadastro ou primeiro
//   movimento, o que vier antes). Só para produtos com peças em estoque.
// - Modelo de terceiro com licença "não" ou "não sei": alerta discreto.
// Produtos e materiais arquivados ficam fora (exceto saldo negativo de produto, que precisa de ajuste).
import type { ID, ISODate, LocalId, Material, MovEstoque, Parceiro, Produto } from '../data/types.ts';
import { CASA, parceiroDoLocal } from '../data/types.ts';
import { diaDe, diffDias } from '../lib/dates.ts';
import { formatData, formatGramas, formatQtd } from '../lib/format.ts';
import { idsEstornados } from './stock.ts';

export type TipoAlertaEstoque =
  | 'abaixo_minimo'
  | 'material_baixo'
  | 'saldo_negativo'
  | 'material_negativo'
  | 'sem_venda'
  | 'licenca';

export interface AlertaEstoque {
  /** Estável entre renderizações: '<tipo>:<id>' (ou '<tipo>:<id>:<local>'). */
  id: string;
  tipo: TipoAlertaEstoque;
  tom: 'atencao' | 'ruim';
  titulo: string;
  detalhe: string;
  /** Rota da tela que resolve o alerta (sem '#'). */
  href: string;
  /** Mostrar de forma discreta (licença do modelo). */
  discreto?: boolean;
  produtoId?: ID;
  materialId?: ID;
}

export interface EntradaAlertas {
  produtos: Produto[];
  /** Saldo por produto e local (calcularSaldos / saldosEstoque()). */
  saldos: Map<ID, Map<LocalId, number>>;
  materiais: Material[];
  saldoMaterial: (materialId: ID) => number;
  movEstoque: MovEstoque[];
  hoje: ISODate;
  /** Padrão 60 (Configurações > estoque.diasSemVendaAlerta). */
  diasSemVenda?: number;
  /** Para dar nome ao local do parceiro nos saldos negativos. */
  parceiros?: Parceiro[];
  /** Estoque mínimo em Casa de cada produto (padrão: o informado; o app passa o automático, decisão 102). */
  minimo?: (produto: Produto) => number;
}

export const DIAS_SEM_VENDA_PADRAO = 60;

const ORDEM_TIPO: Record<TipoAlertaEstoque, number> = {
  saldo_negativo: 0,
  material_negativo: 1,
  abaixo_minimo: 2,
  material_baixo: 3,
  sem_venda: 4,
  licenca: 5,
};

/** Rota do detalhe do produto. */
export function rotaProduto(id: ID): string {
  return `/estoque/produtos/${id}`;
}

/** Rota do detalhe do material. */
export function rotaMaterial(id: ID): string {
  return `/estoque/materiais/${id}`;
}

export interface DatasVendaProduto {
  /** Data da última venda não estornada (direta ou no parceiro), ou null. */
  ultimaVenda: ISODate | null;
  /** Data do primeiro movimento de estoque do produto, ou null. */
  primeiroMovimento: ISODate | null;
}

/** Última venda não estornada e primeiro movimento de cada produto. */
export function datasDeVenda(movs: MovEstoque[]): Map<ID, DatasVendaProduto> {
  const estornados = idsEstornados(movs);
  const out = new Map<ID, DatasVendaProduto>();
  for (const m of movs) {
    let d = out.get(m.produtoId);
    if (!d) out.set(m.produtoId, (d = { ultimaVenda: null, primeiroMovimento: null }));
    if (!d.primeiroMovimento || m.data < d.primeiroMovimento) d.primeiroMovimento = m.data;
    if ((m.tipo === 'venda_direta' || m.tipo === 'venda_parceiro') && !estornados.has(m.id)) {
      if (!d.ultimaVenda || m.data > d.ultimaVenda) d.ultimaVenda = m.data;
    }
  }
  return out;
}

function qtdMaterial(m: Material, q: number): string {
  return m.tipo === 'filamento' ? formatGramas(q) : `${formatQtd(q)} ${m.unidade || 'un'}`;
}

function nomeLocal(local: LocalId, parceiros: Map<ID, Parceiro>): string {
  if (local === CASA) return 'Em Casa';
  const pid = parceiroDoLocal(local);
  const p = pid ? parceiros.get(pid) : undefined;
  return p ? `No parceiro ${p.nome}` : 'No parceiro';
}

/** Alertas de estoque, do mais grave ao mais leve (vermelhos primeiro; depois por tipo e nome). */
export function alertasEstoque(e: EntradaAlertas): AlertaEstoque[] {
  const out: (AlertaEstoque & { nome: string })[] = [];
  const parceiros = new Map((e.parceiros ?? []).map((p) => [p.id, p]));
  const diasSemVenda = e.diasSemVenda ?? DIAS_SEM_VENDA_PADRAO;
  const datas = datasDeVenda(e.movEstoque);

  for (const p of e.produtos) {
    const porLocal = e.saldos.get(p.id);
    const casa = porLocal?.get(CASA) || 0;
    let total = 0;

    // Saldo negativo em qualquer local.
    for (const [local, q] of porLocal ?? []) {
      total += q;
      if (q < 0) {
        out.push({
          id: `saldo_negativo:${p.id}:${local}`,
          tipo: 'saldo_negativo',
          tom: 'ruim',
          titulo: `Saldo negativo: ${p.nome}`,
          detalhe: `${nomeLocal(local, parceiros)}: ${formatQtd(q)}. Confira e faça um ajuste de inventário.`,
          href: rotaProduto(p.id),
          produtoId: p.id,
          nome: p.nome,
        });
      }
    }
    if (p.arquivado) continue;

    // Abaixo do mínimo em Casa (o negativo já tem alerta próprio).
    const minimo = e.minimo ? e.minimo(p) : p.estoqueMinimo;
    if (minimo > 0 && casa >= 0 && casa < minimo) {
      out.push({
        id: `abaixo_minimo:${p.id}`,
        tipo: 'abaixo_minimo',
        tom: 'atencao',
        titulo: `${p.nome} abaixo do mínimo`,
        detalhe: `Em Casa: ${formatQtd(casa)}. Mínimo: ${formatQtd(minimo)}${p.estoqueMinimo > 0 ? '' : ' (automático)'}.`,
        href: rotaProduto(p.id),
        produtoId: p.id,
        nome: p.nome,
      });
    }

    // Sem venda há N dias (só com peças em estoque).
    if (diasSemVenda > 0 && total > 0) {
      const d = datas.get(p.id);
      const criado = p.criadoEm ? diaDe(p.criadoEm) : null;
      const desde = [criado, d?.primeiroMovimento ?? null].filter((x): x is ISODate => !!x).sort()[0] ?? null;
      const ref = d?.ultimaVenda ?? desde;
      const dias = ref ? diffDias(ref, e.hoje) : 0;
      if (ref && dias >= diasSemVenda) {
        out.push({
          id: `sem_venda:${p.id}`,
          tipo: 'sem_venda',
          tom: 'atencao',
          titulo: `${p.nome} sem venda há ${dias} dias`,
          detalhe: d?.ultimaVenda
            ? `Última venda em ${formatData(d.ultimaVenda)}. ${formatQtd(total)} em estoque.`
            : `Nenhuma venda registrada. ${formatQtd(total)} em estoque.`,
          href: rotaProduto(p.id),
          produtoId: p.id,
          nome: p.nome,
        });
      }
    }

    // Licença do modelo de terceiro.
    if (p.origemModelo === 'terceiro' && p.licencaVenda !== 'sim') {
      out.push({
        id: `licenca:${p.id}`,
        tipo: 'licenca',
        tom: 'atencao',
        titulo: `Licença do modelo: ${p.nome}`,
        detalhe:
          p.licencaVenda === 'nao'
            ? 'A licença deste modelo de terceiro não permite venda.'
            : 'Confira se a licença deste modelo de terceiro permite venda.',
        href: rotaProduto(p.id),
        discreto: true,
        produtoId: p.id,
        nome: p.nome,
      });
    }
  }

  for (const m of e.materiais) {
    if (m.arquivado) continue;
    const saldo = e.saldoMaterial(m.id);
    if (saldo < 0) {
      out.push({
        id: `material_negativo:${m.id}`,
        tipo: 'material_negativo',
        tom: 'ruim',
        titulo: `Saldo negativo: ${m.nome}`,
        detalhe:
          m.tipo === 'filamento'
            ? `Saldo: ${qtdMaterial(m, saldo)}. Pese o carretel.`
            : `Saldo: ${qtdMaterial(m, saldo)}. Confira e faça um ajuste.`,
        href: rotaMaterial(m.id),
        materialId: m.id,
        nome: m.nome,
      });
    } else if (m.minimo > 0 && saldo < m.minimo) {
      out.push({
        id: `material_baixo:${m.id}`,
        tipo: 'material_baixo',
        tom: 'atencao',
        titulo: `${m.nome} abaixo do mínimo`,
        detalhe: `Restam ${qtdMaterial(m, saldo)}. Mínimo: ${qtdMaterial(m, m.minimo)}.`,
        href: rotaMaterial(m.id),
        materialId: m.id,
        nome: m.nome,
      });
    }
  }

  return out
    .sort(
      (a, b) =>
        (a.tom === 'ruim' ? 0 : 1) - (b.tom === 'ruim' ? 0 : 1) ||
        ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo] ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    .map(({ nome: _n, ...a }) => a);
}
