// Cadastro de impressoras (6.2): padrões por modelo, custo hora máquina, edição e desativação.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { ErroNegocio } from './estoque.ts';
import { custoHoraDe, desativarImpressora, padroesDoModelo, salvarImpressora } from './impressoras.ts';

function falha(fn: () => unknown, re: RegExp): void {
  assert.throws(fn, (e: unknown) => e instanceof ErroNegocio && re.test(e.message));
}

beforeEach(() => db.resetar());

describe('salvarImpressora — padrões do modelo', () => {
  it('A1 mini: R$ 2.179,00, 100 W, 5.000 h, R$ 0,05/h', () => {
    const i = salvarImpressora({ nome: 'Minha mini', modelo: 'A1 mini' });
    assert.equal(i.nome, 'Minha mini');
    assert.equal(i.modelo, 'A1 mini');
    assert.equal(i.valorPago, 2179);
    assert.equal(i.potenciaW, 100);
    assert.equal(i.vidaUtilH, 5000);
    assert.equal(i.manutencaoH, 0.05);
    assert.equal(i.ativa, true);
    assert.ok(Math.abs((custoHoraDe(i.id) ?? 0) - (2179 / 5000 + 0.05)) < 1e-12);
  });

  it('A1: R$ 2.998,00 e 95 W; modelo sem diferenciar maiúsculas', () => {
    const i = salvarImpressora({ nome: 'Grande', modelo: 'a1' });
    assert.equal(i.modelo, 'A1');
    assert.equal(i.valorPago, 2998);
    assert.equal(i.potenciaW, 95);
  });

  it('modelo desconhecido usa os padrões de "Outra" e guarda o texto do modelo', () => {
    const i = salvarImpressora({ nome: 'P1S', modelo: 'P1S', valorPago: 4500 });
    assert.equal(i.modelo, 'P1S');
    assert.equal(i.valorPago, 4500);
    assert.equal(i.vidaUtilH, 5000);
    assert.equal(padroesDoModelo('').modelo, 'Outra');
  });

  it('campos vazios (null) usam o padrão; sem nome, usa o modelo sem repetir', () => {
    const a = salvarImpressora({ modelo: 'A1 mini', valorPago: null, potenciaW: null });
    const b = salvarImpressora({ nome: '  ', modelo: 'A1 mini' });
    assert.equal(a.nome, 'A1 mini');
    assert.equal(a.valorPago, 2179);
    assert.equal(a.potenciaW, 100);
    assert.equal(b.nome, 'A1 mini 2');
  });
});

describe('custoHoraDe', () => {
  it('Exemplo A: A1 mini R$ 2.000,00, 4.000 h, R$ 0,10/h -> R$ 0,60', () => {
    const i = salvarImpressora({ nome: 'A1 mini', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, manutencaoH: 0.1, potenciaW: 80 });
    assert.equal(custoHoraDe(i.id), 0.6);
    assert.equal(i.potenciaW, 80);
  });
  it('Exemplo D: A1 R$ 3.500,00, 5.000 h, R$ 0,10/h -> R$ 0,80', () => {
    const i = salvarImpressora({ nome: 'A1', modelo: 'A1', valorPago: 3500, vidaUtilH: 5000, manutencaoH: 0.1, potenciaW: 100 });
    assert.ok(Math.abs((custoHoraDe(i.id) ?? 0) - 0.8) < 1e-12);
  });
  it('impressora inexistente -> null', () => {
    assert.equal(custoHoraDe('nao-existe'), null);
  });
});

describe('salvarImpressora — edição e validações', () => {
  it('edição mantém o que não foi informado', () => {
    const i = salvarImpressora({ nome: 'Mini', modelo: 'A1 mini', valorPago: 2000 });
    const e = salvarImpressora({ id: i.id, nome: 'Mini da sala', manutencaoH: 0.1, valorPago: null });
    assert.equal(e.id, i.id);
    assert.equal(e.nome, 'Mini da sala');
    assert.equal(e.valorPago, 2000);
    assert.equal(e.manutencaoH, 0.1);
    assert.equal(e.modelo, 'A1 mini');
    assert.equal(db.all('impressoras').length, 1);
  });

  it('id inexistente cria com esse id', () => {
    const i = salvarImpressora({ id: 'imp-a1mini', nome: 'A1 mini', modelo: 'A1 mini' });
    assert.equal(i.id, 'imp-a1mini');
  });

  it('recusa vida útil 0 e valores negativos, sem gravar', () => {
    falha(() => salvarImpressora({ nome: 'X', modelo: 'A1', vidaUtilH: 0 }), /vida útil/);
    falha(() => salvarImpressora({ nome: 'X', modelo: 'A1', valorPago: -1 }), /valor pago/);
    falha(() => salvarImpressora({ nome: 'X', modelo: 'A1', potenciaW: -5 }), /potência/);
    falha(() => salvarImpressora({ nome: 'X', modelo: 'A1', manutencaoH: Number.NaN }), /manutenção/);
    assert.equal(db.all('impressoras').length, 0);
  });
});

describe('desativarImpressora', () => {
  it('desativa e reativa; o custo continua calculável', () => {
    const i = salvarImpressora({ nome: 'A1', modelo: 'A1' });
    assert.equal(desativarImpressora(i.id).ativa, false);
    assert.ok((custoHoraDe(i.id) ?? 0) > 0);
    assert.equal(desativarImpressora(i.id, true).ativa, true);
    falha(() => desativarImpressora('x'), /não encontrada/);
  });
});
