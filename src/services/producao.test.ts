// Exemplo G (seção 15): registrar 2 mesas de 8 Kettlebell Preto com 1 peça perdida, com os dados do Exemplo A.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import { CASA } from '../data/types.ts';
import { pecasPorMesas } from '../domain/consumo.ts';
import { lancarMov } from './estoque.ts';
import { comprarMaterial, salvarMaterial } from './materiais.ts';
import { coresDaProducao, estornarProducao, previaProducao, registrarProducao } from './producao.ts';
import { salvarProduto } from './produtos.ts';

interface Fixture {
  produtoId: string;
  pla: string;
  argola: string;
  saquinho: string;
}

/** Exemplo A: A1 mini R$ 2.000/4.000 h/R$ 0,10/h/80 W; PLA Preto R$ 100/kg com 1.000 g; argola R$ 0,30 ×100; saquinho R$ 0,10 ×100. */
function exemploA(): Fixture {
  const impId = db.tx((t) => {
    t.config((c) => ({
      ...c,
      custos: { ...c.custos, tarifaKwh: 1, valorHora: 25, taxaFalhaPct: 10, margemDesejadaPct: 50, arredondamento: 'noventa', taxaCartaoPct: 4 },
    }));
    return t.insert('impressoras', { nome: 'A1 mini', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, potenciaW: 80, manutencaoH: 0.1, ativa: true }).id;
  });
  const pla = salvarMaterial({ tipo: 'filamento', nome: 'PLA Preto', material: 'PLA', corNome: 'Preto' }).id;
  const argola = salvarMaterial({ tipo: 'insumo', nome: 'Argola' }).id;
  const saquinho = salvarMaterial({ tipo: 'insumo', nome: 'Saquinho' }).id;
  comprarMaterial({ materialId: pla, quantidade: 1, valorTotalCentavos: 10000, data: '2026-10-01' });
  comprarMaterial({ materialId: argola, quantidade: 100, valorTotalCentavos: 3000, data: '2026-10-01' });
  comprarMaterial({ materialId: saquinho, quantidade: 100, valorTotalCentavos: 1000, data: '2026-10-01' });
  const produtoId = db.tx((t) =>
    t.insert('produtos', {
      nome: 'Kettlebell Preto',
      modelo: 'Chaveiro Kettlebell',
      cor: 'Preto',
      categoria: 'Chaveiro',
      codigo: 'P-0001',
      precoEtiquetaCentavos: 1500,
      estoqueMinimo: 0,
      maoDeObraMin: 2,
      mesas: [{ id: 'm1', pecasPorMesa: 8, tempoMin: 240, impressoraId: impId, filamentos: [{ materialId: pla, gramas: 64 }] }],
      componentes: [
        { materialId: argola, quantidade: 1 },
        { materialId: saquinho, quantidade: 1 },
      ],
      origemModelo: 'proprio',
      arquivado: false,
    }),
  ).id;
  return { produtoId, pla, argola, saquinho };
}

let f: Fixture;
beforeEach(() => {
  db.resetar();
  f = exemploA();
});

