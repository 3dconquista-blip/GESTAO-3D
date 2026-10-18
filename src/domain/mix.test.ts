// Mix do parceiro (seção 8.3).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Acerto, AcertoItem, ItemMix, Produto } from '../data/types.ts';
import {
  erroMix,
  mesclarNoMix,
  nivelIdealSugerido,
  nivelSugeridoDoProduto,
  precoNoMix,
  produtosDoMixComPreco,
  vendasPorCiclo,
} from './mix.ts';

const base = { criadoEm: '2026-01-01T00:00:00.000Z', atualizadoEm: '2026-01-01T00:00:00.000Z' };

function produto(id: string, nome: string, preco: number, arquivado = false): Produto {
  return {
    ...base,
    id,
    nome,
    modelo: nome,
    cor: '',
    categoria: 'Chaveiro',
    codigo: id,
    precoEtiquetaCentavos: preco,
    estoqueMinimo: 0,
    maoDeObraMin: 2,
    mesas: [],
    componentes: [],
    origemModelo: 'proprio',
    arquivado,
  };
}

function item(produtoId: string, vendidos: number): AcertoItem {
  return {
    produtoId,
    esperado: 10,
    contei: 10 - vendidos,
    avariados: 0,
    recolhidos: 0,
    faltasAbonadas: 0,
    ajusteEntrada: 0,
    vendidos,
    precoUnitCentavos: 1500,
    valorCentavos: vendidos * 1500,
    repostos: vendidos,
    estoqueFinal: 10,
    custoUnit: 2.4873,
  };
}

function acerto(id: string, parceiroId: string, data: string, itens: AcertoItem[], situacao: Acerto['situacao'] = 'concluido'): Acerto {
  return {
    ...base,
    id,
    parceiroId,
    data,
    dataAnterior: data,
    pctParceiro: 30,
    brutoCentavos: 0,
    parteParceiroCentavos: 0,
    suaParteCentavos: 0,
    pixDiretoCentavos: 0,
    valorAcertoCentavos: 0,
    situacao,
    statusPagamento: 'pago',
    itens,
    proximoAcerto: data,
  };
}

describe('nível ideal sugerido (8.3): média por ciclo + 30%, mínimo 2', () => {
  it('arredonda para cima', () => {
    assert.equal(nivelIdealSugerido([6, 6, 6]), 8); // 7,8
    assert.equal(nivelIdealSugerido([3]), 4); // 3,9
    assert.equal(nivelIdealSugerido([5, 4]), 6); // 4,5 × 1,3 = 5,85
    assert.equal(nivelIdealSugerido([7, 1, 0]), 4); // 2,667 × 1,3 = 3,47
  });
  it('não sobe por ruído de ponto flutuante (10 × 1,3 = 13)', () => {
    assert.equal(nivelIdealSugerido([10]), 13);
    assert.equal(nivelIdealSugerido([20, 20]), 26);
  });
  it('mínimo de 2 por produto, também sem histórico', () => {
    assert.equal(nivelIdealSugerido([]), 2);
    assert.equal(nivelIdealSugerido([0, 0]), 2);
    assert.equal(nivelIdealSugerido([1]), 2); // 1,3 -> 2
    assert.equal(nivelIdealSugerido([0, 1]), 2);
  });
  it('ignora valores inválidos ou negativos', () => {
    assert.equal(nivelIdealSugerido([Number.NaN, 6]), 8);
    assert.equal(nivelIdealSugerido([-3, 6]), 4); // (0 + 6) ÷ 2 = 3 -> 3,9
  });
});

describe('vendas por ciclo', () => {
  const acertos = [
    acerto('a3', 'alfa', '2026-09-16', [item('kb', 4), item('an', 2)]),
    acerto('a1', 'alfa', '2026-08-16', [item('kb', 9)]),
    acerto('a2', 'alfa', '2026-09-01', [item('kb', 5)]),
    acerto('a4', 'alfa', '2026-10-01', [item('kb', 6), item('an', 3)]),
    acerto('x', 'alfa', '2026-10-05', [item('kb', 50)], 'estornado'),
    acerto('b1', 'beta', '2026-10-01', [item('kb', 40)]),
  ];
  it('últimos 3 acertos concluídos do parceiro, em ordem de data', () => {
    assert.deepEqual(vendasPorCiclo(acertos, 'alfa', 'kb'), [5, 4, 6]);
    assert.deepEqual(vendasPorCiclo(acertos, 'alfa', 'kb', 0), [9, 5, 4, 6]);
  });
  it('só ciclos em que o produto apareceu', () => {
    assert.deepEqual(vendasPorCiclo(acertos, 'alfa', 'an'), [2, 3]);
    assert.deepEqual(vendasPorCiclo(acertos, 'alfa', 'outro'), []);
  });
  it('sugestão a partir do histórico', () => {
    assert.equal(nivelSugeridoDoProduto(acertos, 'alfa', 'kb'), 7); // 5 × 1,3 = 6,5
    assert.equal(nivelSugeridoDoProduto(acertos, 'alfa', 'an'), 4); // 2,5 × 1,3 = 3,25
    assert.equal(nivelSugeridoDoProduto(acertos, 'alfa', 'outro'), 2);
  });
});

