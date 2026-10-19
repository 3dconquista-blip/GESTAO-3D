// Exemplo A da especificação: custo e preço do Chaveiro Kettlebell Preto.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configPadrao } from '../data/defaults.ts';
import type { Impressora, Material, Mesa, ParametrosCusto } from '../data/types.ts';
import { toCents, arredondarPreco, pctOfCents } from '../lib/money.ts';
import {
  composicaoCusto,
  custoHoraMaquina,
  custoUnitario,
  etiquetaSugerida,
  multiplicadorDireto,
  precoSugerido,
  simular,
  erroParametros,
  type ContextoCusto,
} from './pricing.ts';

const base = { criadoEm: '', atualizadoEm: '' };
const custos: ParametrosCusto = {
  ...configPadrao().custos,
  tarifaKwh: 1,
  valorHora: 25,
  taxaFalhaPct: 10,
  margemDesejadaPct: 50,
  arredondamento: 'noventa',
  taxaCartaoPct: 4,
};
const a1mini: Impressora = { ...base, id: 'imp', nome: 'A1 mini', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, potenciaW: 80, manutencaoH: 0.1, ativa: true };
const pla: Material = { ...base, id: 'pla', tipo: 'filamento', nome: 'PLA Preto', unidade: 'g', custoMedio: 100, minimo: 250, arquivado: false };
const argola: Material = { ...base, id: 'arg', tipo: 'insumo', nome: 'Argola', unidade: 'un', custoMedio: 0.3, minimo: 10, arquivado: false };
const saquinho: Material = { ...base, id: 'saq', tipo: 'insumo', nome: 'Saquinho', unidade: 'un', custoMedio: 0.1, minimo: 10, arquivado: false };
const mats = new Map([pla, argola, saquinho].map((m) => [m.id, m]));
const ctx: ContextoCusto = { custos, impressora: (id) => (id === 'imp' ? a1mini : undefined), material: (id) => mats.get(id) };
const mesa: Mesa = { id: 'm1', pecasPorMesa: 8, tempoMin: 240, impressoraId: 'imp', filamentos: [{ materialId: 'pla', gramas: 64 }] };
const ficha = { mesas: [mesa], componentes: [{ materialId: 'arg', quantidade: 1 }, { materialId: 'saq', quantidade: 1 }], maoDeObraMin: 2 };
const canais = configPadrao().canais;

describe('Exemplo A — custo', () => {
  it('custo hora máquina = 0,60', () => {
    assert.equal(custoHoraMaquina(a1mini), 0.6);
  });
  it('composição por peça', () => {
    const c = composicaoCusto(ficha, ctx);
    const imp = (6.4 + 0.32 + 2.4) * 1.1 / 8;
    assert.ok(Math.abs(c.impressao - imp) < 1e-9);
    assert.ok(Math.abs(c.impressao - 1.254) < 1e-9);
    assert.ok(Math.abs(c.componentes - 0.4) < 1e-9);
    assert.ok(Math.abs(c.maoDeObra - 0.833333333) < 1e-6);
  });
  it('custo unitário = 2,4873 (exibido R$ 2,49)', () => {
    const cu = custoUnitario(ficha, ctx);
    assert.equal(cu, 2.4873);
    assert.equal(toCents(cu), 249);
  });
});

describe('Exemplo A — preços sugeridos', () => {
  const cu = composicaoCusto(ficha, ctx).total;
  const esperado: Record<string, [number, number]> = {
    direto_pix: [4.9747, 590],
    direto_cartao: [5.1819, 590],
    parceiro_80_20: [6.2183, 690],
    parceiro_70_30: [7.1067, 790],
  };
  for (const [id, [exato, cents]] of Object.entries(esperado)) {
    it(`${id}: ${exato} -> ${cents}`, () => {
      const canal = canais.find((c) => c.id === id)!;
      const s = precoSugerido(cu, canal, custos);
      assert.ok(!('erro' in s));
      if ('erro' in s) return;
      assert.equal(Math.round(s.exato * 10000) / 10000, exato);
      assert.equal(s.centavos, cents);
    });
  }
  it('etiqueta sugerida R$ 7,90', () => {
    assert.equal(etiquetaSugerida(cu, canais, custos), 790);
  });
  it('multiplicador 2,0×', () => {
    assert.equal(multiplicadorDireto(custos), 2);
  });
});

describe('Exemplo A — simulador com etiqueta R$ 15,00', () => {
  const cu = custoUnitario(ficha, ctx);
  const s = simular(1500, cu, canais, custos);
  const tabela: Record<string, [number, number, number]> = {
    direto_pix: [1500, 1251, 83.4],
    direto_cartao: [1440, 1191, 82.7],
    parceiro_80_20: [1200, 951, 79.3],
    parceiro_70_30: [1050, 801, 76.3],
  };
  for (const [id, [rec, lucro, margem]] of Object.entries(tabela)) {
    it(id, () => {
      const l = s.linhas.find((x) => x.canal.id === id)!;
      assert.equal(toCents(l.recebido), rec);
      assert.equal(toCents(l.lucro), lucro);
      assert.equal(Math.round(l.margemPct * 10) / 10, margem);
      assert.equal(l.abaixoMinima, false);
    });
  }
  it('sem prejuízo', () => assert.deepEqual(s.perdeEm, []));
  it('prejuízo aparece com preço baixo', () => {
    const s2 = simular(300, cu, canais, custos);
    assert.ok(s2.perdeEm.includes('Parceiro 70/30'));
  });
});

describe('arredondamentos', () => {
  it(',90 sempre para cima', () => {
    assert.equal(arredondarPreco(4.97, 'noventa'), 590);
    assert.equal(arredondarPreco(5.9, 'noventa'), 590);
    assert.equal(arredondarPreco(117.67, 'noventa'), 11790);
    assert.equal(arredondarPreco(5.91, 'noventa'), 690);
    assert.equal(arredondarPreco(0.5, 'noventa'), 90);
    assert.equal(arredondarPreco(5.0000001, 'inteiro'), 600);
    assert.equal(arredondarPreco(5, 'inteiro'), 500);
    assert.equal(arredondarPreco(4.971, 'nenhum'), 498);
  });
  it('Exemplo E — 30% de R$ 14,95 = R$ 4,49', () => {
    assert.equal(pctOfCents(1495, 30), 449);
    assert.equal(1495 - pctOfCents(1495, 30), 1046);
  });
  it('bloqueia margem >= 100%', () => {
    assert.ok(erroParametros({ ...custos, margemDesejadaPct: 100 }));
    const canal = { ...canais[0], comissaoPct: 100 };
    const r = precoSugerido(2, canal, custos);
    assert.ok('erro' in r);
  });
});