describe('Exemplo G — produção', () => {
  it('fixture do Exemplo A: custo unitário 2,4873', () => {
    assert.equal(custoProduto(f.produtoId), 2.4873);
    assert.equal(db.get('materiais', f.pla)?.custoMedio, 100);
    assert.equal(db.get('materiais', f.argola)?.custoMedio, 0.3);
    assert.equal(db.get('materiais', f.saquinho)?.custoMedio, 0.1);
  });

  it('2 mesas de 8 com 1 perdida: 15 boas em Casa; PLA 1000 → 872 g; argolas e saquinhos 100 → 85', () => {
    const total = pecasPorMesas(2, 8);
    assert.equal(total, 16);
    const p = registrarProducao({ produtoId: f.produtoId, qtdBoa: total - 1, qtdPerdida: 1, data: '2026-10-05' });
    assert.equal(p.qtdBoa, 15);
    assert.equal(p.qtdPerdida, 1);
    assert.equal(p.custoUnit, 2.4873);
    assert.equal(p.data, '2026-10-05');
    assert.equal(saldoCasa(f.produtoId), 15);
    assert.equal(saldoMaterial(f.pla), 872);
    assert.equal(saldoMaterial(f.argola), 85);
    assert.equal(saldoMaterial(f.saquinho), 85);

    const [mov] = db.all('movEstoque');
    assert.equal(mov.tipo, 'producao');
    assert.equal(mov.origem, null);
    assert.equal(mov.destino, CASA);
    assert.equal(mov.quantidade, 15);
    assert.equal(mov.refTipo, 'producao');
    assert.equal(mov.refId, p.id);
    assert.equal(mov.custoUnit, 2.4873);

    const baixas = db.all('movMateriais').filter((m) => m.tipo === 'producao');
    assert.equal(baixas.length, 3);
    const pla = baixas.find((m) => m.materialId === f.pla);
    assert.equal(pla?.quantidade, -128);
    assert.equal(pla?.custoUnitSnapshot, 100);
    assert.equal(pla?.refId, p.id);
    assert.equal(baixas.find((m) => m.materialId === f.argola)?.quantidade, -15);
    assert.equal(baixas.find((m) => m.materialId === f.saquinho)?.quantidade, -15);
  });

  it('prévia para a confirmação', () => {
    const r = previaProducao({ produtoId: f.produtoId, qtdBoa: 15, qtdPerdida: 1 });
    assert.equal(r.entramEmCasa, 15);
    assert.equal(r.saldoCasaAntes, 0);
    assert.equal(r.saldoCasaDepois, 15);
    assert.equal(r.custoUnit, 2.4873);
    assert.equal(r.valorEntrada, 37.3095);
    assert.equal(r.faltaMaterial, false);
    assert.deepEqual(
      r.consumo.map((c) => [c.nome, c.unidade, c.quantidade, c.saldoAntes, c.saldoDepois, c.suficiente]),
      [
        ['PLA Preto', 'g', 128, 1000, 872, true],
        ['Argola', 'un', 15, 100, 85, true],
        ['Saquinho', 'un', 15, 100, 85, true],
      ],
    );
    assert.equal(db.all('producoes').length, 0); // não grava
  });

  it('gramas reais substituem o cálculo do filamento', () => {
    registrarProducao({ produtoId: f.produtoId, qtdBoa: 15, qtdPerdida: 1, gramasReais: [{ materialId: f.pla, gramas: 131 }] });
    assert.equal(saldoMaterial(f.pla), 869);
    assert.equal(saldoMaterial(f.argola), 85);
    assert.deepEqual(db.all('producoes')[0].gramasReais, [{ materialId: f.pla, gramas: 131 }]);
  });

  it('material pode ficar negativo (não bloqueia; a prévia avisa)', () => {
    const r = previaProducao({ produtoId: f.produtoId, qtdBoa: 120, qtdPerdida: 8 });
    assert.equal(r.faltaMaterial, true);
    assert.equal(r.consumo[0].saldoDepois, -24);
    assert.equal(r.consumo[0].suficiente, false);
    registrarProducao({ produtoId: f.produtoId, qtdBoa: 120, qtdPerdida: 8 });
    assert.equal(saldoMaterial(f.pla), -24);
    assert.equal(saldoMaterial(f.argola), -20);
    assert.equal(saldoCasa(f.produtoId), 120);
  });

  it('só perdidas: baixa filamento, não entra nada em Casa nem baixa componentes', () => {
    registrarProducao({ produtoId: f.produtoId, qtdBoa: 0, qtdPerdida: 8 });
    assert.equal(saldoCasa(f.produtoId), 0);
    assert.equal(db.all('movEstoque').length, 0);
    assert.equal(saldoMaterial(f.pla), 936);
    assert.equal(saldoMaterial(f.argola), 100);
  });

  it('validações', () => {
    assert.throws(() => registrarProducao({ produtoId: f.produtoId, qtdBoa: 0, qtdPerdida: 0 }), /quantas peças/);
    assert.throws(() => registrarProducao({ produtoId: f.produtoId, qtdBoa: 1.5 }), /inteiro/);
    assert.throws(() => registrarProducao({ produtoId: f.produtoId, qtdBoa: 2, qtdPerdida: -1 }), /inteiro/);
    assert.throws(() => registrarProducao({ produtoId: 'x', qtdBoa: 2 }), /não encontrado/);
    const semFicha = db.tx((t) =>
      t.insert('produtos', {
        nome: 'Sem ficha', modelo: '', cor: '', categoria: 'Outro', codigo: 'P-0002', precoEtiquetaCentavos: 0,
        estoqueMinimo: 0, maoDeObraMin: 2, mesas: [], componentes: [], origemModelo: 'proprio', arquivado: false,
      }),
    );
    assert.throws(() => registrarProducao({ produtoId: semFicha.id, qtdBoa: 2 }), /mesa/);
    assert.equal(db.all('producoes').length, 0);
    assert.equal(saldoMaterial(f.pla), 1000);
  });
});

