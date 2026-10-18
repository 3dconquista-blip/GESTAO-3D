import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pagamento } from '../data/types.ts';
import { alertaMei, custosFixosNoPeriodo, dinheiroQueEntrou, mesesDoIntervalo, periodoDoMes, ratear, variacaoPct } from './relatorios.ts';
import { celulaCSV, centavosCSV, escaparCSV, nomeArquivoCSV, numeroCSV, paraCSV } from './csv.ts';

const pg = (p: Partial<Pagamento>): Pagamento =>
  ({ id: 'x', criadoEm: '', atualizadoEm: '', origem: 'pedido', refId: 'p1', direcao: 'recebido', valorCentavos: 0, forma: 'pix', data: '2026-10-10', ...p }) as Pagamento;

describe('relatórios — utilidades', () => {
  it('ratear divide com soma exata (maiores restos)', () => {
    assert.deepEqual(ratear(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(ratear(8820, [9000, 3600]), [6300, 2520]);
    assert.deepEqual(ratear(-100, [1, 1, 1]), [-34, -33, -33]);
    assert.deepEqual(ratear(10, [0, 0]), [5, 5]);
    assert.deepEqual(ratear(10, []), []);
  });

  it('meses e período do mês', () => {
    assert.deepEqual(periodoDoMes('2026-10'), { de: '2026-10-01', ate: '2026-10-31', rotulo: 'out/2026' });
    assert.deepEqual(mesesDoIntervalo({ de: '2026-09-16', ate: '2026-11-02' }), ['2026-09', '2026-10', '2026-11']);
  });

  it('custos fixos: mês inteiro cheio, quinzena proporcional aos dias', () => {
    assert.equal(custosFixosNoPeriodo({ de: '2026-10-01', ate: '2026-10-31' }, 8205), 8205);
    assert.equal(custosFixosNoPeriodo({ de: '2026-10-01', ate: '2026-10-15' }, 8205), 3970); // 8205 × 15 ÷ 31
    assert.equal(custosFixosNoPeriodo({ de: '2026-09-16', ate: '2026-10-31' }, 8205), 4103 + 8205); // 15 de 30 dias + outubro
  });

  it('variação: null quando o anterior é zero', () => {
    assert.equal(variacaoPct(150, 100), 50);
    assert.equal(variacaoPct(100, 0), null);
  });

  it('alerta do MEI: amarelo acima de 80%, vermelho acima do limite', () => {
    assert.equal(alertaMei(6_000_000, 8_100_000).nivel, 'ok');
    assert.equal(alertaMei(6_500_000, 8_100_000).nivel, 'atencao');
    assert.equal(alertaMei(8_200_000, 8_100_000).nivel, 'acima');
    assert.equal(alertaMei(8_200_000, 8_100_000).restanteCentavos, 0);
  });

  it('dinheiro que entrou: estorno desconta na data dele; devolução desconta; repasse fica à parte', () => {
    const pags = [
      pg({ id: 'a', valorCentavos: 5895, taxaCentavos: 0 }),
      pg({ id: 'b', valorCentavos: 3000, forma: 'cartao', taxaCentavos: 120, origem: 'venda', refId: 'v1' }),
      pg({ id: 'c', valorCentavos: 3000, direcao: 'pago', estornoDe: 'b', origem: 'venda', refId: 'v1', data: '2026-11-02' }),
      pg({ id: 'd', valorCentavos: 1000, direcao: 'pago', tipo: 'devolucao' }),
      pg({ id: 'e', valorCentavos: 700, direcao: 'pago', origem: 'acerto', refId: 'ac1' }),
    ];
    const out = dinheiroQueEntrou(pags, { de: '2026-10-01', ate: '2026-10-31' });
    assert.equal(out.recebidoCentavos, 8895);
    assert.equal(out.devolvidoCentavos, 1000);
    assert.equal(out.totalCentavos, 7895);
    assert.equal(out.pagoParceirosCentavos, 700);
    assert.equal(out.taxasCartaoCentavos, 120);
    const nov = dinheiroQueEntrou(pags, { de: '2026-11-01', ate: '2026-11-30' });
    assert.equal(nov.recebidoCentavos, -3000);
    assert.equal(nov.taxasCartaoCentavos, -120);
  });
});

describe('CSV para o Excel em português', () => {
  it('números com vírgula, centavos com 2 casas', () => {
    assert.equal(numeroCSV(1234.5), '1234,5');
    assert.equal(numeroCSV(88.2, 2), '88,20');
    assert.equal(numeroCSV(-0.00001, 2), '0,00');
    assert.equal(centavosCSV(8820), '88,20');
    assert.equal(centavosCSV(-150), '-1,50');
  });

  it('escapa ";", aspas e fórmulas', () => {
    assert.equal(escaparCSV('a;b'), '"a;b"');
    assert.equal(escaparCSV('diz "oi"'), '"diz ""oi"""');
    assert.equal(escaparCSV('x;"y"'), '"x;""y"""');
    assert.equal(escaparCSV('=SOMA(A1)'), "'=SOMA(A1)");
    assert.equal(celulaCSV('2026-10-16'), '16/10/2026');
    assert.equal(celulaCSV(true), 'Sim');
    assert.equal(celulaCSV(null), '');
  });

  it('paraCSV: BOM, cabeçalho, ";" e CRLF', () => {
    const t = paraCSV([{ n: 'Kettlebell', v: 1500 }], [
      { titulo: 'Produto', valor: (l) => l.n },
      { titulo: 'Preço (R$)', valor: (l) => l.v, tipo: 'centavos' },
    ]);
    assert.equal(t, '﻿Produto;Preço (R$)\r\nKettlebell;15,00\r\n');
    assert.equal(nomeArquivoCSV('Vendas por canal', '2026-10-16'), 'octa-vendas-por-canal-2026-10-16.csv');
  });
});
