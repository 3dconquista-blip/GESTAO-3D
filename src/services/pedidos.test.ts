// Critério de aceite da Etapa 4 (seção 15): Exemplo D de ponta a ponta sobre os dados de exemplo,
// mais etapas, pagamentos, cancelamento, duplicação, mensagens e a ficha do cliente.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { saldoCasa, saldoMaterial } from '../data/selectors.ts';
import { mensagemOrcamento, mensagemPedidoPronto } from '../domain/mensagensPedido.ts';
import { alertasPedido, numeroPedido, orcamentoDoPedido, reservasCatalogo, resultadoPedido, situacaoFinanceira } from '../domain/pedidos.ts';
import { carregarExemplo, DATA_PEDIDO_D } from './exemplo.ts';
import { atualizarPedido, criarPedido, definirTotalManual, duplicarOrcamento, moverEtapa, previewTotalManual, registrarPagamentoPedido } from './pedidos.ts';
import { estatisticasCliente, excluirDadosCliente, salvarCliente } from './clientes.ts';

const pedido1 = () => db.all('pedidos').find((p) => p.numero === 1)!;
const material = (nome: string) => db.all('materiais').find((m) => m.nome === nome)!;
const pags = () => db.all('pagamentos');

describe('Exemplo D — pedido personalizado #0001', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('orçamento do Exemplo D ao centavo', () => {
    const p = pedido1();
    assert.equal(numeroPedido(p.numero), '#0001');
    assert.equal(p.etapa, 'orcamento');
    assert.equal(p.itens[0].custoUnit, 1.9418);
    assert.equal(p.custoProducao, 38.8367);
    const o = orcamentoDoPedido(p);
    assert.equal(o.precoProducao, 77.6733);
    assert.equal(o.modelagem, 40);
    assert.equal(o.subtotal, 117.6733);
    assert.equal(p.totalCentavos, 11790);
    assert.equal(p.sinalCentavos, 5895);
    assert.equal(p.validade, '2026-10-23');
    const l = resultadoPedido(p, pags());
    assert.equal(l.lucroCentavos, 3906);
    assert.equal(Math.round(l.margemPct * 10) / 10, 33.1);
  });

  it('aprovado com sinal → produção → pronto (baixa materiais) → entregue com saldo', () => {
    const p = pedido1();
    const branco = saldoMaterial(material('PLA Branco').id);
    const argolas = saldoMaterial(material('Argola').id);

    assert.throws(() => moverEtapa(p.id, 'aprovado', { data: '2026-10-17' }), /sinal/);
    moverEtapa(p.id, 'aprovado', { data: '2026-10-17', sinal: { valorCentavos: 5895, forma: 'pix' } });
    let fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.pagoCentavos, 5895);
    assert.equal(fin.saldoCentavos, 5895);
    assert.equal(pedido1().aprovadoEm, '2026-10-17');

    moverEtapa(p.id, 'producao', { data: '2026-10-18' });
    moverEtapa(p.id, 'pronto', { data: '2026-10-20' });
    assert.equal(saldoMaterial(material('PLA Branco').id), branco - 120);
    assert.equal(saldoMaterial(material('Argola').id), argolas - 20);
    assert.equal(pedido1().materiaisBaixados, true);

    const r = moverEtapa(p.id, 'entregue', { data: '2026-10-21', pagamentoSaldo: { valorCentavos: 5895, forma: 'pix' } });
    assert.deepEqual(r.avisos, []);
    fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.saldoCentavos, 0);
    assert.equal(fin.pagoCentavos, 11790);
    const l = resultadoPedido(pedido1(), pags());
    assert.equal(l.lucroCentavos, 3906);
    assert.match(pedido1().historico.map((h) => h.evento).join(' | '), /Sinal recebido: R\$ 58,95/);
  });

  it('entregue sem pagar o saldo: fica "A receber"; cartão desconta a taxa do lucro', () => {
    const p = pedido1();
    moverEtapa(p.id, 'aprovado', { sinal: { valorCentavos: 5895, forma: 'cartao' } });
    const r = moverEtapa(p.id, 'entregue', {});
    assert.match(r.avisos.join(' '), /R\$ 58,95 a receber/);
    const fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.aReceberCentavos, 5895);
    assert.equal(fin.taxasCartaoCentavos, 236); // 4% de 58,95 = 2,358
    assert.equal(resultadoPedido(pedido1(), pags()).lucroCentavos, 3906 - 236);
  });

  it('valor final editável: mostra lucro e margem e grava no histórico', () => {
    const p = pedido1();
    const prev = previewTotalManual(p.id, 13000);
    assert.equal(prev.lucroCentavos, 13000 - 3884 - 4000);
    definirTotalManual(p.id, 13000);
    assert.equal(pedido1().totalCentavos, 13000);
    assert.equal(pedido1().sinalCentavos, 6500);
    assert.match(pedido1().historico.at(-1)!.evento, /Valor alterado de R\$ 117,90 para R\$ 130,00/);
  });

  it('mudar itens depois da aprovação recalcula o total, mantém os pagamentos e grava o histórico', () => {
    const p = pedido1();
    moverEtapa(p.id, 'aprovado', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    const item = pedido1().itens[0];
    atualizarPedido(p.id, { itens: [{ ...item, quantidade: 40, mesas: item.mesas, componentes: item.componentes }] });
    const novo = pedido1();
    assert.ok(novo.totalCentavos > 11790);
    assert.equal(situacaoFinanceira(novo, pags()).pagoCentavos, 5895);
    assert.match(novo.historico.at(-1)!.evento, /^Valor alterado de R\$ 117,90 para/);
  });

  it('cancelar: motivo obrigatório e destino do sinal; devolver parte', () => {
    const p = pedido1();
    moverEtapa(p.id, 'aprovado', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    assert.throws(() => moverEtapa(p.id, 'cancelado', { destinoSinal: 'reter' }), /motivo/);
    assert.throws(() => moverEtapa(p.id, 'cancelado', { motivo: 'Desistiu' }), /destino/);
    moverEtapa(p.id, 'cancelado', { motivo: 'Desistiu', destinoSinal: 'devolver_parte', valorDevolvidoCentavos: 3000 });
    const fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.devolvidoCentavos, 3000);
    assert.equal(fin.pagoCentavos, 2895);
    assert.equal(pedido1().etapa, 'cancelado');
    assert.throws(() => moverEtapa(p.id, 'aprovado', {}));
  });

  it('pagamento acima do total vira crédito do cliente', () => {
    const p = pedido1();
    registrarPagamentoPedido({ pedidoId: p.id, valorCentavos: 12000, forma: 'pix', tipo: 'parcela' });
    assert.equal(situacaoFinanceira(pedido1(), pags()).creditoCentavos, 210);
    assert.equal(estatisticasCliente(p.clienteId).creditoCentavos, 210);
  });

  it('duplicar orçamento recalcula com os custos atuais', () => {
    const p = pedido1();
    db.tx((t) => t.update('materiais', material('PLA Branco').id, { custoMedio: 200 }));
    const copia = duplicarOrcamento(p.id);
    assert.equal(copia.numero, 2);
    assert.equal(copia.etapa, 'orcamento');
    assert.ok(copia.custoProducao > p.custoProducao);
    assert.equal(pedido1().totalCentavos, 11790);
  });

  it('alertas: validade vencida, prazo próximo, atrasado e aprovado sem sinal', () => {
    const p = pedido1();
    assert.deepEqual(alertasPedido(p, pags(), '2026-10-20'), []);
    assert.equal(alertasPedido(p, pags(), '2026-10-24')[0].tipo, 'validade');
    moverEtapa(p.id, 'aprovado', { data: '2026-10-17', dispensarSinalMotivo: 'Cliente antiga' });
    const tipos = (hoje: string) => alertasPedido(pedido1(), pags(), hoje).map((a) => a.tipo);
    assert.deepEqual(tipos('2026-10-28'), ['prazo', 'sem_sinal']);
    assert.deepEqual(tipos('2026-10-31'), ['atrasado', 'sem_sinal']);
  });

  it('itens de catálogo: reservados na aprovação, saem de Casa na entrega', () => {
    const marina = db.all('clientes')[0];
    const kb = db.all('produtos').find((x) => x.nome === 'Chaveiro Kettlebell Preto')!;
    const casa = saldoCasa(kb.id);
    const p = criarPedido({ clienteId: marina.id, titulo: 'Kit academia', itens: [{ tipo: 'catalogo', produtoId: kb.id, quantidade: 5 }] });
    moverEtapa(p.id, 'aprovado', { dispensarSinalMotivo: 'Paga na entrega' });
    assert.equal(reservasCatalogo(db.all('pedidos')).get(kb.id), 5);
    assert.equal(saldoCasa(kb.id), casa);
    moverEtapa(p.id, 'entregue', { pagamentoSaldo: { valorCentavos: db.get('pedidos', p.id)!.totalCentavos, forma: 'dinheiro' } });
    assert.equal(saldoCasa(kb.id), casa - 5);
    assert.equal(reservasCatalogo(db.all('pedidos')).get(kb.id), undefined);
  });

  it('mensagens: orçamento com itens, sinal, validade e política; pronto com saldo', () => {
    const p = pedido1();
    const cliente = db.get('clientes', p.clienteId);
    const msg = mensagemOrcamento(p, cliente, db.config);
    assert.match(msg, /Olá, Marina! Segue o orçamento do pedido #0001 — 20 chaveiros com nome:/);
    assert.match(msg, /• 20 × Chaveiro com nome/);
    assert.match(msg, /Total: R\$ 117,90/);
    assert.match(msg, /Sinal para começar \(50%\): R\$ 58,95/);
    assert.match(msg, /Orçamento válido até 23\/10\/2026/);
    assert.match(msg, /Cancelamento:/);
    assert.ok(!msg.includes('Frete'));
    moverEtapa(p.id, 'aprovado', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    assert.match(mensagemPedidoPronto(pedido1(), cliente, db.config, pags()), /Saldo a pagar: R\$ 58,95/);
  });
});

describe('clientes', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('só o nome é obrigatório; WhatsApp guardado com 55 + DDD', () => {
    assert.throws(() => salvarCliente({ nome: ' ' }));
    const c = salvarCliente({ nome: 'João', whatsapp: '(71) 98765-4321' });
    assert.equal(c.whatsapp, '5571987654321');
    assert.equal(c.aceitaNovidades, false);
    assert.throws(() => salvarCliente({ nome: 'X', whatsapp: '123' }));
  });

  it('ficha: compras, total gasto, ticket médio; excluir dados mantém os totais (LGPD)', () => {
    const p = pedido1();
    moverEtapa(p.id, 'aprovado', { data: '2026-10-17', sinal: { valorCentavos: 5895, forma: 'pix' } });
    moverEtapa(p.id, 'entregue', { data: '2026-10-21', pagamentoSaldo: { valorCentavos: 5895, forma: 'pix' } });
    let e = estatisticasCliente(p.clienteId);
    assert.deepEqual([e.pedidos, e.compras, e.totalGastoCentavos, e.ticketMedioCentavos, e.ultimaCompra], [1, 1, 11790, 11790, '2026-10-21']);
    const anon = excluirDadosCliente(p.clienteId);
    assert.match(anon.nome, /^Cliente removido/);
    assert.equal(anon.whatsapp, undefined);
    assert.equal(anon.cidade, undefined);
    assert.equal(anon.anonimizado, true);
    e = estatisticasCliente(p.clienteId);
    assert.equal(e.totalGastoCentavos, 11790);
    assert.equal(DATA_PEDIDO_D, '2026-10-16');
  });
});
