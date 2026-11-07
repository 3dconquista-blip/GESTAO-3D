// Etapa F: gastos avulsos no lucro (decisão 106) e o lembrete semanal de backup (decisão 105).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { lembreteBackup } from './backup.ts';
import { atalhosGasto, cancelarGasto, descricoesRecentes, gastosDoMes, lancarGasto, SUGESTOES_GASTO } from './gastos.ts';
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

describe('outros custos e despesas (decisão 111)', () => {
  beforeEach(() => db.resetar());

  it('total do mês: só o mês pedido, sem os desfeitos, do mais recente ao mais antigo', () => {
    const a = lancarGasto({ descricao: 'Entregador', valorCentavos: 1500, data: '2026-10-03' });
    const b = lancarGasto({ descricao: 'Gasolina', valorCentavos: 4000, data: '2026-10-20' });
    const c = lancarGasto({ descricao: 'Embalagem', valorCentavos: 900, data: '2026-10-25' });
    lancarGasto({ descricao: 'Gasolina', valorCentavos: 3000, data: '2026-11-02' });
    cancelarGasto(c.id);
    const m = gastosDoMes('2026-10-15');
    assert.equal(m.de, '2026-10-01');
    assert.equal(m.ate, '2026-10-31');
    assert.deepEqual(m.gastos.map((g) => g.id), [b.id, a.id]);
    assert.equal(m.totalCentavos, 5500);
    assert.equal(m.totalCentavos, resultadoDoPeriodo(OUTUBRO).gastosCentavos, 'o mesmo total que entra no lucro');
  });

  it('atalhos: os usados por último e, completando, entregador, gasolina...', () => {
    assert.deepEqual(atalhosGasto(), SUGESTOES_GASTO);
    lancarGasto({ descricao: 'Fita dupla face', valorCentavos: 800, data: '2026-10-01' });
    lancarGasto({ descricao: 'gasolina', valorCentavos: 3000, data: '2026-10-02' });
    assert.deepEqual(atalhosGasto(4), ['gasolina', 'Fita dupla face', 'Entregador', 'Embalagem']);
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
