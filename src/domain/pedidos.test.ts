// Exemplo D da especificação (pedido personalizado) e regras puras dos pedidos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configPadrao } from '../data/defaults.ts';
import type { Impressora, Material, Pagamento, ParametrosCusto, Pedido, PedidoItem, Venda } from '../data/types.ts';
import { round4, toCents } from '../lib/money.ts';
import type { ContextoCusto } from './pricing.ts';
import {
  ETAPAS,
  ETAPAS_FLUXO,
  alertasPedido,
  calcularOrcamento,
  custoItem,
  descontoQtdSugerido,
  emProducao,
  estatisticasDoCliente,
  etapaNoFluxo,
  faltasCatalogo,
  lucroPedido,
  numeroPedido,
  orcamentoDoPedido,
  pedidosPorEtapa,
  podeMover,
  proximaEtapa,
  reservasCatalogo,
  resultadoPedido,
  situacaoFinanceira,
  tituloAutomatico,
  type EntradaOrcamento,
} from './pedidos.ts';

const base = { criadoEm: '', atualizadoEm: '' };
const custos: ParametrosCusto = {
  ...configPadrao().custos,
  tarifaKwh: 1,
  valorHora: 25,
  taxaFalhaPct: 10,
  margemDesejadaPct: 50,
  arredondamento: 'noventa',
};
const a1: Impressora = { ...base, id: 'a1', nome: 'A1', modelo: 'A1', valorPago: 3500, vidaUtilH: 5000, potenciaW: 100, manutencaoH: 0.1, ativa: true };
const plaBranco: Material = { ...base, id: 'plab', tipo: 'filamento', nome: 'PLA Branco', unidade: 'g', custoMedio: 100, minimo: 250, arquivado: false };
const argola: Material = { ...base, id: 'arg', tipo: 'insumo', nome: 'Argola', unidade: 'un', custoMedio: 0.3, minimo: 10, arquivado: false };
const mats = new Map([plaBranco, argola].map((m) => [m.id, m]));
const ctx: ContextoCusto = { custos, impressora: (id) => (id === 'a1' ? a1 : undefined), material: (id) => mats.get(id) };

const itemD: PedidoItem = {
  id: 'i1',
  tipo: 'personalizada',
  descricao: 'Chaveiro com nome',
  quantidade: 20,
  mesas: [{ id: 'm1', pecasPorMesa: 20, tempoMin: 180, impressoraId: 'a1', filamentos: [{ materialId: 'plab', gramas: 120 }] }],
  componentes: [{ materialId: 'arg', quantidade: 1 }],
  maoDeObraMin: 2,
  custoUnit: 0,
  custoTotal: 0,
};

const entradaD = (custosItens: number[]): EntradaOrcamento => ({
  custosItens,
  horasModelagem: 1,
  valorHoraModelagem: 40,
  margemPct: 50,
  urgente: false,
  urgenciaPct: 20,
  descontoPct: 0,
  pedidoMinimoCentavos: 3000,
  freteCentavos: 0,
  sinalPct: 50,
  arredondamento: 'noventa',
});

const perto = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    ...base,
    id: 'p1',
    numero: 1,
    clienteId: 'c1',
    titulo: '20 chaveiros com nome',
    referencias: [],
    itens: [{ ...itemD, custoUnit: 1.9418, custoTotal: 38.8367 }],
    entrega: { tipo: 'retirada', freteCentavos: 0 },
    canalOrigem: 'whatsapp',
    etapa: 'orcamento',
    horasModelagem: 1,
    urgente: false,
    urgenciaPct: 20,
    descontoPct: 0,
    sinalPct: 50,
    pedidoMinimoCentavos: 3000,
    margemPct: 50,
    valorHoraModelagem: 40,
    arredondamento: 'noventa',
    custoProducao: 38.8367,
    modelagemValor: 40,
    totalCalculadoCentavos: 11790,
    totalCentavos: 11790,
    sinalCentavos: 5895,
    validade: '2026-10-23',
    checklist: { modeloAprovado: false, impresso: false, acabamento: false },
    historico: [],
    ...over,
  };
}

function pagamento(over: Partial<Pagamento>): Pagamento {
  return { ...base, id: 'pg' + Math.random(), origem: 'pedido', refId: 'p1', direcao: 'recebido', valorCentavos: 0, forma: 'pix', data: '2026-10-16', ...over };
}

