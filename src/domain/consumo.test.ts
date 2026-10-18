// Exemplo G: 2 mesas de 8 Kettlebell Preto com 1 peça perdida.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consumoFicha, mesasNecessarias, pecasPorMesas } from './consumo.ts';

const ficha = {
  mesas: [{ id: 'm1', pecasPorMesa: 8, tempoMin: 240, impressoraId: 'imp', filamentos: [{ materialId: 'pla', gramas: 64 }] }],
  componentes: [
    { materialId: 'arg', quantidade: 1 },
    { materialId: 'saq', quantidade: 1 },
  ],
};

describe('Exemplo G — consumo da produção', () => {
  it('2 mesas de 8 = 16 peças; 15 boas + 1 perdida', () => {
    assert.equal(pecasPorMesas(2, 8), 16);
    const c = consumoFicha(ficha, 15, 1);
    assert.deepEqual(c.filamentos, [{ materialId: 'pla', gramas: 128 }]);
    assert.deepEqual(c.componentes, [
      { materialId: 'arg', quantidade: 15 },
      { materialId: 'saq', quantidade: 15 },
    ]);
  });
  it('gramas reais substituem o cálculo', () => {
    const c = consumoFicha(ficha, 15, 1, [{ materialId: 'pla', gramas: 131 }]);
    assert.deepEqual(c.filamentos, [{ materialId: 'pla', gramas: 131 }]);
  });
  it('mesas necessárias arredondam para cima', () => {
    assert.deepEqual(mesasNecessarias(ficha.mesas, 17), [{ mesaId: 'm1', mesas: 3, tempoMin: 720 }]);
  });
});
