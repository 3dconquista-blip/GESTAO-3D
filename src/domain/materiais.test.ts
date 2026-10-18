// Regras de materiais (seção 7.3): custo médio, compra, pesagem e status.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  custoDaCompra,
  custoMedioSemCompra,
  gramasRestantes,
  novoCustoMedio,
  qtdCompraNoSaldo,
  resumoCompra,
  statusMaterial,
  unidadeCompra,
} from './materiais.ts';

const fil = { tipo: 'filamento' as const, unidade: 'g', custoMedio: 100 };
const ins = { tipo: 'insumo' as const, unidade: 'un', custoMedio: 0.3 };

describe('custo médio', () => {
  it('média ponderada: 1 kg a R$ 100 + 1 kg a R$ 120 = R$ 110/kg', () => {
    assert.equal(novoCustoMedio(1000, 100, 1000, 120), 110);
    assert.equal(novoCustoMedio(1, 100, 1, 120), 110); // mesma conta em kg
  });
  it('saldo zero ou negativo: vale o custo da compra', () => {
    assert.equal(novoCustoMedio(0, 100, 1000, 130), 130);
    assert.equal(novoCustoMedio(-50, 100, 1000, 130), 130);
  });
  it('insumo: 100 argolas a 0,30 + 50 a 0,36 = 0,32', () => {
    assert.ok(Math.abs(novoCustoMedio(100, 0.3, 50, 0.36) - 0.32) < 1e-12);
  });
  it('desfazer compra devolve o custo anterior', () => {
    const c1 = novoCustoMedio(500, 100, 1000, 130);
    assert.equal(c1, 120);
    assert.ok(Math.abs((custoMedioSemCompra(1500, c1, 1000, 130) ?? -1) - 100) < 1e-9);
    assert.equal(custoMedioSemCompra(1000, 130, 1000, 130), null); // não sobra nada
  });
});

describe('compra de material', () => {
  it('filamento é digitado em kg e entra em gramas', () => {
    assert.equal(unidadeCompra(fil), 'kg');
    assert.equal(unidadeCompra(ins), 'un');
    assert.equal(qtdCompraNoSaldo(fil, 1.1), 1100);
    assert.equal(qtdCompraNoSaldo(ins, 100), 100);
  });
  it('custo da compra: R$/kg ou R$/un', () => {
    assert.equal(custoDaCompra(fil, 1, 10000), 100);
    assert.equal(custoDaCompra(fil, 0.5, 6000), 120);
    assert.equal(custoDaCompra(ins, 100, 3000), 0.3);
    assert.ok(Number.isNaN(custoDaCompra(ins, 0, 3000)));
  });
  it('resumo da compra', () => {
    const r = resumoCompra(fil, 1000, 1, 12000);
    assert.deepEqual(r, { qtdNoSaldo: 1000, custoCompra: 120, custoAtual: 100, custoNovo: 110, saldoAntes: 1000, saldoDepois: 2000 });
  });
});

describe('pesagem e status', () => {
  it('Pesei o carretel: balança − carretel vazio', () => {
    assert.equal(gramasRestantes(1100, 250), 850);
    assert.equal(gramasRestantes(612.4, 0), 612.4);
    assert.equal(gramasRestantes(200, 250), 0);
    assert.equal(gramasRestantes(1000.1, 245.3), 754.8);
  });
  it('status do saldo', () => {
    assert.equal(statusMaterial(872, 250), 'ok');
    assert.equal(statusMaterial(250, 250), 'ok');
    assert.equal(statusMaterial(249, 250), 'baixo');
    assert.equal(statusMaterial(0, 250), 'baixo');
    assert.equal(statusMaterial(-5, 250), 'negativo');
  });
});
