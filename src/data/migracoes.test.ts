// Registros antigos continuam abrindo: pedido gravado na etapa obsoleta 'aprovado' (antes de "Aprovado" e
// "Em produção" virarem uma etapa só) é lido como 'producao', no IndexedDB, no backup importado e na nuvem.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db, type Snapshot } from './db.ts';
import { migrarRegistro } from './migracoes.ts';
import { saldoMaterial } from './selectors.ts';
import type { Pedido, Produto } from './types.ts';
import { pedidosPorEtapa } from '../domain/pedidos.ts';
import { exportarBackup, importarBackup } from '../services/backup.ts';
import { carregarExemplo } from '../services/exemplo.ts';
import { moverEtapa } from '../services/pedidos.ts';

const material = (nome: string) => db.all('materiais').find((m) => m.nome === nome)!;

/** O pedido #0001 como uma versão antiga do app gravava: aprovado sem sinal, com o carretel (PLA Branco) no item. */
function pedidoAntigo(): Pedido {
  const p = db.all('pedidos').find((x) => x.numero === 1)!;
  return {
    ...p,
    etapa: 'aprovado',
    aprovadoEm: '2026-10-17',
    sinalDispensadoMotivo: 'Cliente antiga',
    itens: p.itens.map((i) => ({
      ...i,
      mesas: i.mesas?.map((m) => ({ ...m, filamentos: [{ materialId: material('PLA Branco').id, gramas: 120 }] })),
    })),
    historico: [...p.historico, { data: '2026-10-17', evento: 'Aprovado sem sinal: Cliente antiga' }],
    atualizadoEm: '2026-10-17T12:00:00.000Z',
  };
}

function snapshotComAntigo(): { snap: Snapshot; antigo: Pedido } {
  const antigo = pedidoAntigo();
  const snap = db.snapshot();
  snap.colecoes.pedidos = (snap.colecoes.pedidos as Pedido[]).map((p) => (p.id === antigo.id ? antigo : p));
  return { snap, antigo };
}

describe('migrarRegistro', () => {
  const pedido = { id: 'p1', criadoEm: '2026-10-16T12:00:00.000Z', atualizadoEm: '2026-10-17T12:00:00.000Z', etapa: 'aprovado' } as Pedido;

  it("pedido em 'aprovado' vira 'producao' sem mudar atualizadoEm nem o original", () => {
    const m = migrarRegistro('pedidos', pedido);
    assert.equal(m.etapa, 'producao');
    assert.equal(m.atualizadoEm, pedido.atualizadoEm);
    assert.equal(pedido.etapa, 'aprovado');
    assert.deepEqual(migrarRegistro('pedidos', m), m);
  });

  it('o resto volta igual (o mesmo objeto)', () => {
    const emProducao = { ...pedido, etapa: 'producao' } as Pedido;
    assert.equal(migrarRegistro('pedidos', emProducao), emProducao);
    const produto = { id: 'x', criadoEm: '', atualizadoEm: '', nome: 'Chaveiro' } as Produto;
    assert.equal(migrarRegistro('produtos', produto), produto);
  });
});

describe("pedido antigo em 'aprovado'", () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('carregado do aparelho: fica em Em produção, na coluna certa, e vai para Pronto sem aprovar de novo', () => {
    const { snap, antigo } = snapshotComAntigo();
    db.aplicarSnapshot(snap);
    const p = db.get('pedidos', antigo.id)!;
    assert.equal(p.etapa, 'producao');
    assert.equal(p.atualizadoEm, antigo.atualizadoEm);
    assert.deepEqual(pedidosPorEtapa(db.all('pedidos')).producao.map((x) => x.id), [antigo.id]);

    const branco = saldoMaterial(material('PLA Branco').id);
    const pagamentos = db.all('pagamentos').length;
    moverEtapa(antigo.id, 'pronto', { data: '2026-10-20' });
    const pronto = db.get('pedidos', antigo.id)!;
    assert.equal(pronto.etapa, 'pronto');
    assert.equal(db.all('pagamentos').length, pagamentos);
    assert.deepEqual(
      pronto.historico.slice(antigo.historico.length).map((h) => h.evento),
      ['Pronto. Materiais baixados: PLA Branco 120 g, Argola 20 un'],
    );
    assert.equal(saldoMaterial(material('PLA Branco').id), branco - 120);
  });

  it('backup importado com o pedido antigo também abre em Em produção', async () => {
    const { antigo } = snapshotComAntigo();
    const arquivo = JSON.parse(await exportarBackup());
    arquivo.colecoes.pedidos = arquivo.colecoes.pedidos.map((p: Pedido) => (p.id === antigo.id ? antigo : p));
    db.resetar();
    await importarBackup(JSON.stringify(arquivo));
    assert.equal(db.get('pedidos', antigo.id)?.etapa, 'producao');
    moverEtapa(antigo.id, 'pronto', { data: '2026-10-20' });
    assert.equal(db.get('pedidos', antigo.id)?.etapa, 'pronto');
  });

  it('vindo da nuvem (outro aparelho com versão antiga): lido como Em produção', () => {
    const antigo = pedidoAntigo();
    db.aplicarExternos([{ col: 'pedidos', id: antigo.id, rec: antigo }]);
    assert.equal(db.get('pedidos', antigo.id)?.etapa, 'producao');
    assert.equal(db.get('pedidos', antigo.id)?.atualizadoEm, antigo.atualizadoEm);
    assert.throws(() => moverEtapa(antigo.id, 'producao', {}), /já está em "Em produção"/);
  });
});
