// Materiais (seção 7.3): cadastro, compra com custo médio, "Pesei o carretel", ajustes, perdas e estornos.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { saldoMaterial } from '../data/selectors.ts';
import {
  ajustarMaterial,
  arquivarMaterial,
  bloqueioEstornoMaterial,
  comprarMaterial,
  estornarMovMaterial,
  lancarMovMaterial,
  pesarCarretel,
  previaCompra,
  previaPesagem,
  registrarPerdaMaterial,
  salvarMaterial,
} from './materiais.ts';

const movsDe = (materialId: string) => db.all('movMateriais').filter((m) => m.materialId === materialId);

beforeEach(() => db.resetar());

describe('cadastro de material', () => {
  it('filamento: unidade g, mínimo padrão 250 g, nome a partir do material e da cor', () => {
    const m = salvarMaterial({ tipo: 'filamento', corNome: 'Preto', custoMedio: 100 });
    assert.equal(m.nome, 'PLA Preto');
    assert.equal(m.material, 'PLA');
    assert.equal(m.unidade, 'g');
    assert.equal(m.minimo, 250);
    assert.equal(m.taraCarretelG, undefined);
    assert.equal(m.custoMedio, 100);
    assert.equal(m.arquivado, false);
  });
  it('mínimo padrão do filamento vem da configuração', () => {
    db.tx((t) => t.config((c) => ({ ...c, estoque: { ...c.estoque, minimoFilamentoPadraoG: 400 } })));
    assert.equal(salvarMaterial({ tipo: 'filamento', nome: 'PETG Azul', material: 'PETG' }).minimo, 400);
  });
  it('insumo: unidade un por padrão, mínimo 0', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: ' Argola ', custoMedio: 0.3 });
    assert.equal(m.nome, 'Argola');
    assert.equal(m.unidade, 'un');
    assert.equal(m.minimo, 0);
    assert.equal(m.taraCarretelG, undefined);
    assert.equal(salvarMaterial({ tipo: 'insumo', nome: 'Corrente', unidade: 'm' }).unidade, 'm');
  });
  it('validações', () => {
    assert.throws(() => salvarMaterial({ tipo: 'insumo', nome: '  ' }), /nome/);
    assert.throws(() => salvarMaterial({ tipo: 'insumo', nome: 'Ímã', custoMedio: -1 }), /negativo/);
    assert.throws(() => salvarMaterial({ tipo: 'insumo', nome: 'Cola', minimo: -1 }), /mínimo/);
    assert.equal(db.all('materiais').length, 0);
  });
  it('editar mantém o que não foi informado; não troca o tipo depois de ter movimentos', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto', custoMedio: 100, marca: 'Bambu' });
    const e = salvarMaterial({ id: m.id, tipo: 'filamento', minimo: 300 });
    assert.equal(e.nome, 'PLA Preto');
    assert.equal(e.marca, 'Bambu');
    assert.equal(e.minimo, 300);
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000 });
    assert.throws(() => salvarMaterial({ id: m.id, tipo: 'insumo' }), /movimentações/);
  });
  it('saldo inicial no cadastro vira ajuste', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Saquinho', custoMedio: 0.1, saldoInicial: 100, data: '2026-10-01' });
    assert.equal(saldoMaterial(m.id), 100);
    const [mov] = movsDe(m.id);
    assert.equal(mov.tipo, 'ajuste');
    assert.equal(mov.motivo, 'Saldo inicial');
    assert.equal(mov.data, '2026-10-01');
  });
  it('arquivar e reativar', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Ímã' });
    assert.equal(arquivarMaterial(m.id).arquivado, true);
    assert.equal(arquivarMaterial(m.id, false).arquivado, false);
  });
});

describe('Compra de material', () => {
  it('filamento em kg entra em gramas e define o custo médio', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto' });
    const r = comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000, data: '2026-10-01' });
    assert.equal(saldoMaterial(m.id), 1000);
    assert.equal(db.get('materiais', m.id)?.custoMedio, 100);
    assert.equal(r.mov.tipo, 'compra');
    assert.equal(r.mov.quantidade, 1000);
    assert.equal(r.mov.valorTotalCentavos, 10000);
    assert.equal(r.mov.custoUnitSnapshot, 0); // custo médio de antes da compra
    assert.equal(r.mov.data, '2026-10-01');
    assert.equal(r.custoCompra, 100);
  });
  it('custo médio ponderado com o saldo de antes da compra', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto' });
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000 });
    const p = previaCompra({ materialId: m.id, quantidade: 1, valorTotalCentavos: 12000 });
    assert.equal(p.custoNovo, 110);
    assert.equal(p.saldoDepois, 2000);
    assert.equal(p.unidadeCompra, 'kg');
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 12000 });
    assert.equal(db.get('materiais', m.id)?.custoMedio, 110);
    assert.equal(saldoMaterial(m.id), 2000);
  });
  it('insumo por unidade: 100 argolas por R$ 30,00 = R$ 0,30', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Argola' });
    comprarMaterial({ materialId: m.id, quantidade: 100, valorTotalCentavos: 3000 });
    assert.equal(db.get('materiais', m.id)?.custoMedio, 0.3);
    assert.equal(saldoMaterial(m.id), 100);
  });
  it('saldo negativo: novo custo = custo da compra', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Branco', custoMedio: 90 });
    ajustarMaterial({ materialId: m.id, quantidade: -40, motivo: 'teste' });
    comprarMaterial({ materialId: m.id, quantidade: 0.5, valorTotalCentavos: 6000 });
    assert.equal(db.get('materiais', m.id)?.custoMedio, 120);
    assert.equal(saldoMaterial(m.id), 460);
  });
  it('validações', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Argola' });
    assert.throws(() => comprarMaterial({ materialId: m.id, quantidade: 0, valorTotalCentavos: 100 }), /quantidade/);
    assert.throws(() => comprarMaterial({ materialId: m.id, quantidade: 10, valorTotalCentavos: -1 }), /valor/);
    assert.throws(() => comprarMaterial({ materialId: 'x', quantidade: 10, valorTotalCentavos: 100 }), /não encontrado/);
    assert.equal(db.all('movMateriais').length, 0);
  });
});

