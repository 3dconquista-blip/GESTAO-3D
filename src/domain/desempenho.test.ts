// Desempenho do parceiro (seção 8.9) e retorno do expositor (seção 8.2), com os números do Exemplo B.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Acerto, AcertoItem, Expositor, Parceiro } from '../data/types.ts';
import { pctOfCents } from '../lib/money.ts';
import { desempenhoParceiro, parceiroOndeMaisVende, porMesCentavos, rankingParceiros, retornoExpositor } from './desempenho.ts';

const base = { criadoEm: '2026-09-01T12:00:00.000Z', atualizadoEm: '2026-09-01T12:00:00.000Z' };

function parceiro(id: string, nome: string, over: Partial<Parceiro> = {}): Parceiro {
  return {
    ...base,
    id,
    nome,
    tipo: 'academia',
    responsavel: '',
    whatsapp: '',
    endereco: '',
    bairro: '',
    linkMapa: '',
    pctParceiro: 30,
    percentuais: [],
    frequenciaDias: 15,
    quemRecebe: 'parceiro',
    dataInicio: '2026-09-16',
    situacao: 'ativo',
    termoAssinado: true,
    mix: [],
    instaladoEm: '2026-09-16',
    arquivado: false,
    ...over,
  };
}

/** Linha do acerto: vendidos = esperado − contei − faltas; estoque final = contei − avariados − recolhidos + repostos. */
function item(produtoId: string, esperado: number, contei: number, preco: number, custoUnit: number, repostos: number, extra: Partial<AcertoItem> = {}): AcertoItem {
  const avariados = extra.avariados ?? 0;
  const recolhidos = extra.recolhidos ?? 0;
  const faltasAbonadas = extra.faltasAbonadas ?? 0;
  const vendidos = esperado - contei - faltasAbonadas;
  return {
    produtoId,
    esperado,
    contei,
    avariados,
    recolhidos,
    faltasAbonadas,
    ajusteEntrada: 0,
    vendidos,
    precoUnitCentavos: preco,
    valorCentavos: vendidos * preco,
    repostos,
    estoqueFinal: contei - avariados - recolhidos + repostos,
    custoUnit,
  };
}

function acerto(id: string, parceiroId: string, dataAnterior: string, data: string, pct: number, itens: AcertoItem[], over: Partial<Acerto> = {}): Acerto {
  const bruto = itens.reduce((s, i) => s + i.valorCentavos, 0);
  const parte = pctOfCents(bruto, pct);
  return {
    ...base,
    id,
    parceiroId,
    data,
    dataAnterior,
    pctParceiro: pct,
    brutoCentavos: bruto,
    parteParceiroCentavos: parte,
    suaParteCentavos: bruto - parte,
    pixDiretoCentavos: 0,
    valorAcertoCentavos: bruto - parte,
    situacao: 'concluido',
    statusPagamento: 'pago',
    itens,
    proximoAcerto: data,
    ...over,
  };
}

function expositor(id: string, parceiroId: string | null, custoCentavos: number): Expositor {
  return { ...base, id, codigo: id, modelo: 'Gancho', capacidade: 24, custoCentavos, parceiroId, estado: 'ok', arquivado: false };
}

// Exemplo B: Kettlebell Preto R$ 15,00, Anilha Vermelha R$ 12,00 e Halter Cinza R$ 12,00; 30% do parceiro.
const CU_KB = 2.4873;
const CU_AN = 2.5;
const CU_HA = 2.5;
const alfa = parceiro('alfa', 'Academia Alfa');
const beta = parceiro('beta', 'Loja Beta', { pctParceiro: 20, frequenciaDias: 30 });
// Acerto anterior (01/10/2026): deixou 10, 8 e 6. O Halter não vendeu nada.
const a1 = acerto('a1', 'alfa', '2026-09-16', '2026-10-01', 30, [
  item('kb', 10, 6, 1500, CU_KB, 4),
  item('an', 8, 6, 1200, CU_AN, 2),
  item('ha', 6, 6, 1200, CU_HA, 0),
]);
// Visita em 16/10/2026: contei 4, 5 e 6 -> vendidos 6, 3 e 0.
const a2 = acerto('a2', 'alfa', '2026-10-01', '2026-10-16', 30, [
  item('kb', 10, 4, 1500, CU_KB, 6),
  item('an', 8, 5, 1200, CU_AN, 3),
  item('ha', 6, 6, 1200, CU_HA, 0),
]);
// Loja Beta vende Halter: 2 em 30 dias.
const b1 = acerto('b1', 'beta', '2026-09-10', '2026-10-10', 20, [item('ha', 6, 4, 1200, CU_HA, 2)]);
const estornado = acerto('x', 'alfa', '2026-10-16', '2026-10-20', 30, [item('kb', 10, 0, 1500, CU_KB, 0)], { situacao: 'estornado' });
const acertos = [a2, b1, estornado, a1];
const expositores = [expositor('EXP-01', 'alfa', 8000), expositor('EXP-02', 'beta', 9000)];