describe('preço no mix e linhas do mix', () => {
  const kb = produto('kb', 'Kettlebell Preto', 790);
  const an = produto('an', 'Anilha Vermelha', 1200, true);
  const mix: ItemMix[] = [
    { produtoId: 'kb', nivelIdeal: 10, precoEtiquetaCentavos: 1500 },
    { produtoId: 'an', nivelIdeal: 8 },
    { produtoId: 'sumiu', nivelIdeal: 1 },
  ];
  it('preço próprio do parceiro ou o padrão do produto', () => {
    assert.equal(precoNoMix(mix, kb), 1500);
    assert.equal(precoNoMix(mix, an), 1200);
    assert.equal(precoNoMix([], kb), 790);
  });
  it('produtosDoMixComPreco', () => {
    const linhas = produtosDoMixComPreco(mix, [kb, an]);
    assert.equal(linhas.length, 3);
    assert.deepEqual(
      linhas.map((l) => [l.nome, l.nivelIdeal, l.precoCentavos, l.precoPadraoCentavos, l.precoProprio, l.arquivado]),
      [
        ['Kettlebell Preto', 10, 1500, 790, true, false],
        ['Anilha Vermelha', 8, 1200, 1200, false, true],
        ['Produto removido', 1, 0, 0, false, false],
      ],
    );
  });
});

describe('validação do mix', () => {
  const nome = (id: string) => ({ kb: 'Kettlebell Preto', an: 'Anilha Vermelha' })[id] ?? 'produto';
  it('aceita mix válido', () => {
    assert.equal(erroMix([{ produtoId: 'kb', nivelIdeal: 0 }, { produtoId: 'an', nivelIdeal: 8, precoEtiquetaCentavos: 1200 }], nome), null);
  });
  it('nível ideal inteiro ≥ 0', () => {
    assert.match(erroMix([{ produtoId: 'kb', nivelIdeal: 2.5 }], nome)!, /Kettlebell Preto.*inteiro/);
    assert.match(erroMix([{ produtoId: 'kb', nivelIdeal: -1 }], nome)!, /inteiro/);
  });
  it('sem produto repetido', () => {
    const e = erroMix([{ produtoId: 'kb', nivelIdeal: 1 }, { produtoId: 'kb', nivelIdeal: 2 }], nome);
    assert.equal(e, 'O produto "Kettlebell Preto" aparece duas vezes no mix.');
  });
  it('preço próprio maior que zero', () => {
    assert.match(erroMix([{ produtoId: 'an', nivelIdeal: 1, precoEtiquetaCentavos: 0 }], nome)!, /maior que zero/);
    assert.match(erroMix([{ produtoId: 'an', nivelIdeal: 1, precoEtiquetaCentavos: 12.5 }], nome)!, /maior que zero/);
  });
});

describe('mesclar no mix', () => {
  it('inclui só produtos novos, com nível ideal = quantidade', () => {
    const mix: ItemMix[] = [{ produtoId: 'kb', nivelIdeal: 10, precoEtiquetaCentavos: 1500 }];
    const r = mesclarNoMix(mix, [
      { produtoId: 'kb', quantidade: 3 },
      { produtoId: 'an', quantidade: 8 },
      { produtoId: 'ht', quantidade: 0 },
    ]);
    assert.deepEqual(r.adicionados, ['an']);
    assert.deepEqual(r.mix, [
      { produtoId: 'kb', nivelIdeal: 10, precoEtiquetaCentavos: 1500 },
      { produtoId: 'an', nivelIdeal: 8 },
    ]);
    assert.equal(mix.length, 1, 'não altera a lista original');
  });
});
