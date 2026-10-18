// Consumo de materiais de uma ficha técnica (seção 7.4).
// Filamento = para cada mesa e filamento, (gramas da mesa ÷ N) × (boas + perdidas).
// Componentes = quantidade por peça × boas.
import type { Componente, ID, Mesa, MesaFilamento } from '../data/types.ts';

export interface Consumo {
  /** Gramas por filamento (somadas entre mesas). */
  filamentos: { materialId: ID; gramas: number }[];
  /** Unidades por insumo. */
  componentes: { materialId: ID; quantidade: number }[];
}

function somar(lista: { materialId: ID; valor: number }[]): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const { materialId, valor } of lista) m.set(materialId, (m.get(materialId) || 0) + valor);
  return m;
}

/**
 * Consumo para produzir `boas` peças com `perdidas` falhas.
 * `gramasReais` (opcional) substitui o cálculo do filamento.
 */
export function consumoFicha(
  ficha: { mesas: Mesa[]; componentes: Componente[] },
  boas: number,
  perdidas = 0,
  gramasReais?: MesaFilamento[],
): Consumo {
  const total = boas + perdidas;
  const fil = gramasReais
    ? somar(gramasReais.map((g) => ({ materialId: g.materialId, valor: g.gramas })))
    : somar(
        ficha.mesas.flatMap((mesa) => {
          const n = mesa.pecasPorMesa > 0 ? mesa.pecasPorMesa : 1;
          return mesa.filamentos.map((f) => ({ materialId: f.materialId, valor: (f.gramas / n) * total }));
        }),
      );
  const comp = somar(ficha.componentes.map((c) => ({ materialId: c.materialId, valor: c.quantidade * boas })));
  return {
    filamentos: Array.from(fil, ([materialId, gramas]) => ({ materialId, gramas: Math.round(gramas * 100) / 100 })),
    componentes: Array.from(comp, ([materialId, quantidade]) => ({ materialId, quantidade: Math.round(quantidade * 10000) / 10000 })),
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
