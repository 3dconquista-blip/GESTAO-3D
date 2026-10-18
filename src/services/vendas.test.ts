// Venda rápida (seção 10) com o Kettlebell Preto do Exemplo A (custo 2,4873; cartão 4%).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa } from '../data/selectors.ts';
import { CASA } from '../data/types.ts';
import { lancarMov } from './estoque.ts';
import { calcularVenda, cancelarVenda, registrarVenda } from './vendas.ts';

let produtoId = '';
let anilhaId = '';

function exemploA(): void {
  db.tx((t) => {
    t.config((c) => ({
      ...c,
      custos: { ...c.custos, tarifaKwh: 1, valorHora: 25, taxaFalhaPct: 10, impostoPct: 0, margemDesejadaPct: 50, arredondamento: 'noventa', taxaCartaoPct: 4 },
    }));
    const imp = t.insert('impressoras', { nome: 'A1 mini', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, potenciaW: 80, manutencaoH: 0.1, ativa: true });
    const pla = t.insert('materiais', { tipo: 'filamento', nome: 'PLA Preto', material: 'PLA', unidade: 'g', custoMedio: 100, minimo: 250, taraCarretelG: 0, arquivado: false });
    const arg = t.insert('materiais', { tipo: 'insumo', nome: 'Argola', unidade: 'un', custoMedio: 0.3, minimo: 0, arquivado: false });
    const saq = t.insert('materiais', { tipo: 'insumo', nome: 'Saquinho', unidade: 'un', custoMedio: 0.1, minimo: 0, arquivado: false });
    const base = {
      modelo: 'Chaveiro', categoria: 'Chaveiro', estoqueMinimo: 0, maoDeObraMin: 2, origemModelo: 'proprio' as const, arquivado: false,
      mesas: [{ id: 'm1', pecasPorMesa: 8, tempoMin: 240, impressoraId: imp.id, filamentos: [{ materialId: pla.id, gramas: 64 }] }],
      componentes: [
        { materialId: arg.id, quantidade: 1 },
        { materialId: saq.id, quantidade: 1 },
      ],
    };
    produtoId = t.insert('produtos', { ...base, nome: 'Kettlebell Preto', cor: 'Preto', codigo: 'P-0001', precoEtiquetaCentavos: 1500 }).id;
    anilhaId = t.insert('produtos', { ...base, nome: 'Anilha Vermelha', cor: 'Vermelha', codigo: 'P-0002', precoEtiquetaCentavos: 790 }).id;
    lancarMov(t, { produtoId, quantidade: 10, origem: null, destino: CASA, tipo: 'producao' });
    lancarMov(t, { produtoId: anilhaId, quantidade: 10, origem: null, destino: CASA, tipo: 'producao' });
  });
}

beforeEach(() => {
  db.resetar();
  exemploA();
});

const dois = () => [{ produtoId, quantidade: 2, precoUnitCentavos: 1500 }];