describe('Exemplo D — custo da peça personalizada', () => {
  const c = custoItem(itemD, ctx);
  it('composição do item (20 peças)', () => {
    perto(c.composicao.material, 12);
    perto(c.composicao.energia, 0.3);
    perto(c.composicao.maquina, 2.4);
    perto(c.composicao.impressao, 16.17);
    perto(c.composicao.componentes, 6);
    assert.equal(round4(c.composicao.maoDeObra), 16.6667);
  });
  it('custo de produção = 38,8367 (sem arredondar a peça antes de multiplicar)', () => {
    assert.equal(c.custoTotal, 38.8367);
    assert.equal(c.custoUnit, 1.9418);
    perto(c.custoTotalExato, 38.836666666, 1e-8);
    assert.deepEqual(c.avisos, []);
  });
  it('item de catálogo usa a ficha do produto', () => {
    const produto = {
      ...base,
      id: 'prod',
      nome: 'Chaveiro',
      modelo: 'Chaveiro',
      cor: 'Branco',
      categoria: 'Chaveiro',
      codigo: 'P-0001',
      precoEtiquetaCentavos: 790,
      estoqueMinimo: 0,
      maoDeObraMin: 2,
      mesas: itemD.mesas!,
      componentes: itemD.componentes!,
      origemModelo: 'proprio' as const,
      arquivado: false,
    };
    const cat = custoItem({ tipo: 'catalogo', quantidade: 20 }, ctx, produto);
    assert.equal(cat.custoTotal, 38.8367);
    assert.ok(custoItem({ tipo: 'catalogo', quantidade: 1 }, ctx).avisos.length > 0);
  });
});

describe('Exemplo D — orçamento', () => {
  const c = custoItem(itemD, ctx);
  const o = calcularOrcamento(entradaD([c.custoTotalExato]));
  it('preço de produção, modelagem e subtotal', () => {
    assert.equal(o.custoProducao, 38.8367);
    assert.equal(o.precoProducao, 77.6733);
    assert.equal(o.modelagem, 40);
    assert.equal(o.subtotal, 117.6733);
    assert.equal(o.pedidoMinimoAplicado, false);
    assert.equal(o.erro, undefined);
  });
  it('total R$ 117,90, sinal R$ 58,95', () => {
    assert.equal(o.totalSemFreteCentavos, 11790);
    assert.equal(o.totalCentavos, 11790);
    assert.equal(o.sinalCentavos, 5895);
    assert.equal(o.totalCentavos - o.sinalCentavos, 5895);
  });
  it('com os custos gravados (4 casas) o total é o mesmo', () => {
    const g = orcamentoDoPedido(pedido());
    assert.equal(g.totalCentavos, 11790);
    assert.equal(toCents(g.precoProducao), 7767);
  });
  it('lucro R$ 39,06 (33,1% do total)', () => {
    const l = lucroPedido({ totalCentavos: 11790, freteCentavos: 0, taxasCartaoCentavos: 0, custoProducao: 38.8367, modelagem: 40 });
    assert.equal(l.lucroCentavos, 3906);
    assert.equal(Math.round(l.margemPct * 10) / 10, 33.1);
  });
});