describe('Exemplo B — desempenho do acerto', () => {
  const d = desempenhoParceiro({ parceiro: alfa, acertos, expositores, parceiros: [alfa, beta] });

  it('confere os valores do acerto (bruto R$ 126,00, sua parte R$ 88,20)', () => {
    assert.equal(a2.brutoCentavos, 12600);
    assert.equal(a2.parteParceiroCentavos, 3780);
    assert.equal(a2.suaParteCentavos, 8820);
  });
  it('histórico em ordem cronológica, sem acertos estornados', () => {
    assert.deepEqual(d.porAcerto.map((l) => l.acertoId), ['a1', 'a2']);
  });
  it('período de 15 dias, 9 peças, 0,60 peça/dia, giro 37,5%, sua parte por mês R$ 176,40', () => {
    const l = d.porAcerto[1];
    assert.equal(l.dias, 15);
    assert.equal(l.vendidos, 9);
    assert.equal(l.esperado, 24);
    assert.equal(l.mediaPorDia, 0.6);
    assert.equal(l.giroPct, 37.5);
    assert.equal(l.brutoCentavos, 12600);
    assert.equal(l.suaParteCentavos, 8820);
    assert.equal(l.suaPartePorMesCentavos, 17640);
  });
  it('totais do histórico', () => {
    assert.equal(d.totais.acertos, 2);
    assert.equal(d.totais.unidades, 15);
    assert.equal(d.totais.brutoCentavos, 8400 + 12600);
    assert.equal(d.totais.suaParteCentavos, 5880 + 8820);
    assert.equal(d.totais.dias, 30);
    assert.equal(d.totais.mediaPorDia, 0.5);
    assert.equal(d.totais.suaPartePorMesCentavos, 14700);
    assert.equal(d.totais.giroPct, (15 * 100) / 48);
  });
  it('filtro de período pela data do acerto', () => {
    const p = desempenhoParceiro({ parceiro: alfa, acertos, expositores, periodo: { de: '2026-10-02', ate: '2026-10-31' } });
    assert.deepEqual(p.porAcerto.map((l) => l.acertoId), ['a2']);
    assert.equal(p.totais.unidades, 9);
    assert.equal(p.totais.mediaPorDia, 0.6);
    assert.equal(p.totais.giroPct, 37.5);
    assert.equal(p.totais.suaPartePorMesCentavos, 17640);
    assert.deepEqual(p.maisVendidos, [
      { produtoId: 'kb', unidades: 6, brutoCentavos: 9000 },
      { produtoId: 'an', unidades: 3, brutoCentavos: 3600 },
    ]);
  });
  it('Halter Cinza com zero vendas no acerto anterior e neste: parado, sugerir a Loja Beta', () => {
    assert.deepEqual(d.itensParados, [{ produtoId: 'ha', estoque: 6, sugestaoParceiroId: 'beta' }]);
  });
  it('item recolhido (saldo atual 0) não aparece como parado', () => {
    const p = desempenhoParceiro({ parceiro: alfa, acertos, expositores, saldoAtual: () => 0 });
    assert.deepEqual(p.itensParados, []);
  });
  it('venda no acerto anterior: não é parado', () => {
    const a1b = acerto('a1', 'alfa', '2026-09-16', '2026-10-01', 30, [item('ha', 6, 5, 1200, CU_HA, 1)]);
    const p = desempenhoParceiro({ parceiro: alfa, acertos: [a1b, a2], expositores });
    assert.deepEqual(p.itensParados, []);
  });
  it('sem sugestão quando o produto não vende em outro parceiro ativo', () => {
    const p = desempenhoParceiro({ parceiro: alfa, acertos, expositores, parceiros: [alfa, { ...beta, situacao: 'pausado' }] });
    assert.equal(p.itensParados[0].sugestaoParceiroId, null);
  });
  it('baixo desempenho: sua parte por mês abaixo do limite nos 2 últimos acertos', () => {
    // Por mês: a1 = 58,80 × 2 = R$ 117,60; a2 = R$ 176,40.
    assert.equal(d.baixoDesempenho, false);
    assert.equal(desempenhoParceiro({ parceiro: alfa, acertos, expositores, limiteBaixoDesempenhoCentavos: 20000 }).baixoDesempenho, true);
    assert.equal(desempenhoParceiro({ parceiro: alfa, acertos, expositores, limiteBaixoDesempenhoCentavos: 15000 }).baixoDesempenho, false);
    // Um acerto só não basta.
    assert.equal(desempenhoParceiro({ parceiro: beta, acertos, expositores, limiteBaixoDesempenhoCentavos: 999999 }).baixoDesempenho, false);
  });
  it('retorno do expositor: lucro acumulado ÷ custo do expositor', () => {
    // Σ sua parte = 58,80 + 88,20 = 147,00. Custo vendido = 10 × 2,4873 + 5 × 2,50 = 37,373 -> R$ 37,37.
    assert.deepEqual(d.retornoExpositor, { lucroAcumuladoCentavos: 10963, custoExpositoresCentavos: 8000, retorno: 10963 / 8000 });
  });
});