describe('estornar produção', () => {
  it('devolve materiais, tira as peças de Casa e marca a produção', () => {
    const p = registrarProducao({ produtoId: f.produtoId, qtdBoa: 15, qtdPerdida: 1 });
    const e = estornarProducao(p.id, 'lancei duas vezes', '2026-10-06');
    assert.equal(e.estornada, true);
    assert.equal(saldoCasa(f.produtoId), 0);
    assert.equal(saldoMaterial(f.pla), 1000);
    assert.equal(saldoMaterial(f.argola), 100);
    assert.equal(saldoMaterial(f.saquinho), 100);
    const estornos = db.all('movMateriais').filter((m) => m.tipo === 'estorno');
    assert.equal(estornos.length, 3);
    assert.ok(estornos.every((m) => m.data === '2026-10-06' && m.refId === p.id && m.estornoDe));
    const est = db.all('movEstoque').find((m) => m.tipo === 'estorno');
    assert.equal(est?.origem, CASA);
    assert.equal(est?.destino, null);
    assert.throws(() => estornarProducao(p.id, 'de novo'), /já foi estornada/);
  });

  it('bloqueia se Casa não tem mais as peças (nada muda)', () => {
    const p = registrarProducao({ produtoId: f.produtoId, qtdBoa: 15, qtdPerdida: 1 });
    db.tx((t) =>
      lancarMov(t, { produtoId: f.produtoId, quantidade: 10, origem: CASA, destino: null, tipo: 'venda_direta', refTipo: 'venda', refId: 'v1' }),
    );
    assert.throws(() => estornarProducao(p.id, 'erro'), /há só 5/);
    assert.equal(db.get('producoes', p.id)?.estornada, undefined);
    assert.equal(saldoMaterial(f.pla), 872);
    assert.equal(saldoCasa(f.produtoId), 5);
  });

  it('exige motivo', () => {
    const p = registrarProducao({ produtoId: f.produtoId, qtdBoa: 8 });
    assert.throws(() => estornarProducao(p.id, ' '), /motivo/);
  });
});

describe('cor escolhida na produção (decisão 85)', () => {
  // Produto sem cor: a ficha diz só "64 g de PLA". Há PLA Preto (1.000 g, da fixture) e PLA Rosa (500 g).
  function semCor() {
    const rosa = salvarMaterial({ tipo: 'filamento', material: 'PLA', corNome: 'Rosa', custoMedio: 100, saldoInicial: 500 }).id;
    const imp = db.all('impressoras')[0].id;
    const p = salvarProduto({ nome: 'Chaveiro Kettlebell', mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: imp, filamentos: [{ tipo: 'PLA', gramas: 64 }] }] });
    return { rosa, produtoId: p.id, chave: `${p.mesas[0].id}:0` };
  }

  it('sem escolher, vale o carretel do tipo com mais saldo; depois, a última cor usada', () => {
    const s = semCor();
    const [pos] = coresDaProducao(s.produtoId);
    assert.equal(pos.padrao, f.pla);
    assert.deepEqual(pos.opcoes.map((m) => m.nome), ['PLA Preto', 'PLA Rosa']);
    registrarProducao({ produtoId: s.produtoId, qtdBoa: 8, cores: { [s.chave]: s.rosa } });
    assert.equal(coresDaProducao(s.produtoId)[0].padrao, s.rosa);
    // A última cor arquivada deixa de ser o padrão: volta o carretel ativo do tipo com mais saldo.
    db.tx((t) => t.update('materiais', s.rosa, { arquivado: true }));
    assert.equal(coresDaProducao(s.produtoId)[0].padrao, f.pla);
    assert.deepEqual(coresDaProducao(s.produtoId)[0].opcoes.map((m) => m.nome), ['PLA Preto']);
  });

  it('o filamento sai do carretel da cor escolhida e as peças entram num estoque só', () => {
    const s = semCor();
    registrarProducao({ produtoId: s.produtoId, qtdBoa: 8, cores: { [s.chave]: s.rosa } });
    registrarProducao({ produtoId: s.produtoId, qtdBoa: 8, cores: { [s.chave]: f.pla } });
    assert.equal(saldoMaterial(s.rosa), 500 - 64);
    assert.equal(saldoMaterial(f.pla), 1000 - 64);
    assert.equal(saldoCasa(s.produtoId), 16);
    const cores = db.all('producoes').filter((p) => p.produtoId === s.produtoId).map((p) => p.cores?.[s.chave]);
    assert.deepEqual(cores, [s.rosa, f.pla]);
  });

  it('estornar devolve o filamento ao carretel da cor usada', () => {
    const s = semCor();
    const p = registrarProducao({ produtoId: s.produtoId, qtdBoa: 8, cores: { [s.chave]: s.rosa } });
    estornarProducao(p.id, 'desfeito');
    assert.equal(saldoMaterial(s.rosa), 500);
    assert.equal(saldoCasa(s.produtoId), 0);
  });

  it('cor que não é filamento é recusada; tipo sem carretel pede para cadastrar', () => {
    const s = semCor();
    assert.throws(() => registrarProducao({ produtoId: s.produtoId, qtdBoa: 8, cores: { [s.chave]: f.argola } }), /não é um filamento/);
    const imp = db.all('impressoras')[0].id;
    const vaso = salvarProduto({ nome: 'Vaso', mesas: [{ pecasPorMesa: 1, tempoMin: 60, impressoraId: imp, filamentos: [{ tipo: 'PETG', gramas: 30 }] }] });
    assert.throws(() => registrarProducao({ produtoId: vaso.id, qtdBoa: 1 }), /Cadastre um filamento PETG/);
    assert.equal(saldoCasa(s.produtoId), 0);
  });
});
