// Critério de aceite da Etapa 4 (seção 15): Exemplo D de ponta a ponta sobre os dados de exemplo,
// mais etapas, pagamentos, cancelamento, duplicação, mensagens e a ficha do cliente.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import type { MesaFilamento } from '../data/types.ts';
import { mensagemOrcamento, mensagemPedidoPronto } from '../domain/mensagensPedido.ts';
import { alertasPedido, numeroPedido, orcamentoDoPedido, reservasCatalogo, resultadoPedido, situacaoFinanceira } from '../domain/pedidos.ts';
import { carregarExemplo, DATA_PEDIDO_D } from './exemplo.ts';
import {
  atualizarPedido,
  coresDoPedido,
  criarPedido,
  definirTotalManual,
  desfazerPagamentoPedido,
  duplicarOrcamento,
  moverEtapa,
  previewTotalManual,
  registrarPagamentoPedido,
  type ItemPedidoEntrada,
} from './pedidos.ts';
import { salvarMaterial } from './materiais.ts';
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

  it('aprovado e em produção com sinal → pronto (baixa na cor escolhida) → entregue com saldo', () => {
    const p = pedido1();
    const rosa = saldoMaterial(material('PLA Rosa').id);
    const branco = saldoMaterial(material('PLA Branco').id);
    const argolas = saldoMaterial(material('Argola').id);

    assert.throws(() => moverEtapa(p.id, 'producao', { data: '2026-10-17' }), /sinal/);
    moverEtapa(p.id, 'producao', { data: '2026-10-17', sinal: { valorCentavos: 5895, forma: 'pix' } });
    let fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.pagoCentavos, 5895);
    assert.equal(fin.saldoCentavos, 5895);
    assert.equal(pedido1().etapa, 'producao');
    assert.equal(pedido1().aprovadoEm, '2026-10-17');
    assert.equal(pedido1().producaoEm, '2026-10-17');
    assert.deepEqual(pedido1().historico.slice(1).map((h) => h.evento), ['Aprovado e em produção. Sinal recebido: R$ 58,95 (PIX)']);
    assert.throws(() => moverEtapa(p.id, 'aprovado', {}), /já está em "Em produção"/);

    const [item] = coresDoPedido(p.id);
    const [pos] = item.posicoes;
    assert.equal(item.descricao, 'Chaveiro com nome');
    assert.equal(pos.tipo, 'PLA');
    assert.equal(pos.padrao, material('PLA Branco').id); // o PLA com mais saldo
    assert.equal(pos.opcoes.length, 5);
    moverEtapa(p.id, 'pronto', { data: '2026-10-20', cores: { [item.itemId]: { [pos.chave]: material('PLA Rosa').id } } });
    assert.equal(saldoMaterial(material('PLA Rosa').id), rosa - 120);
    assert.equal(saldoMaterial(material('PLA Branco').id), branco);
    assert.equal(saldoMaterial(material('Argola').id), argolas - 20);
    assert.equal(pedido1().materiaisBaixados, true);
    assert.deepEqual(pedido1().itens[0].cores, { [pos.chave]: material('PLA Rosa').id });
    assert.equal(coresDoPedido(p.id)[0].posicoes[0].padrao, material('PLA Rosa').id);

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
    moverEtapa(p.id, 'producao', { sinal: { valorCentavos: 5895, forma: 'cartao' } });
    const r = moverEtapa(p.id, 'entregue', {});
    assert.match(r.avisos.join(' '), /R\$ 58,95 a receber/);
    const fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.aReceberCentavos, 5895);
    assert.equal(fin.taxasCartaoCentavos, 236); // 4% de 58,95 = 2,358
    assert.equal(resultadoPedido(pedido1(), pags()).lucroCentavos, 3906 - 236);
  });

  it('do orçamento direto para a entrega: aprova (dispensa o sinal) e passa por Pronto com a cor padrão', () => {
    const p = pedido1();
    const branco = saldoMaterial(material('PLA Branco').id);
    const totalPla = () => db.all('materiais').filter((m) => m.material === 'PLA').reduce((s, m) => s + saldoMaterial(m.id), 0);
    const pla = totalPla();
    moverEtapa(p.id, 'entregue', { data: '2026-10-21', dispensarSinalMotivo: 'Cliente antiga' });
    assert.equal(pedido1().etapa, 'entregue');
    assert.equal(totalPla(), pla - 120);
    assert.equal(saldoMaterial(material('PLA Branco').id), branco - 120);
    const eventos = pedido1().historico.map((h) => h.evento);
    assert.deepEqual(eventos.slice(1, 3), ['Aprovado e em produção sem sinal: Cliente antiga', 'Pronto. Materiais baixados: PLA Branco 120 g, Argola 20 un']);
    const movs = db.all('movMateriais').filter((m) => m.refId === p.id);
    assert.ok(movs.every((m) => db.get('materiais', m.materialId)), 'as baixas apontam para carretéis reais');
  });

  it('sem nenhum carretel do tipo, "Pronto" pede para cadastrar o filamento (nada muda)', () => {
    const p = pedido1();
    moverEtapa(p.id, 'producao', { dispensarSinalMotivo: 'Paga na entrega' });
    db.tx((t) => {
      for (const m of t.all('materiais')) if (m.material === 'PLA') t.update('materiais', m.id, { arquivado: true });
    });
    assert.throws(() => moverEtapa(p.id, 'pronto', {}), /Cadastre um filamento PLA \(em Estoque > Materiais\) para dar baixa no pedido/);
    assert.equal(pedido1().etapa, 'producao');
    assert.equal(pedido1().materiaisBaixados, false);
    const item = pedido1().itens[0];
    const chave = `${item.mesas![0].id}:0`;
    assert.throws(() => moverEtapa(p.id, 'pronto', { cores: { [item.id]: { [chave]: material('Argola').id } } }), /não é um filamento/);
    assert.throws(() => moverEtapa(p.id, 'pronto', { cores: { [item.id]: { outra: material('Argola').id } } }), /Cadastre um filamento PLA/);
  });

  it('gramas reais em "Pronto": baixa o informado e grava a cor usada no item', () => {
    const p = pedido1();
    moverEtapa(p.id, 'producao', { dispensarSinalMotivo: 'Teste' });
    const [item] = coresDoPedido(p.id);
    const chave = item.posicoes[0].chave;
    const rosa = material('PLA Rosa').id;
    const antes = saldoMaterial(rosa);
    moverEtapa(p.id, 'pronto', { cores: { [item.itemId]: { [chave]: rosa } }, gramasReais: { [item.itemId]: [{ materialId: rosa, gramas: 125 }] } });
    assert.equal(saldoMaterial(rosa), antes - 125);
    assert.deepEqual(pedido1().itens[0].cores, { [chave]: rosa });
  });

  it('desfazer pagamento: o estorno fica na data do próprio pagamento (não some de um mês e entra em outro)', () => {
    const p = pedido1();
    const { pagamento } = registrarPagamentoPedido({ pedidoId: p.id, valorCentavos: 5000, forma: 'pix', data: '2026-09-28', tipo: 'sinal' });
    const est = desfazerPagamentoPedido(pagamento.id);
    assert.equal(est.data, '2026-09-28');
    assert.equal(est.estornoDe, pagamento.id);
    assert.equal(situacaoFinanceira(pedido1(), pags()).pagoCentavos, 0);
    assert.throws(() => desfazerPagamentoPedido(pagamento.id), /já foi estornado/);
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
    moverEtapa(p.id, 'producao', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    const item = pedido1().itens[0];
    atualizarPedido(p.id, { itens: [{ ...item, quantidade: 40, mesas: item.mesas, componentes: item.componentes }] });
    const novo = pedido1();
    assert.ok(novo.totalCentavos > 11790);
    assert.equal(situacaoFinanceira(novo, pags()).pagoCentavos, 5895);
    assert.match(novo.historico.at(-1)!.evento, /^Valor alterado de R\$ 117,90 para/);
  });

  it('cancelar: motivo obrigatório e destino do sinal; devolver parte', () => {
    const p = pedido1();
    moverEtapa(p.id, 'producao', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    assert.throws(() => moverEtapa(p.id, 'cancelado', { destinoSinal: 'reter' }), /motivo/);
    assert.throws(() => moverEtapa(p.id, 'cancelado', { motivo: 'Desistiu' }), /destino/);
    moverEtapa(p.id, 'cancelado', { motivo: 'Desistiu', destinoSinal: 'devolver_parte', valorDevolvidoCentavos: 3000 });
    const fin = situacaoFinanceira(pedido1(), pags());
    assert.equal(fin.devolvidoCentavos, 3000);
    assert.equal(fin.pagoCentavos, 2895);
    assert.equal(pedido1().etapa, 'cancelado');
    assert.throws(() => moverEtapa(p.id, 'producao', {}));
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
    moverEtapa(p.id, 'producao', { data: '2026-10-17', dispensarSinalMotivo: 'Cliente antiga' });
    const tipos = (hoje: string) => alertasPedido(pedido1(), pags(), hoje).map((a) => a.tipo);
    assert.deepEqual(tipos('2026-10-28'), ['prazo', 'sem_sinal']);
    assert.deepEqual(tipos('2026-10-31'), ['atrasado', 'sem_sinal']);
  });

  it('itens de catálogo: reservados na aprovação, saem de Casa na entrega', () => {
    const marina = db.all('clientes')[0];
    const kb = db.all('produtos').find((x) => x.nome === 'Chaveiro Kettlebell')!;
    const casa = saldoCasa(kb.id);
    const p = criarPedido({ clienteId: marina.id, titulo: 'Kit academia', itens: [{ tipo: 'catalogo', produtoId: kb.id, quantidade: 5 }] });
    moverEtapa(p.id, 'aprovado', { dispensarSinalMotivo: 'Paga na entrega' }); // 'aprovado' (nome antigo) = Em produção
    assert.equal(db.get('pedidos', p.id)!.etapa, 'producao');
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
    moverEtapa(p.id, 'producao', { sinal: { valorCentavos: 5895, forma: 'pix' } });
    assert.match(mensagemPedidoPronto(pedido1(), cliente, db.config, pags()), /Saldo a pagar: R\$ 58,95/);
  });
});