describe('retornoExpositor', () => {
  it('desconta avarias e faltas abonadas pelo custo do momento', () => {
    const c = acerto('c1', 'beta', '2026-09-10', '2026-10-10', 20, [
      item('kr', 12, 5, 1500, 2, 8, { avariados: 1 }),
      item('dp', 3, 1, 3500, 10, 2, { faltasAbonadas: 1 }),
    ]);
    // Vendidos 7 e 1: bruto 140,00, parceiro 28,00, sua parte 112,00 (Exemplo C).
    assert.equal(c.brutoCentavos, 14000);
    assert.equal(c.suaParteCentavos, 11200);
    // Custo: (7 + 1) × 2,00 + (1 + 1) × 10,00 = 36,00.
    const r = retornoExpositor('beta', [c], [expositor('EXP-02', 'beta', 5000), expositor('EXP-03', null, 7000)]);
    assert.equal(r.lucroAcumuladoCentavos, 11200 - 3600);
    assert.equal(r.custoExpositoresCentavos, 5000);
    assert.equal(r.retorno, (11200 - 3600) / 5000);
  });
  it('sem expositor: retorno null', () => {
    assert.equal(retornoExpositor('alfa', [a1], []).retorno, null);
  });
});

describe('ranking e utilidades', () => {
  it('sua parte por mês = sua parte ÷ dias × 30 (metade para cima)', () => {
    assert.equal(porMesCentavos(8820, 15), 17640);
    assert.equal(porMesCentavos(1000, 7), 4286); // 4285,71…
    assert.equal(porMesCentavos(500, 0), 15000); // período de 0 dia conta como 1
  });
  it('ranking pelos últimos 3 acertos', () => {
    const r = rankingParceiros({ parceiros: [beta, alfa], acertos });
    assert.deepEqual(r.map((l) => l.parceiro.id), ['alfa', 'beta']);
    assert.equal(r[0].suaPartePorMesCentavos, 14700);
    assert.equal(r[1].suaPartePorMesCentavos, 1920);
  });
  it('ranking com janela de 1 acerto e com período', () => {
    assert.equal(rankingParceiros({ parceiros: [alfa], acertos, ultimos: 1 })[0].suaPartePorMesCentavos, 17640);
    const r = rankingParceiros({ parceiros: [alfa, beta], acertos, periodo: { de: '2026-10-02', ate: '2026-10-12' } });
    assert.deepEqual(r.map((l) => l.parceiro.id), ['beta']);
  });
  it('onde o produto vende mais', () => {
    assert.equal(parceiroOndeMaisVende('ha', acertos, 'alfa'), 'beta');
    assert.equal(parceiroOndeMaisVende('kb', acertos, null), 'alfa');
    assert.equal(parceiroOndeMaisVende('kb', acertos, 'alfa'), null);
  });
});