describe('Pesei o carretel', () => {
  it('ajuste = (balança − carretel vazio de 170 g) − saldo', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto' });
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000 });
    const p = previaPesagem({ materialId: m.id, pesoBalancaG: 1100 });
    assert.equal(p.taraCarretelG, 170);
    assert.equal(p.gramasRestantes, 930);
    assert.equal(p.delta, -70);
    assert.equal(pesarCarretel({ materialId: m.id, pesoBalancaG: 1100, data: '2026-10-10' }), -70);
    assert.equal(saldoMaterial(m.id), 930);
    const mov = movsDe(m.id).find((x) => x.refTipo === 'pesagem');
    assert.equal(mov?.tipo, 'ajuste');
    assert.equal(mov?.motivo, 'Pesei o carretel');
    assert.equal(mov?.data, '2026-10-10');
  });
  it('sem diferença, nada é lançado; saldo negativo volta ao real', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Rosa' });
    assert.equal(pesarCarretel({ materialId: m.id, pesoBalancaG: 170 }), 0);
    assert.equal(db.all('movMateriais').length, 0);
    ajustarMaterial({ materialId: m.id, quantidade: -30, motivo: 'teste' });
    assert.equal(pesarCarretel({ materialId: m.id, pesoBalancaG: 500 }), 360);
    assert.equal(saldoMaterial(m.id), 330);
  });
  it('só filamento', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Argola' });
    assert.throws(() => pesarCarretel({ materialId: m.id, pesoBalancaG: 100 }), /filamentos/);
  });
});

describe('ajustes, perdas e estornos', () => {
  it('ajuste exige motivo e quantidade diferente de zero', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Argola' });
    assert.throws(() => ajustarMaterial({ materialId: m.id, quantidade: 5, motivo: ' ' }), /motivo/);
    assert.throws(() => ajustarMaterial({ materialId: m.id, quantidade: 0, motivo: 'x' }), /diferente de zero/);
    assert.equal(ajustarMaterial({ materialId: m.id, quantidade: 5, motivo: 'contagem' }).quantidade, 5);
  });
  it('perda sai do saldo com o custo do momento', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto' });
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000 });
    const p = registrarPerdaMaterial({ materialId: m.id, quantidade: 120, motivo: 'Filamento úmido' });
    assert.equal(p.tipo, 'perda');
    assert.equal(p.quantidade, -120);
    assert.equal(p.custoUnitSnapshot, 100);
    assert.equal(saldoMaterial(m.id), 880);
    assert.throws(() => registrarPerdaMaterial({ materialId: m.id, quantidade: -1, motivo: 'x' }), /quantidade/);
  });
  it('estornar compra desfaz o saldo e o custo médio', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto' });
    comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000 });
    const c2 = comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 13000 });
    assert.equal(db.get('materiais', m.id)?.custoMedio, 115);
    const e = estornarMovMaterial(c2.mov.id, 'valor digitado errado');
    assert.equal(e.tipo, 'estorno');
    assert.equal(e.estornoDe, c2.mov.id);
    assert.equal(e.quantidade, -1000);
    assert.equal(e.valorTotalCentavos, -13000);
    assert.equal(saldoMaterial(m.id), 1000);
    assert.equal(db.get('materiais', m.id)?.custoMedio, 100);
    assert.throws(() => estornarMovMaterial(c2.mov.id, 'de novo'), /já foi estornado/);
    assert.throws(() => estornarMovMaterial(e.id, 'x'), /estorno/);
  });
  it('estornar a primeira compra (saldo zero) volta ao custo de antes', () => {
    const m = salvarMaterial({ tipo: 'filamento', nome: 'PLA Cinza', custoMedio: 95 });
    const c = comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 150000 });
    assert.equal(db.get('materiais', m.id)?.custoMedio, 1500);
    estornarMovMaterial(c.mov.id, 'digitei R$ 1.500 em vez de R$ 150');
    assert.equal(db.get('materiais', m.id)?.custoMedio, 95);
    assert.equal(saldoMaterial(m.id), 0);
  });
  it('estorno exige motivo; consumo de produção ou pedido não se estorna aqui', () => {
    const m = salvarMaterial({ tipo: 'insumo', nome: 'Argola' });
    const a = ajustarMaterial({ materialId: m.id, quantidade: 10, motivo: 'contagem' });
    assert.throws(() => estornarMovMaterial(a.id, ''), /motivo/);
    const prod = db.tx((t) => lancarMovMaterial(t, { materialId: m.id, tipo: 'producao', quantidade: -2, refTipo: 'producao', refId: 'p1' }));
    assert.match(bloqueioEstornoMaterial(prod.id) ?? '', /estorne a produção/);
    assert.throws(() => estornarMovMaterial(prod.id, 'x'), /estorne a produção/);
    const ped = db.tx((t) => lancarMovMaterial(t, { materialId: m.id, tipo: 'pedido', quantidade: -1, refTipo: 'pedido', refId: 'x1' }));
    assert.throws(() => estornarMovMaterial(ped.id, 'x'), /pedido/);
    assert.equal(bloqueioEstornoMaterial(a.id), null);
    estornarMovMaterial(a.id, 'lançado errado');
    assert.equal(saldoMaterial(m.id), -3);
  });
});