describe('itens do pedido: custo, filamento por tipo e título automático', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  const marina = () => db.all('clientes')[0].id;
  const impressora = (nome: string) => db.all('impressoras').find((i) => i.nome === nome)!;
  const kettlebell = () => db.all('produtos').find((x) => x.nome === 'Chaveiro Kettlebell')!;
  const peca = (filamentos: MesaFilamento[], descricao?: string): ItemPedidoEntrada => ({
    tipo: 'personalizada',
    descricao,
    quantidade: 20,
    mesas: [{ pecasPorMesa: 20, tempoMin: 180, filamentos }],
    componentes: [{ materialId: material('Argola').id, quantidade: 1 }],
    maoDeObraMin: 2,
  });

  it('item de catálogo custa pela ficha do produto, com o filamento (Kettlebell: R$ 2,4873)', () => {
    const p = criarPedido({ clienteId: marina(), titulo: 'Kit academia', itens: [{ tipo: 'catalogo', produtoId: kettlebell().id, quantidade: 5 }] });
    assert.equal(custoProduto(kettlebell().id), 2.4873);
    assert.equal(p.itens[0].custoUnit, 2.4873);
    assert.equal(p.itens[0].custoTotal, 12.4367); // 2,48733… × 5, arredondado só no fim
  });

  it('peça personalizada pelo tipo do filamento; sem impressora vale a primeira ativa', () => {
    const p = criarPedido({ clienteId: marina(), titulo: 'Chaveiros', itens: [peca([{ tipo: 'PLA', gramas: 120 }], 'Chaveiro com nome')] });
    const mesa = p.itens[0].mesas![0];
    assert.equal(mesa.impressoraId, impressora('A1 (exemplo)').id);
    assert.deepEqual(mesa.filamentos, [{ tipo: 'PLA', gramas: 120 }]);
    assert.equal(p.itens[0].custoUnit, 1.9418); // igual ao Exemplo D: o PLA custa R$ 100,00/kg em todas as cores
    assert.throws(
      () => criarPedido({ clienteId: marina(), titulo: 'Vaso', itens: [peca([{ tipo: 'PETG', gramas: 30 }])] }),
      /Cadastre um filamento PETG \(com o custo do kg\) para orçar a peça\./,
    );
    assert.throws(() => criarPedido({ clienteId: marina(), titulo: 'Vaso', itens: [peca([{ gramas: 30 }])] }), /tipo de filamento/);
    salvarMaterial({ tipo: 'filamento', material: 'PETG', corNome: 'Preto', custoMedio: 120 });
    const vaso = criarPedido({ clienteId: marina(), titulo: 'Vaso', itens: [peca([{ tipo: 'PETG', gramas: 30 }])] });
    assert.ok(vaso.itens[0].custoUnit > 0);
  });

  it('item antigo, com o carretel gravado, continua custando e baixando por ele', () => {
    db.tx((t) => t.update('materiais', material('PLA Rosa').id, { custoMedio: 200 }));
    const porTipo = criarPedido({ clienteId: marina(), titulo: 'Por tipo', itens: [peca([{ tipo: 'PLA', gramas: 120 }])] });
    const antigo = criarPedido({ clienteId: marina(), titulo: 'Antigo', itens: [peca([{ materialId: material('PLA Rosa').id, gramas: 120 }])] });
    assert.deepEqual(antigo.itens[0].mesas![0].filamentos, [{ materialId: material('PLA Rosa').id, gramas: 120 }]);
    assert.ok(antigo.itens[0].custoUnit > porTipo.itens[0].custoUnit);
    assert.equal(coresDoPedido(antigo.id)[0].posicoes[0].padrao, material('PLA Rosa').id);
    const rosa = saldoMaterial(material('PLA Rosa').id);
    moverEtapa(antigo.id, 'pronto', { dispensarSinalMotivo: 'Teste' });
    assert.equal(saldoMaterial(material('PLA Rosa').id), rosa - 120);
  });

  it('título em branco: automático pelos itens; sem título nem descrição, pede o título', () => {
    const a = criarPedido({ clienteId: marina(), titulo: ' ', itens: [peca([{ tipo: 'PLA', gramas: 120 }], 'Chaveiro com nome')] });
    assert.equal(a.titulo, '20 × Chaveiro com nome');
    const b = criarPedido({ clienteId: marina(), titulo: '', itens: [{ tipo: 'catalogo', produtoId: kettlebell().id, quantidade: 1 }, peca([{ tipo: 'PLA', gramas: 120 }], 'Chaveiro com nome')] });
    assert.equal(b.titulo, 'Chaveiro Kettlebell + 1 item');
    const c = criarPedido({ clienteId: marina(), titulo: 'Turma de pilates', itens: [peca([{ tipo: 'PLA', gramas: 120 }])] });
    assert.equal(c.itens[0].descricao, 'Turma de pilates');
    assert.throws(() => criarPedido({ clienteId: marina(), titulo: '', itens: [peca([{ tipo: 'PLA', gramas: 120 }])] }), /Informe o título do pedido/);
    assert.equal(atualizarPedido(c.id, { titulo: '' }).titulo, '20 × Turma de pilates');
    assert.equal(atualizarPedido(a.id, { titulo: '', itens: [...a.itens, { tipo: 'catalogo', produtoId: kettlebell().id, quantidade: 2 }] }).titulo, '20 × Chaveiro com nome + 1 item');
  });

  it('título automático acompanha os itens ao editar; título digitado fica', () => {
    const a = criarPedido({ clienteId: marina(), titulo: '', itens: [peca([{ tipo: 'PLA', gramas: 120 }], 'Chaveiro com nome')] });
    assert.equal(a.tituloAuto, true);
    // O formulário pode mandar de volta o texto do título automático junto com os itens mudados.
    const mais: ItemPedidoEntrada = { ...peca([{ tipo: 'PLA', gramas: 180 }], 'Chaveiro com nome'), id: a.itens[0].id, quantidade: 30 };
    const b = atualizarPedido(a.id, { titulo: a.titulo, itens: [mais] });
    assert.equal(b.titulo, '30 × Chaveiro com nome');
    assert.equal(b.tituloAuto, true);
    assert.equal(duplicarOrcamento(a.id).tituloAuto, true);
    const c = atualizarPedido(a.id, { titulo: 'Turma de pilates' });
    assert.equal(c.titulo, 'Turma de pilates');
    assert.equal(c.tituloAuto, undefined);
    assert.equal(atualizarPedido(a.id, { itens: [{ ...mais, quantidade: 40 }] }).titulo, 'Turma de pilates');
  });

  it('peça sem descrição com título automático vira "Peça personalizada" (não herda o nome de outro item)', () => {
    const p = criarPedido({ clienteId: marina(), titulo: '', itens: [{ tipo: 'catalogo', produtoId: kettlebell().id, quantidade: 1 }, peca([{ tipo: 'PLA', gramas: 120 }])] });
    assert.equal(p.titulo, 'Chaveiro Kettlebell + 1 item');
    assert.equal(p.itens[1].descricao, 'Peça personalizada');
    // Refazer o título automático não troca o nome do item pelo da peça genérica.
    assert.equal(atualizarPedido(p.id, { prazo: '2026-11-30', titulo: '' }).titulo, 'Chaveiro Kettlebell + 1 item');
  });

  it('editar só o prazo não refaz os itens (mesmo sem carretel do tipo agora)', () => {
    const p = criarPedido({ clienteId: marina(), titulo: 'Chaveiros', itens: [peca([{ tipo: 'PLA', gramas: 120 }], 'Chaveiro com nome')] });
    db.tx((t) => {
      for (const m of t.all('materiais')) if (m.material === 'PLA') t.update('materiais', m.id, { arquivado: true });
    });
    const itens = p.itens.map((i): ItemPedidoEntrada => ({ ...i }));
    const e = atualizarPedido(p.id, { prazo: '2026-11-30', itens });
    assert.equal(e.prazo, '2026-11-30');
    assert.equal(e.itens[0].custoUnit, p.itens[0].custoUnit);
    // Mudar a peça refaz o item, e então ele precisa de um carretel do tipo.
    assert.throws(() => atualizarPedido(p.id, { itens: [{ ...itens[0], quantidade: 21 }] }), /Cadastre um filamento PLA/);
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
    moverEtapa(p.id, 'producao', { data: '2026-10-17', sinal: { valorCentavos: 5895, forma: 'pix' } });
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
