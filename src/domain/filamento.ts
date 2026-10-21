// Filamento do produto sem cor (decisão 85): a ficha guarda o TIPO (PLA, PETG...) e as gramas; a cor (o carretel)
// é escolhida na produção (ou em "Pronto", na peça personalizada do pedido). Fichas e itens de pedido antigos podem
// trazer um carretel específico (materialId): nesse caso o tipo vem do carretel. Funções puras.
import type { ID, Material, Mesa, MesaFilamento, TipoFilamento } from '../data/types.ts';

export const TIPOS_FILAMENTO: TipoFilamento[] = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro'];
export const TIPO_PADRAO: TipoFilamento = 'PLA';

/** Tipo do filamento de uma posição da ficha: o informado ou, em fichas antigas, o do carretel. */
export function tipoDoSlot(f: Pick<MesaFilamento, 'tipo' | 'materialId'>, material?: (id: ID) => Material | undefined): TipoFilamento {
  return f.tipo ?? (f.materialId ? material?.(f.materialId)?.material : undefined) ?? TIPO_PADRAO;
}

/** Carretéis ativos de um tipo (as "cores" disponíveis). */
export function carreteisDoTipo(materiais: Material[], tipo: TipoFilamento): Material[] {
  return materiais.filter((m) => m.tipo === 'filamento' && !m.arquivado && (m.material ?? TIPO_PADRAO) === tipo);
}

/**
 * Carretel (cor) padrão de uma posição do tipo `tipo`: o primeiro de `preferidos` que é um carretel ativo desse tipo
 * (ex.: a última cor usada, a sugerida pela ficha); senão o carretel ativo do tipo com mais saldo.
 * undefined se não houver carretel ativo do tipo.
 */
export function carretelPadrao(
  materiais: Material[],
  tipo: TipoFilamento,
  saldo: (id: ID) => number,
  preferidos: (ID | undefined)[],
): Material | undefined {
  const doTipo = carreteisDoTipo(materiais, tipo);
  for (const id of preferidos) {
    const m = id ? doTipo.find((x) => x.id === id) : undefined;
    if (m) return m;
  }
  return doTipo.sort((a, b) => saldo(b.id) - saldo(a.id))[0];
}

/**
 * Custo do kg de um tipo de filamento: média simples do custo médio dos carretéis ativos daquele tipo que têm
 * custo. undefined se não houver nenhum (a tela pede para cadastrar um filamento do tipo).
 */
export function custoKgDoTipo(materiais: Material[], tipo: TipoFilamento): number | undefined {
  const custos = carreteisDoTipo(materiais, tipo)
    .map((m) => m.custoMedio || 0)
    .filter((c) => c > 0);
  if (!custos.length) return undefined;
  return custos.reduce((s, c) => s + c, 0) / custos.length;
}

/** Chave de uma posição de filamento na ficha: 'mesaId:indice'. */
export function chaveSlot(mesaId: ID, indice: number): string {
  return `${mesaId}:${indice}`;
}

export interface PosicaoFilamento {
  chave: string;
  mesaId: ID;
  /** 0 = primeira mesa. */
  mesaIndice: number;
  indice: number;
  tipo: TipoFilamento;
  gramas: number;
  /** Carretel sugerido pela ficha (fichas antigas e pedidos), se houver. */
  materialId?: ID;
}

/** Posições de filamento da ficha, em ordem (uma por mesa × filamento). */
export function posicoesDaFicha(mesas: Mesa[], material?: (id: ID) => Material | undefined): PosicaoFilamento[] {
  return mesas.flatMap((mesa, mesaIndice) =>
    mesa.filamentos.map((f, indice) => ({
      chave: chaveSlot(mesa.id, indice),
      mesaId: mesa.id,
      mesaIndice,
      indice,
      tipo: tipoDoSlot(f, material),
      gramas: f.gramas || 0,
      ...(f.materialId ? { materialId: f.materialId } : {}),
    })),
  );
}

/** Amostra (hex) de cores comuns pelo nome, para o cadastro não precisar escolher a cor no seletor. */
const CORES_CONHECIDAS: [string, string][] = [
  ['preto', '#1F1F1F'],
  ['branco', '#F4F4F4'],
  ['cinza', '#8A8F95'],
  ['prata', '#C0C0C0'],
  ['grafite', '#4A4D52'],
  ['vermelho', '#C62828'],
  ['vinho', '#7B1F2E'],
  ['rosa', '#E86FA6'],
  ['pink', '#E86FA6'],
  ['laranja', '#F57C00'],
  ['amarelo', '#FBC02D'],
  ['dourado', '#C9A227'],
  ['ouro', '#C9A227'],
  ['bege', '#D7C4A3'],
  ['marrom', '#6D4C41'],
  ['madeira', '#9C7A54'],
  ['verde', '#2E7D32'],
  ['azul', '#1565C0'],
  ['celeste', '#64B5F6'],
  ['turquesa', '#26A69A'],
  ['roxo', '#7B1FA2'],
  ['lilás', '#B39DDB'],
  ['lilas', '#B39DDB'],
  ['transparente', '#E8EEF2'],
  ['natural', '#E8E4D8'],
];

/** Hex da amostra a partir do nome da cor ("Azul claro" -> azul). undefined se não reconhecer. */
export function hexDaCor(nome: string | null | undefined): string | undefined {
  const n = (nome ?? '').trim().toLocaleLowerCase('pt-BR');
  if (!n) return undefined;
  const achada = CORES_CONHECIDAS.find(([c]) => n === c || n.startsWith(`${c} `) || n.includes(` ${c}`) || n.startsWith(c));
  return achada?.[1];
}