describe('calcularVenda', () => {
  it('PIX: 2 × R$ 15,00 → total R$ 30,00, custo 4,9746, lucro R$ 25,03', () => {
    assert.equal(custoProduto(produtoId), 2.4873);
    const c = calcularVenda({ itens: dois(), forma: 'pix' });
    assert.equal(c.subtotalCentavos, 3000);
    assert.equal(c.descontoCentavos, 0);
    assert.equal(c.totalCentavos, 3000);
    assert.equal(c.taxaCentavos, 0);
    assert.equal(c.impostoCentavos, 0);
    assert.equal(c.custoTotal, 4.9746);
    assert.equal(c.lucroCentavos, 2503);
    assert.deepEqual(c.faltas, []);
    assert.equal(c.itens[0].custoUnit, 2.4873);
  });
  it('cartão 4%: taxa R$ 1,20, lucro R$ 23,83', () => {
    const c = calcularVenda({ itens: dois(), forma: 'cartao' });
    assert.equal(c.taxaCentavos, 120);
    assert.equal(c.lucroCentavos, 2383);
  });
  it('desconto 10% no cartão: total R$ 27,00, taxa R$ 1,08, lucro R$ 20,95', () => {
    const c = calcularVenda({ itens: dois(), forma: 'cartao', desconto: { tipo: 'pct', valor: 10 } });
    assert.equal(c.descontoCentavos, 300);
    assert.equal(c.totalCentavos, 2700);
    assert.equal(c.taxaCentavos, 108);
    assert.equal(c.lucroCentavos, 2095);
  });
  it('desconto % arredonda metade para cima; desconto em R$ nunca passa do subtotal', () => {
    const itens = [{ produtoId: anilhaId, quantidade: 3, precoUnitCentavos: 790 }];
    assert.equal(calcularVenda({ itens, forma: 'pix', desconto: { tipo: 'pct', valor: 15 } }).descontoCentavos, 356); // 355,5
    assert.equal(calcularVenda({ itens, forma: 'pix', desconto: { tipo: 'reais', valor: 500 } }).totalCentavos, 1870);
    const tudo = calcularVenda({ itens, forma: 'pix', desconto: { tipo: 'reais', valor: 99999 } });
    assert.equal(tudo.descontoCentavos, 2370);
    assert.equal(tudo.totalCentavos, 0);
    assert.throws(() => calcularVenda({ itens, forma: 'pix', desconto: { tipo: 'reais', valor: -1 } }), /negativo/);
  });
  it('imposto sobre o que você recebe (total − taxa)', () => {
    db.tx((t) => t.config((c) => ({ ...c, custos: { ...c.custos, impostoPct: 6 } })));
    const c = calcularVenda({ itens: dois(), forma: 'cartao', desconto: { tipo: 'pct', valor: 10 } });
    assert.equal(c.impostoCentavos, 156); // 6% de 25,92 = 1,5552
    assert.equal(c.lucroCentavos, 2700 - 108 - 156 - 497);
  });
  it('faltas em Casa (soma o mesmo produto em linhas diferentes)', () => {
    const c = calcularVenda({
      itens: [
        { produtoId, quantidade: 8, precoUnitCentavos: 1500 },
        { produtoId, quantidade: 4, precoUnitCentavos: 1200 },
      ],
      forma: 'pix',
    });
    assert.deepEqual(c.faltas, [{ produtoId, saldoCasa: 10, falta: 2 }]);
    assert.equal(c.subtotalCentavos, 8 * 1500 + 4 * 1200);
  });
  it('sem itens: tudo zero', () => {
    const c = calcularVenda({ itens: [], forma: 'pix' });
    assert.equal(c.totalCentavos, 0);
    assert.equal(c.lucroCentavos, 0);
  });
});