describe('orçamento — regras', () => {
  it('frete soma depois do arredondamento e entra no sinal', () => {
    const o = calcularOrcamento({ ...entradaD([38.8367]), freteCentavos: 1500 });
    assert.equal(o.totalSemFreteCentavos, 11790);
    assert.equal(o.totalCentavos, 13290);
    assert.equal(o.sinalCentavos, 6645);
  });
  it('urgência e desconto', () => {
    const urg = calcularOrcamento({ ...entradaD([38.8367]), urgente: true });
    assert.equal(urg.subtotalAjustado, round4(117.6734 * 1.2));
    assert.equal(urg.totalSemFreteCentavos, 14190); // 141,21 -> 141,90
    const desc = calcularOrcamento({ ...entradaD([38.8367]), descontoPct: 10 });
    assert.equal(desc.totalSemFreteCentavos, 10690); // 105,91 -> 106,90
    const naoUrgente = calcularOrcamento({ ...entradaD([38.8367]), urgente: false, urgenciaPct: 50 });
    assert.equal(naoUrgente.totalSemFreteCentavos, 11790);
  });
  it('pedido mínimo (arredondado como o resto do total)', () => {
    const o = calcularOrcamento({ ...entradaD([2]), horasModelagem: 0 });
    assert.equal(o.pedidoMinimoAplicado, true);
    assert.equal(o.totalSemFreteCentavos, 3090);
    assert.equal(calcularOrcamento({ ...entradaD([2]), horasModelagem: 0, arredondamento: 'nenhum' }).totalCentavos, 3000);
  });
  it('bloqueia margem >= 100%', () => {
    const o = calcularOrcamento({ ...entradaD([38.8367]), margemPct: 100 });
    assert.ok(o.erro);
    assert.equal(o.totalCentavos, 0);
  });
  it('taxa de cartão reduz o lucro; frete não é receita', () => {
    const l = lucroPedido({ totalCentavos: 13290, freteCentavos: 1500, taxasCartaoCentavos: 206, custoProducao: 38.8367, modelagem: 40 });
    // 117,90 − 2,06 − 38,8367 − 40 = 37,0033
    assert.equal(l.lucroCentavos, 3700);
  });
  it('desconto por quantidade sugerido: 10% a partir de 10 unidades', () => {
    const cfg = configPadrao().pedidos;
    assert.equal(descontoQtdSugerido(20, cfg), 10);
    assert.equal(descontoQtdSugerido(10, cfg), 10);
    assert.equal(descontoQtdSugerido(9, cfg), 0);
  });
  it('número do pedido', () => {
    assert.equal(numeroPedido(1), '#0001');
    assert.equal(numeroPedido(123), '#0123');
  });
});

describe('situação financeira', () => {
  it('sinal + saldo quitam; cartão guarda a taxa', () => {
    const p = pedido({ etapa: 'entregue' });
    const pgs = [pagamento({ valorCentavos: 5895, tipo: 'sinal' }), pagamento({ valorCentavos: 5895, forma: 'cartao', taxaCentavos: 206, tipo: 'saldo' })];
    const s = situacaoFinanceira(p, pgs);
    assert.equal(s.pagoCentavos, 11790);
    assert.equal(s.saldoCentavos, 0);
    assert.equal(s.creditoCentavos, 0);
    assert.equal(s.taxasCartaoCentavos, 206);
    assert.equal(resultadoPedido(p, pgs).lucroCentavos, 3906 - 206);
  });
  it('pagamento acima do total vira crédito; estornos não contam', () => {
    const p = pedido({ etapa: 'aprovado' });
    const pgs = [
      pagamento({ id: 'a', valorCentavos: 12000 }),
      pagamento({ id: 'b', valorCentavos: 500 }),
      pagamento({ id: 'c', valorCentavos: 500, direcao: 'pago', estornoDe: 'b' }),
      pagamento({ id: 'x', refId: 'outro', valorCentavos: 999 }),
    ];
    const s = situacaoFinanceira(p, pgs);
    assert.equal(s.pagoCentavos, 12000);
    assert.equal(s.creditoCentavos, 210);
    assert.equal(s.saldoCentavos, 0);
  });
  it('a receber só depois de entregue; cancelado não tem saldo nem crédito', () => {
    const pgs = [pagamento({ valorCentavos: 5895 })];
    assert.equal(situacaoFinanceira(pedido({ etapa: 'pronto' }), pgs).aReceberCentavos, 0);
    assert.equal(situacaoFinanceira(pedido({ etapa: 'entregue' }), pgs).aReceberCentavos, 5895);
    const canc = situacaoFinanceira(pedido({ etapa: 'cancelado' }), [...pgs, pagamento({ valorCentavos: 2000, direcao: 'pago', tipo: 'devolucao' })]);
    assert.equal(canc.pagoCentavos, 3895);
    assert.equal(canc.saldoCentavos, 0);
    assert.equal(canc.creditoCentavos, 0);
  });
});

