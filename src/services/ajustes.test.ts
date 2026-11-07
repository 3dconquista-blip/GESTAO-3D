// Ajuste de inventário, perda, estorno manual e valor parado em estoque (seção 7.2).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, precoNoParceiro, saldosEstoque, saldoCasa } from '../data/selectors.ts';
import { CASA } from '../data/types.ts';
import { round4 } from '../lib/money.ts';
import { carregarExemplo } from './exemplo.ts';
import { ajusteInventario, bloqueioEstornoManual, estornarMovimentoManual, registrarPerda, valorParadoEmEstoque } from './ajustes.ts';
import { registrarVenda } from './vendas.ts';

const kb = () => db.all('produtos').find((p) => p.nome === 'Chaveiro Kettlebell')!;

describe('ajustes de estoque', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('ajuste de entrada e de saída, com motivo obrigatório', () => {
    const base = saldoCasa(kb().id);
    ajusteInventario({ produtoId: kb().id, local: CASA, quantidade: 2, motivo: 'Contagem' });
    assert.equal(saldoCasa(kb().id), base + 2);
    ajusteInventario({ produtoId: kb().id, local: CASA, quantidade: -7, motivo: 'Contagem' });
    assert.equal(saldoCasa(kb().id), base - 5);
    assert.throws(() => ajusteInventario({ produtoId: kb().id, local: CASA, quantidade: -(base - 5 + 1), motivo: 'x' }));
    assert.throws(() => ajusteInventario({ produtoId: kb().id, local: CASA, quantidade: 1, motivo: ' ' }));
    assert.throws(() => ajusteInventario({ produtoId: kb().id, local: CASA, quantidade: 1.5, motivo: 'x' }));
  });

  it('perda sai pelo custo do momento e pode ser estornada uma vez', () => {
    const base = saldoCasa(kb().id);
    const mov = registrarPerda({ produtoId: kb().id, local: CASA, quantidade: 1, motivo: 'brinde' });
    assert.equal(mov.custoUnit, 2.4873);
    assert.equal(mov.motivo, 'Brinde');
    assert.equal(saldoCasa(kb().id), base - 1);
    assert.equal(bloqueioEstornoManual(mov.id), null);
    estornarMovimentoManual(mov.id, 'Lançado errado');
    assert.equal(saldoCasa(kb().id), base);
    assert.ok(bloqueioEstornoManual(mov.id));
    assert.throws(() => estornarMovimentoManual(mov.id, 'de novo'));
  });

  it('movimentos de produção e venda não são estornados por aqui', () => {
    const prod = db.all('movEstoque').find((m) => m.tipo === 'producao')!;
    assert.match(bloqueioEstornoManual(prod.id)!, /estorne a produção/);
    const venda = registrarVenda({ itens: [{ produtoId: kb().id, quantidade: 1, precoUnitCentavos: 1500 }], forma: 'pix', canal: 'presencial' });
    const mv = db.all('movEstoque').find((m) => m.refId === venda.id)!;
    assert.match(bloqueioEstornoManual(mv.id)!, /cancele a venda/);
  });

  it('valor parado em estoque (decisão 113): peças e preço de venda em Casa e nos parceiros, e o custo', () => {
    let casa = 0;
    let parceiros = 0;
    let pecasCasa = 0;
    let vendaCasa = 0;
    let vendaParceiros = 0;
    for (const [id, m] of saldosEstoque()) {
      for (const [local, q] of m) {
        if (q <= 0) continue;
        if (local === CASA) {
          casa += q * custoProduto(id);
          pecasCasa += q;
          vendaCasa += q * db.get('produtos', id)!.precoEtiquetaCentavos;
        } else {
          parceiros += q * custoProduto(id);
          vendaParceiros += q * precoNoParceiro(db.get('parceiros', local.slice(2))!, id);
        }
      }
    }
    const v = valorParadoEmEstoque();
    assert.equal(v.casa.custo, round4(casa));
    assert.equal(v.parceiros.custo, round4(parceiros));
    assert.equal(v.casa.pecas, pecasCasa);
    assert.equal(v.casa.vendaCentavos, vendaCasa);
    // Alfa (10 + 8 + 6) e Beta (12 Kettlebell Rosa + 3 Display PIX).
    assert.equal(v.parceiros.pecas, 39);
    assert.equal(v.parceiros.custo, round4(36 * 2.4873 + 3 * custoProduto(db.all('produtos').find((p) => p.nome === 'Display PIX')!.id)));
    assert.equal(v.parceiros.vendaCentavos, vendaParceiros);
    assert.ok(v.parceiros.vendaCentavos > v.parceiros.custo * 100, 'pelo preço de venda vale mais que a custo');

    // Nos parceiros vale o preço daquele parceiro (mix); mudar a etiqueta do produto não muda esse valor.
    const alfa = db.all('parceiros').find((p) => p.mix.some((m) => m.produtoId === kb().id && m.precoEtiquetaCentavos != null))!;
    const precoAlfa = alfa.mix.find((m) => m.produtoId === kb().id)!.precoEtiquetaCentavos;
    db.tx((t) => t.update('produtos', kb().id, { precoEtiquetaCentavos: kb().precoEtiquetaCentavos + 1000 }));
    const depois = valorParadoEmEstoque();
    assert.equal(depois.casa.vendaCentavos, vendaCasa + 1000 * saldoCasa(kb().id));
    assert.equal(depois.parceiros.vendaCentavos, v.parceiros.vendaCentavos, `preço do parceiro (${precoAlfa}) continua valendo`);
  });
});
