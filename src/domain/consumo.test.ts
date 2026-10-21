// Exemplo G: 2 mesas de 8 Kettlebell Preto com 1 peça perdida; e a cor padrão de cada posição de filamento.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Material } from '../data/types.ts';
import { consumoFicha, mesasNecessarias, pecasPorMesas } from './consumo.ts';
import { carretelPadrao } from './filamento.ts';

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
  it('ficha sem cor: o carretel de cada posição vem da produção; posição sem cor é avisada', () => {
    const semCor = { ...ficha, mesas: [{ ...ficha.mesas[0], filamentos: [{ tipo: 'PLA' as const, gramas: 64 }] }] };
    assert.deepEqual(consumoFicha(semCor, 8, 0, undefined, { 'm1:0': 'rosa' }).filamentos, [{ materialId: 'rosa', gramas: 64 }]);
    const sem = consumoFicha(semCor, 8);
    assert.deepEqual(sem.filamentos, []);
    assert.deepEqual(sem.semCor, ['m1:0']);
    // A cor escolhida vence o carretel sugerido pela ficha.
    assert.deepEqual(consumoFicha(ficha, 8, 0, undefined, { 'm1:0': 'rosa' }).filamentos, [{ materialId: 'rosa', gramas: 64 }]);
  });

  it('gramas reais substituem o cálculo', () => {
    const c = consumoFicha(ficha, 15, 1, [{ materialId: 'pla', gramas: 131 }]);
    assert.deepEqual(c.filamentos, [{ materialId: 'pla', gramas: 131 }]);
  });
  it('mesas necessárias arredondam para cima', () => {
    assert.deepEqual(mesasNecessarias(ficha.mesas, 17), [{ mesaId: 'm1', mesas: 3, tempoMin: 720 }]);
  });
});

describe('cor padrão de uma posição (carretelPadrao)', () => {
  const base = { criadoEm: '', atualizadoEm: '', unidade: 'g', custoMedio: 100, minimo: 0, arquivado: false };
  const fil = (id: string, material: Material['material'], over: Partial<Material> = {}): Material =>
    ({ ...base, id, tipo: 'filamento', nome: id, material, ...over }) as Material;
  const materiais: Material[] = [
    fil('preto', 'PLA'),
    fil('rosa', 'PLA'),
    fil('velho', 'PLA', { arquivado: true }),
    fil('petg', 'PETG'),
    { ...base, id: 'arg', tipo: 'insumo', nome: 'Argola', unidade: 'un' } as Material,
  ];
  const saldos: Record<string, number> = { preto: 300, rosa: 800, velho: 5000, petg: 900 };
  const saldo = (id: string) => saldos[id] ?? 0;

  it('a primeira preferida que é um carretel ativo do tipo; senão o do tipo com mais saldo', () => {
    assert.equal(carretelPadrao(materiais, 'PLA', saldo, [undefined, 'preto'])?.id, 'preto');
    assert.equal(carretelPadrao(materiais, 'PLA', saldo, ['velho', 'petg', 'arg', 'sumiu'])?.id, 'rosa');
    assert.equal(carretelPadrao(materiais, 'PLA', saldo, [])?.id, 'rosa');
    assert.equal(carretelPadrao(materiais, 'PETG', saldo, ['rosa'])?.id, 'petg');
    assert.equal(carretelPadrao(materiais, 'TPU', saldo, []), undefined);
  });
});