describe('registrarVenda e cancelarVenda', () => {
  it('grava a venda, tira de Casa (pode ficar negativo) e lança o pagamento', () => {
    const v = registrarVenda({
      itens: [
        { produtoId, quantidade: 12, precoUnitCentavos: 1500 },
        { produtoId: anilhaId, quantidade: 0, precoUnitCentavos: 790 },
      ],
      forma: 'cartao',
      canal: 'feira',
      data: '2026-10-12',
    });
    assert.equal(v.data, '2026-10-12');
    assert.equal(v.canal, 'feira');
    assert.equal(v.formaPagamento, 'cartao');
    assert.equal(v.clienteId, null);
    assert.equal(v.itens.length, 1);
    assert.deepEqual(v.itens[0], { produtoId, quantidade: 12, precoUnitCentavos: 1500, custoUnit: 2.4873 });
    assert.equal(v.subtotalCentavos, 18000);
    assert.equal(v.totalCentavos, 18000);
    assert.equal(v.taxaCentavos, 720);
    assert.equal(v.custoTotal, 29.8476);
    assert.equal(v.lucroCentavos, 18000 - 720 - 2985);
    assert.equal(saldoCasa(produtoId), -2);

    const mov = db.all('movEstoque').find((m) => m.refId === v.id);
    assert.equal(mov?.tipo, 'venda_direta');
    assert.equal(mov?.origem, CASA);
    assert.equal(mov?.destino, null);
    assert.equal(mov?.precoUnitCentavos, 1500);
    assert.equal(mov?.custoUnit, 2.4873);
    assert.equal(mov?.refTipo, 'venda');

    const [pag] = db.all('pagamentos');
    assert.equal(pag.origem, 'venda');
    assert.equal(pag.refId, v.id);
    assert.equal(pag.direcao, 'recebido');
    assert.equal(pag.valorCentavos, 18000);
    assert.equal(pag.taxaCentavos, 720);
    assert.equal(pag.forma, 'cartao');
    assert.equal(pag.tipo, 'venda');
    assert.equal(pag.data, '2026-10-12');
  });

  it('cliente opcional; validações', () => {
    const cli = db.tx((t) => t.insert('clientes', { nome: 'Marina', aceitaNovidades: false, arquivado: false }));
    const v = registrarVenda({ itens: dois(), forma: 'pix', canal: 'whatsapp', clienteId: cli.id });
    assert.equal(v.clienteId, cli.id);
    assert.equal(db.all('pagamentos')[0].clienteId, cli.id);
    assert.throws(() => registrarVenda({ itens: dois(), forma: 'pix', canal: 'presencial', clienteId: 'x' }), /Cliente/);
    assert.throws(() => registrarVenda({ itens: [], forma: 'pix', canal: 'presencial' }), /pelo menos um produto/);
    assert.throws(() => registrarVenda({ itens: [{ produtoId, quantidade: 1.5, precoUnitCentavos: 100 }], forma: 'pix', canal: 'presencial' }), /inteiro/);
    assert.throws(() => registrarVenda({ itens: dois(), forma: 'pix', canal: 'loja' as 'feira' }), /canal/);
    assert.equal(db.all('vendas').length, 1);
  });

  it('cancelar gera estorno do estoque e do pagamento; não cancela duas vezes', () => {
    const v = registrarVenda({ itens: dois(), forma: 'cartao', canal: 'presencial', data: '2026-10-12' });
    assert.equal(saldoCasa(produtoId), 8);
    const c = cancelarVenda(v.id, 'cliente desistiu', '2026-10-13');
    assert.equal(c.cancelada, true);
    assert.equal(c.canceladaEm, '2026-10-13');
    assert.equal(c.motivoCancelamento, 'cliente desistiu');
    assert.equal(saldoCasa(produtoId), 10);
    const est = db.all('movEstoque').find((m) => m.tipo === 'estorno');
    assert.equal(est?.refId, v.id);
    assert.equal(est?.destino, CASA);
    assert.equal(est?.data, '2026-10-13');
    const pags = db.all('pagamentos');
    assert.equal(pags.length, 2);
    const dev = pags.find((p) => p.estornoDe);
    assert.equal(dev?.direcao, 'pago');
    assert.equal(dev?.tipo, 'devolucao');
    assert.equal(dev?.valorCentavos, 3000);
    assert.equal(dev?.taxaCentavos, 120);
    assert.equal(dev?.estornoDe, pags.find((p) => !p.estornoDe)?.id);
    assert.throws(() => cancelarVenda(v.id, 'de novo'), /já foi cancelada/);
    assert.throws(() => cancelarVenda('x', 'motivo'), /não encontrada/);
  });

  it('cancelar exige motivo (nada muda sem ele)', () => {
    const v = registrarVenda({ itens: dois(), forma: 'pix', canal: 'presencial' });
    assert.throws(() => cancelarVenda(v.id, ''), /motivo/);
    assert.equal(db.get('vendas', v.id)?.cancelada, undefined);
    assert.equal(saldoCasa(produtoId), 8);
  });
});