describe('alertas', () => {
  it('prazo em 2 dias ou menos (amarelo) e atrasado (vermelho)', () => {
    const p = pedido({ etapa: 'producao', prazo: '2026-10-18' });
    assert.deepEqual(alertasPedido(p, [], '2026-10-16'), [{ tipo: 'prazo', tom: 'atencao', texto: 'Prazo em 2 dias' }]);
    assert.deepEqual(alertasPedido(p, [], '2026-10-15'), []);
    assert.equal(alertasPedido(p, [], '2026-10-18')[0].texto, 'Prazo vence hoje');
    assert.deepEqual(alertasPedido(p, [], '2026-10-19'), [{ tipo: 'atrasado', tom: 'ruim', texto: 'Atrasado há 1 dia' }]);
  });
  it('"Aprovado sem sinal há 3 dias" (em produção; também em pedido antigo na etapa \'aprovado\')', () => {
    const p = pedido({ etapa: 'producao', aprovadoEm: '2026-10-13', producaoEm: '2026-10-13', sinalDispensadoMotivo: 'cliente antigo' });
    assert.deepEqual(alertasPedido(p, [], '2026-10-15'), []);
    assert.equal(alertasPedido(p, [], '2026-10-16')[0].texto, 'Aprovado sem sinal há 3 dias');
    assert.deepEqual(alertasPedido(p, [pagamento({ valorCentavos: 1000 })], '2026-10-16'), []);
    assert.equal(alertasPedido({ ...p, etapa: 'aprovado', producaoEm: undefined }, [], '2026-10-16')[0].tipo, 'sem_sinal');
    assert.equal(alertasPedido({ ...p, aprovadoEm: undefined }, [], '2026-10-16')[0].tipo, 'sem_sinal');
    assert.deepEqual(alertasPedido({ ...p, etapa: 'pronto' }, [], '2026-10-16'), []);
  });
  it('"Pronto e não retirado há mais de 5 dias"', () => {
    const p = pedido({ etapa: 'pronto', prontoEm: '2026-10-10' });
    assert.deepEqual(alertasPedido(p, [], '2026-10-15'), []);
    assert.equal(alertasPedido(p, [], '2026-10-16')[0].texto, 'Pronto e não retirado há mais de 5 dias');
  });
  it('orçamento com validade vencida sem resposta', () => {
    const p = pedido({ validade: '2026-10-23' });
    assert.deepEqual(alertasPedido(p, [], '2026-10-23'), []);
    assert.equal(alertasPedido(p, [], '2026-10-24')[0].tipo, 'validade');
    assert.deepEqual(alertasPedido(pedido({ etapa: 'entregue', validade: '2026-01-01', prazo: '2026-01-01' }), [], '2026-10-24'), []);
  });
});

describe('etapas e reservas', () => {
  it('só avança ou cancela; "Aprovado" e "Em produção" são uma etapa só', () => {
    assert.deepEqual(ETAPAS_FLUXO, ['orcamento', 'producao', 'pronto', 'entregue']);
    assert.deepEqual(ETAPAS, ['orcamento', 'producao', 'pronto', 'entregue', 'cancelado']);
    assert.equal(proximaEtapa('orcamento'), 'producao');
    assert.equal(proximaEtapa('aprovado'), 'pronto');
    assert.equal(proximaEtapa('producao'), 'pronto');
    assert.equal(proximaEtapa('pronto'), 'entregue');
    assert.equal(proximaEtapa('entregue'), null);
    assert.equal(podeMover('aprovado', 'pronto'), true);
    assert.equal(podeMover('orcamento', 'aprovado'), true);
    assert.equal(podeMover('producao', 'aprovado'), false);
    assert.equal(podeMover('aprovado', 'producao'), false);
    assert.equal(podeMover('pronto', 'producao'), false);
    assert.equal(podeMover('pronto', 'cancelado'), true);
    assert.equal(podeMover('entregue', 'cancelado'), false);
  });
  it('etapa obsoleta "aprovado" vale "Em produção"', () => {
    assert.equal(etapaNoFluxo('aprovado'), 'producao');
    for (const e of ETAPAS) assert.equal(etapaNoFluxo(e), e);
    assert.deepEqual(
      [...ETAPAS, 'aprovado' as const].filter(emProducao),
      ['producao', 'aprovado'],
    );
  });
  it('catálogo fica reservado da aprovação até a entrega', () => {
    const item = { id: 'ic', tipo: 'catalogo' as const, produtoId: 'k', descricao: 'Kettlebell', quantidade: 3, custoUnit: 2.4873, custoTotal: 7.4619 };
    const peds = [
      pedido({ id: 'a', etapa: 'orcamento', itens: [item] }),
      pedido({ id: 'b', etapa: 'aprovado', itens: [item] }),
      pedido({ id: 'c', etapa: 'pronto', itens: [item, { ...item, id: 'ic2', quantidade: 2 }] }),
      pedido({ id: 'd', etapa: 'entregue', itens: [item], catalogoBaixado: true }),
      pedido({ id: 'e', etapa: 'cancelado', itens: [item] }),
    ];
    assert.deepEqual(Array.from(reservasCatalogo(peds)), [['k', 8]]);
    const f = faltasCatalogo(peds[0], peds, () => 10);
    assert.deepEqual(f, [{ produtoId: 'k', descricao: 'Kettlebell', quantidade: 3, disponivel: 2, faltam: 1 }]);
    assert.equal(faltasCatalogo(peds[1], peds, () => 10)[0].faltam, 0);
  });
  it('Kanban agrupa por etapa e ordena pelo prazo; pedido antigo em "aprovado" fica em Em produção', () => {
    const g = pedidosPorEtapa([
      pedido({ id: 'a', numero: 1, etapa: 'producao' }),
      pedido({ id: 'b', numero: 2, etapa: 'producao', prazo: '2026-10-20' }),
      pedido({ id: 'c', numero: 3, etapa: 'aprovado', prazo: '2026-10-25' }),
    ]);
    assert.deepEqual(g.producao.map((p) => p.id), ['b', 'c', 'a']);
    assert.equal(g.aprovado.length, 0);
    assert.equal(g.cancelado.length, 0);
  });
});

