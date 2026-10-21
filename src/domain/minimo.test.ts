// Estoque mínimo automático (decisão 102): o que se vende direto em 15 dias, pela média dos últimos 30.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { minimoDoProduto } from '../data/selectors.ts';
import type { MovEstoque } from '../data/types.ts';
import { CASA } from '../data/types.ts';
import { carregarExemplo } from '../services/exemplo.ts';
import { oQueImprimirAtual } from '../services/consultas.ts';
import { cancelarVenda, registrarVenda } from '../services/vendas.ts';
import { minimoAutomatico, minimoEfetivo, vendasDiretasRecentes } from './minimo.ts';

const base = { criadoEm: '', atualizadoEm: '', custoUnit: 1 };
const mov = (id: string, data: string, quantidade: number, extra: Partial<MovEstoque> = {}): MovEstoque => ({
  ...base,
  id,
  data,
  produtoId: 'kb',
  quantidade,
  origem: CASA,
  destino: null,
  tipo: 'venda_direta',
  ...extra,
});

describe('mínimo automático (regra)', () => {
  it('soma as vendas diretas dos últimos 30 dias, sem as estornadas', () => {
    const movs = [
      mov('a', '2026-10-20', 4),
      mov('b', '2026-09-22', 2), // primeiro dia da janela (30 dias até 21/10)
      mov('c', '2026-09-21', 9), // fora da janela
      mov('d', '2026-10-10', 3),
      mov('e', '2026-10-10', 3, { tipo: 'estorno', origem: null, destino: CASA, estornoDe: 'd' }),
      mov('f', '2026-10-15', 5, { tipo: 'remessa', destino: 'p:alfa' }), // ida para parceiro não é venda direta
    ];
    assert.equal(vendasDiretasRecentes(movs, '2026-10-21').get('kb'), 6);
  });

  it('cobre 15 dias de venda (metade dos 30), arredondado para cima; o mínimo informado vence', () => {
    assert.deepEqual([0, 1, 6, 7].map(minimoAutomatico), [0, 1, 3, 4]);
    assert.deepEqual(minimoEfetivo({ estoqueMinimo: 10 }, 3), { minimo: 10, automatico: false });
    assert.deepEqual(minimoEfetivo({ estoqueMinimo: 0 }, 3), { minimo: 3, automatico: true });
  });
});

describe('mínimo automático no app', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('produto sem mínimo usa as vendas diretas; "O que imprimir" passa a considerar', () => {
    const halter = db.all('produtos').find((p) => p.nome === 'Chaveiro Halter')!;
    db.tx((t) => t.update('produtos', halter.id, { estoqueMinimo: 0 }));
    assert.deepEqual(minimoDoProduto(db.get('produtos', halter.id)!), { minimo: 0, automatico: true });
    const v = registrarVenda({ itens: [{ produtoId: halter.id, quantidade: 2, precoUnitCentavos: 1200 }], forma: 'pix' });
    assert.deepEqual(minimoDoProduto(db.get('produtos', halter.id)!), { minimo: 1, automatico: true });
    const item = oQueImprimirAtual().itens.find((i) => i.produtoId === halter.id);
    assert.equal(item?.estoqueMinimo, 1);
    cancelarVenda(v.id, 'teste');
    assert.equal(minimoDoProduto(db.get('produtos', halter.id)!).minimo, 0);
  });
});
