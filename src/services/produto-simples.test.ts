// Produto simples (decisão 107): custo por peça digitado (da Calculadora) e gramas por peça. O custo não é calculado
// pela ficha; a produção baixa as gramas do carretel e os pedidos usam o custo digitado.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { contextoCusto, custoProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import { composicaoCusto, gramasPorPeca, tempoPorPeca } from '../domain/pricing.ts';
import { carregarExemplo } from './exemplo.ts';
import { criarPedido } from './pedidos.ts';
import { registrarProducao } from './producao.ts';
import { salvarProduto } from './produtos.ts';

const simples = (extra: Record<string, unknown> = {}) =>
  salvarProduto({
    nome: 'Porta-copos',
    mesas: [{ pecasPorMesa: 1, tempoMin: 0, filamentos: [{ tipo: 'PLA', gramas: 20 }] }],
    componentes: [],
    custoInformado: 3.5,
    ...extra,
  });

describe('produto simples (custo da Calculadora)', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('o custo é o digitado; a ficha não precisa de impressora nem de tempo', () => {
    const p = simples();
    assert.equal(p.custoInformado, 3.5);
    assert.equal(custoProduto(p.id), 3.5);
    const comp = composicaoCusto(p, contextoCusto());
    assert.equal(comp.informado, true);
    assert.equal(comp.total, 3.5);
    assert.ok(p.precoEtiquetaCentavos > 350, 'preço sugerido sai do custo digitado');
    // Sem nenhuma impressora ativa continua valendo.
    db.tx((t) => {
      for (const i of t.all('impressoras')) t.update('impressoras', i.id, { ativa: false });
    });
    assert.equal(simples({ nome: 'Outro' }).custoInformado, 3.5);
    assert.throws(() => simples({ nome: 'Sem gramas', mesas: [{ pecasPorMesa: 1, tempoMin: 0, filamentos: [{ tipo: 'PLA', gramas: 0 }] }] }), /gramas de PLA por peça/);
    assert.throws(() => simples({ nome: 'Negativo', custoInformado: -1 }), /não pode ser negativo/);
  });

  it('a produção baixa as gramas por peça do carretel escolhido e grava o custo digitado', () => {
    const p = simples();
    const preto = db.all('materiais').find((m) => m.nome === 'PLA Preto')!;
    const antes = saldoMaterial(preto.id);
    const chave = `${p.mesas[0].id}:0`;
    const prod = registrarProducao({ produtoId: p.id, qtdBoa: 5, cores: { [chave]: preto.id } });
    assert.equal(saldoMaterial(preto.id), antes - 100);
    assert.equal(saldoCasa(p.id), 5);
    assert.equal(prod.custoUnit, 3.5);
  });

  it('pedido com o produto usa o custo digitado; null volta a calcular pela ficha', () => {
    const p = simples();
    const pedido = criarPedido({ clienteId: db.all('clientes')[0].id, titulo: 'Kit', itens: [{ tipo: 'catalogo', produtoId: p.id, quantidade: 4 }] });
    assert.equal(pedido.itens[0].custoUnit, 3.5);
    assert.equal(pedido.itens[0].custoTotal, 14);
    const impressora = db.all('impressoras')[0].id;
    const calculado = salvarProduto({ id: p.id, nome: p.nome, custoInformado: null, mesas: [{ pecasPorMesa: 1, tempoMin: 30, impressoraId: impressora, filamentos: [{ tipo: 'PLA', gramas: 20 }] }] });
    assert.equal(calculado.custoInformado, undefined);
    assert.notEqual(custoProduto(p.id), 3.5);
  });

  it('gramas e tempo por peça somam as mesas (Calculadora -> produto)', () => {
    const ficha = {
      mesas: [
        { id: 'a', pecasPorMesa: 8, tempoMin: 240, impressoraId: '', filamentos: [{ tipo: 'PLA' as const, gramas: 64 }] },
        { id: 'b', pecasPorMesa: 2, tempoMin: 60, impressoraId: '', filamentos: [{ tipo: 'PLA' as const, gramas: 10 }, { tipo: 'PETG' as const, gramas: 6 }] },
      ],
    };
    assert.equal(gramasPorPeca(ficha), 16); // 64/8 + 16/2
    assert.equal(tempoPorPeca(ficha), 60); // 240/8 + 60/2
  });
});

describe('cadastro rápido: sem gramas e com a quantidade em Casa (decisão 112)', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('salva sem gramas; a quantidade vira um ajuste "Estoque inicial" em Casa', () => {
    const p = simples({ nome: 'Vaso', mesas: [{ pecasPorMesa: 1, tempoMin: 0, filamentos: [] }], quantidadeInicial: 12 });
    assert.deepEqual(p.mesas[0].filamentos, []);
    assert.equal(saldoCasa(p.id), 12);
    const movs = db.all('movEstoque').filter((m) => m.produtoId === p.id);
    assert.equal(movs.length, 1);
    assert.equal(movs[0].tipo, 'ajuste');
    assert.equal(movs[0].motivo, 'Estoque inicial (cadastro)');
    assert.equal(movs[0].custoUnit, 3.5);
    // Sem custo digitado, a ficha continua exigindo o filamento.
    assert.throws(
      () => salvarProduto({ nome: 'Sem custo', mesas: [{ pecasPorMesa: 1, tempoMin: 30, filamentos: [] }], componentes: [] }),
      /pelo menos um filamento/,
    );
  });

  it('editar não lança estoque de novo; quantidade inválida não grava nada', () => {
    const p = simples({ nome: 'Vaso', quantidadeInicial: 3 });
    salvarProduto({ id: p.id, nome: 'Vaso grande', mesas: p.mesas, componentes: [], quantidadeInicial: 50 });
    assert.equal(saldoCasa(p.id), 3);
    const antes = db.all('produtos').length;
    assert.throws(() => simples({ nome: 'Errado', quantidadeInicial: 2.5 }), /quantidade em Casa/);
    assert.throws(() => simples({ nome: 'Errado', quantidadeInicial: -1 }), /quantidade em Casa/);
    assert.equal(db.all('produtos').length, antes);
  });

  it('a produção de um produto sem gramas não baixa filamento', () => {
    const p = simples({ nome: 'Vaso', mesas: [{ pecasPorMesa: 1, tempoMin: 0, filamentos: [] }] });
    const filamentos = db.all('materiais').filter((m) => m.tipo === 'filamento');
    const antes = filamentos.map((m) => saldoMaterial(m.id));
    registrarProducao({ produtoId: p.id, qtdBoa: 5 });
    assert.equal(saldoCasa(p.id), 5);
    assert.deepEqual(
      filamentos.map((m) => saldoMaterial(m.id)),
      antes,
    );
  });
});