describe('título automático', () => {
  const it1 = (descricao: string, quantidade = 1) => ({ descricao, quantidade });
  it('pela descrição e quantidade do primeiro item, com quantos itens há além dele', () => {
    assert.equal(tituloAutomatico([it1('Chaveiro com nome')]), 'Chaveiro com nome');
    assert.equal(tituloAutomatico([it1('Chaveiro com nome', 20)]), '20 × Chaveiro com nome');
    assert.equal(tituloAutomatico([it1('Chaveiro com nome'), it1('Kettlebell', 5)]), 'Chaveiro com nome + 1 item');
    assert.equal(tituloAutomatico([it1('Chaveiro com nome', 20), it1('A'), it1('B')]), '20 × Chaveiro com nome + 2 itens');
  });
  it('pula itens sem descrição; nenhuma descrição = vazio', () => {
    assert.equal(tituloAutomatico([it1(' ', 3), it1('Chaveiro Kettlebell', 5)]), '5 × Chaveiro Kettlebell + 1 item');
    assert.equal(tituloAutomatico([it1(''), it1('  ')]), '');
    assert.equal(tituloAutomatico([]), '');
  });
});

describe('estatísticas do cliente', () => {
  it('vendas não canceladas + pedidos entregues', () => {
    const venda = (over: Partial<Venda>): Venda => ({
      ...base,
      id: 'v' + Math.random(),
      data: '2026-09-01',
      canal: 'presencial',
      formaPagamento: 'pix',
      clienteId: 'c1',
      itens: [],
      subtotalCentavos: 0,
      descontoCentavos: 0,
      totalCentavos: 1500,
      taxaCentavos: 0,
      custoTotal: 0,
      lucroCentavos: 0,
      ...over,
    });
    const vendas = [venda({}), venda({ cancelada: true, totalCentavos: 9999 }), venda({ clienteId: 'outro' })];
    const pedidos = [
      pedido({ id: 'p1', etapa: 'entregue', entregueEm: '2026-10-16' }),
      pedido({ id: 'p2', etapa: 'aprovado', totalCentavos: 5000 }),
    ];
    const pgs = [pagamento({ refId: 'p1', valorCentavos: 5895 }), pagamento({ refId: 'p2', valorCentavos: 6000 })];
    const e = estatisticasDoCliente('c1', pedidos, vendas, pgs);
    assert.equal(e.pedidos, 2);
    assert.equal(e.compras, 2);
    assert.equal(e.totalGastoCentavos, 1500 + 11790);
    assert.equal(e.ultimaCompra, '2026-10-16');
    assert.equal(e.ticketMedioCentavos, 6645);
    assert.equal(e.creditoCentavos, 1000);
    assert.equal(e.aReceberCentavos, 5895);
  });
});
