// Consumo de materiais de uma ficha técnica (seção 7.4).
// Filamento = para cada mesa e filamento, (gramas da mesa ÷ N) × (boas + perdidas), baixado do carretel (cor)
// escolhido para aquela posição. Componentes = quantidade por peça × boas.
import type { Componente, ID, Mesa, MesaFilamento } from '../data/types.ts';
import { chaveSlot } from './filamento.ts';

export interface Consumo {
  /** Gramas por filamento (somadas entre mesas). */
  filamentos: { materialId: ID; gramas: number }[];
  /** Unidades por insumo. */
  componentes: { materialId: ID; quantidade: number }[];
  /** Posições da ficha ('mesaId:indice') sem cor escolhida: nada foi baixado delas. */
  semCor: string[];
}

function somar(lista: { materialId: ID; valor: number }[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const { materialId, valor } of lista) m.set(materialId, (m.get(materialId) || 0) + valor);
  return m;
}

/**
 * Consumo para produzir `boas` peças com `perdidas` falhas.
 * `cores` diz o carretel de cada posição ('mesaId:indice'); sem ele, vale o carretel da ficha (pedidos e fichas
 * antigas). `gramasReais` (opcional) substitui o cálculo do filamento.
 */
export function consumoFicha(
  ficha: { mesas: Mesa[]; componentes: Componente[] },
  boas: number,
  perdidas = 0,
  gramasReais?: MesaFilamento[],
  cores?: Record<string, ID>,
): Consumo {
  const total = boas + perdidas;
  const semCor: string[] = [];
  const fil = gramasReais
    ? somar(gramasReais.filter((g) => g.materialId).map((g) => ({ materialId: g.materialId as ID, valor: g.gramas })))
    : somar(
        ficha.mesas.flatMap((mesa) => {
          const n = mesa.pecasPorMesa > 0 ? mesa.pecasPorMesa : 1;
          return mesa.filamentos.flatMap((f, i) => {
            const chave = chaveSlot(mesa.id, i);
            const materialId = cores?.[chave] ?? f.materialId;
            if (!materialId) {
              if ((f.gramas || 0) > 0) semCor.push(chave);
              return [];
            }
            return [{ materialId, valor: (f.gramas / n) * total }];
          });
        }),
      );
  const comp = somar(ficha.componentes.map((c) => ({ materialId: c.materialId, valor: c.quantidade * boas })));
  return {
    filamentos: Array.from(fil, ([materialId, gramas]) => ({ materialId, gramas: Math.round(gramas * 100) / 100 })),
    componentes: Array.from(comp, ([materialId, quantidade]) => ({ materialId, quantidade: Math.round(quantidade * 10000) / 10000 })),
    semCor,
  };
}

/** Atalho "2 mesas de 8" = 16 peças. */
export function pecasPorMesas(mesas: number, pecasPorMesa: number): number {
  return Math.max(0, Math.round(mesas)) * Math.max(0, Math.round(pecasPorMesa));
}

/** Mesas necessárias para `qtd` peças: arredondar para cima(qtd ÷ N), usando a primeira mesa (maior N) como referência por mesa. */
export function mesasNecessarias(mesas: Mesa[], qtd: number): { mesaId: ID; mesas: number; tempoMin: number }[] {
  return mesas.map((m) => {
    const n = m.pecasPorMesa > 0 ? m.pecasPorMesa : 1;
    const q = Math.ceil(Math.max(0, qtd) / n);
    return { mesaId: m.id, mesas: q, tempoMin: q * (m.tempoMin || 0) };
  });
}
