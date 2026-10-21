// Etapa F: gastos avulsos no lucro (decisão 106) e o lembrete semanal de backup (decisão 105).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { lembreteBackup } from './backup.ts';
import { cancelarGasto, descricoesRecentes, lancarGasto } from './gastos.ts';
import { resultadoDoPeriodo } from './relatorios.ts';

const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31' };

describe('gastos avulsos', () => {
  beforeEach(() => db.resetar());

  it('lança com descrição e valor; entra no lucro do período e sai ao desfazer', () => {
    const antes = resultadoDoPeriodo(OUTUBRO).lucroCentavos;
    const g = lancarGasto({ descricao: '  Anúncio no Instagram ', valorCentavos: 2500, data: '2026-10-10' });
    lancarGasto({ descricao: 'Embalagens', valorCentavos: 1200, data: '2026-09-30' }); // fora do período
    assert.equal(g.descricao, 'Anúncio no Instagram');
    const r = resultadoDoPeriodo(OUTUBRO);
    assert.equal(r.gastosCentavos, 2500);
    assert.deepEqual(r.gastos.map((x) => x.id), [g.id]);
    assert.equal(r.lucroCentavos, antes - 2500);
    cancelarGasto(g.id);
    assert.equal(resultadoDoPeriodo(OUTUBRO).gastosCentavos, 0);
    assert.equal(resultadoDoPeriodo(OUTUBRO).lucroCentavos, antes);
    assert.equal(db.all('gastos').length, 2, 'o gasto desfeito continua guardado');
    assert.throws(() => cancelarGasto(g.id), /já foi desfeito/);
  });

  it('pede descrição e valor; as descrições recentes não se repetem', () => {
    assert.throws(() => lancarGasto({ descricao: ' ', valorCentavos: 100 }), /com o que foi/);
    assert.throws(() => lancarGasto({ descricao: 'Fita', valorCentavos: 0 }), /valor/);
    lancarGasto({ descricao: 'Fita', valorCentavos: 300, data: '2026-10-01' });
    lancarGasto({ descricao: 'Anúncio', valorCentavos: 500, data: '2026-10-05' });
    lancarGasto({ descricao: 'fita', valorCentavos: 300, data: '2026-10-07' });
    assert.deepEqual(descricoesRecentes(), ['fita', 'Anúncio']);
  });
});

describe('lembrete de backup', () => {
  const base = { hoje: '2026-10-21', temDados: true, nuvem: false, adiadoEm: null };
  it('sem backup, ou com 7 dias ou mais, lembra; com a nuvem ou sem dados, não', () => {
    assert.deepEqual(lembreteBackup({ ...base, ultimo: null }), { mostrar: true, dias: null });
    assert.deepEqual(lembreteBackup({ ...base, ultimo: '2026-10-18' }), { mostrar: false, dias: 3 });
    assert.deepEqual(lembreteBackup({ ...base, ultimo: '2026-10-14' }), { mostrar: true, dias: 7 });
    assert.equal(lembreteBackup({ ...base, ultimo: null, nuvem: true }).mostrar, false);
    assert.equal(lembreteBackup({ ...base, ultimo: null, temDados: false }).mostrar, false);
  });
  it('"Depois" esconde por 7 dias', () => {
    assert.equal(lembreteBackup({ ...base, ultimo: null, adiadoEm: '2026-10-20' }).mostrar, false);
    assert.equal(lembreteBackup({ ...base, ultimo: null, adiadoEm: '2026-10-14' }).mostrar, true);
  });
});
