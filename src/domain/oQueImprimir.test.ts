// "O que imprimir" (seção 7.5): necessidade, mesas, tempo, filamento (por tipo, somando as cores) e ordem de urgência.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Acerto, AcertoItem, Material, Parceiro, Pedido, PedidoItem, Produto, TipoFilamento } from '../data/types.ts';
import { listaOQueImprimir, reposicaoPrevista, reservasDePedidos, type EntradaOQueImprimir } from './oQueImprimir.ts';
import { reservasCatalogo } from './pedidos.ts';

const base = { criadoEm: '2026-09-01T12:00:00.000Z', atualizadoEm: '2026-09-01T12:00:00.000Z' };

function produto(id: string, nome: string, estoqueMinimo: number, pecasPorMesa: number, tempoMin: number, tipo: TipoFilamento, gramas: number): Produto {
  return {
    ...base,
    id,
    nome,
    categoria: 'Chaveiro',
    codigo: id,
    precoEtiquetaCentavos: 1500,
    estoqueMinimo,
    maoDeObraMin: 2,
    mesas: [{ id: `m-${id}`, pecasPorMesa, tempoMin, impressoraId: 'imp', filamentos: [{ tipo, gramas }] }],
    componentes: [{ materialId: 'argola', quantidade: 1 }],
    origemModelo: 'proprio',
    arquivado: false,
  };
}

function parceiro(id: string, mix: Parceiro['mix'], over: Partial<Parceiro> = {}): Parceiro {
  return {
    ...base,
    id,
    nome: id,
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
    mix,
    instaladoEm: '2026-09-16',
    arquivado: false,
    ...over,
  };
}

function item(produtoId: string, esperado: number, vendidos: number): AcertoItem {
  const contei = esperado - vendidos;
  return {
    produtoId,
    esperado,
    contei,
    avariados: 0,
    recolhidos: 0,
    faltasAbonadas: 0,
    ajusteEntrada: 0,
    vendidos,
    precoUnitCentavos: 1500,
    valorCentavos: vendidos * 1500,
    repostos: vendidos,
    estoqueFinal: esperado,
    custoUnit: 2.4873,
  };
}

function acerto(id: string, parceiroId: string, data: string, itens: AcertoItem[], situacao: Acerto['situacao'] = 'concluido'): Acerto {
  return {
    ...base,
    id,
    parceiroId,
    data,
    dataAnterior: data,
    pctParceiro: 30,
    brutoCentavos: 0,
    parteParceiroCentavos: 0,
    suaParteCentavos: 0,
    pixDiretoCentavos: 0,
    valorAcertoCentavos: 0,
    situacao,
    statusPagamento: 'pago',
    itens,
    proximoAcerto: data,
  };
}

function itemPedido(tipo: PedidoItem['tipo'], quantidade: number, produtoId?: string): PedidoItem {
  return { id: `i-${Math.random()}`, tipo, produtoId, descricao: 'Item', quantidade, custoUnit: 1, custoTotal: quantidade };
}

function pedido(id: string, numero: number, etapa: Pedido['etapa'], itens: PedidoItem[], over: Partial<Pedido> = {}): Pedido {
  return {
    ...base,
    id,
    numero,
    clienteId: 'marina',
    titulo: `Pedido ${numero}`,
    referencias: [],
    itens,
    entrega: { tipo: 'retirada', freteCentavos: 0 },
    canalOrigem: 'whatsapp',
    etapa,
    horasModelagem: 0,
    urgente: false,
    urgenciaPct: 0,
    descontoPct: 0,
    sinalPct: 50,
    pedidoMinimoCentavos: 3000,
    margemPct: 50,
    valorHoraModelagem: 40,
    arredondamento: 'noventa',
    custoProducao: 0,
    modelagemValor: 0,
    totalCalculadoCentavos: 0,
    totalCentavos: 0,
    sinalCentavos: 0,
    validade: '2026-10-23',
    checklist: { modeloAprovado: false, impresso: false, acabamento: false },
    historico: [],
    ...over,
  };
}

const fil = (id: string, material: TipoFilamento, cor: string, arquivado = false): Material => ({
  ...base,
  id,
  tipo: 'filamento',
  nome: `${material} ${cor}`,
  material,
  corNome: cor,
  unidade: 'g',
  custoMedio: 100,
  minimo: 250,
  arquivado,
});
// PLA: 60 g de Preto + 40 g de Rosa = 100 g (o arquivado não conta). PETG: 1.000 g.
const materiais = [fil('pla', 'PLA', 'Preto'), fil('rosa', 'PLA', 'Rosa'), fil('velho', 'PLA', 'Azul', true), fil('petg', 'PETG', 'Branco')];
const saldos: Record<string, number> = { pla: 60, rosa: 40, velho: 500, petg: 1000 };

// Kettlebell: 8 peças por mesa, 4 h, 64 g de PLA (Exemplo A). Anilha: 6 por mesa, 3 h, 48 g de PLA. Vaso: PETG.
const kb = produto('kb', 'Kettlebell', 5, 8, 240, 'PLA', 64);
const an = produto('an', 'Anilha', 4, 6, 180, 'PLA', 48);
const ha = produto('ha', 'Halter', 2, 8, 240, 'PLA', 64);
const kr = produto('kr', 'Vaso', 3, 8, 240, 'PETG', 64);
const velho = { ...produto('old', 'Arquivado', 10, 8, 240, 'PLA', 64), arquivado: true };

// Academia Alfa (Exemplo B): Kettlebell vendeu 4 e 6, Anilha 2 e 3, Halter 0 e 0.
const alfa = parceiro('alfa', [
  { produtoId: 'kb', nivelIdeal: 10 },
  { produtoId: 'an', nivelIdeal: 8 },
  { produtoId: 'ha', nivelIdeal: 6 },
]);
// Loja Beta ainda sem acerto: Vaso ideal 12, há 5 no expositor.
const beta = parceiro('beta', [{ produtoId: 'kr', nivelIdeal: 12 }]);
const pausado = parceiro('pausado', [{ produtoId: 'kb', nivelIdeal: 50 }], { situacao: 'pausado' });
const acertos = [
  acerto('a2', 'alfa', '2026-10-16', [item('kb', 10, 6), item('an', 8, 3), item('ha', 6, 0)]),
  acerto('a1', 'alfa', '2026-10-01', [item('kb', 10, 4), item('an', 8, 2), item('ha', 6, 0)]),
  acerto('x', 'alfa', '2026-10-20', [item('kb', 10, 10)], 'estornado'),
];

const saldosCasa: Record<string, number> = { kb: 2, an: 4, ha: 5, kr: 0, old: 0 };
const pedidos = [
  pedido('p1', 1, 'aprovado', [itemPedido('catalogo', 2, 'kb'), itemPedido('personalizada', 20)], { prazo: '2026-10-20' }),
  pedido('p2', 2, 'producao', [itemPedido('catalogo', 1, 'kb')], { prazo: '2026-10-18' }),
  pedido('p3', 3, 'pronto', [itemPedido('catalogo', 4, 'kb')], { catalogoBaixado: true }),
  pedido('p4', 4, 'entregue', [itemPedido('catalogo', 5, 'kb')]),
  pedido('p5', 5, 'orcamento', [itemPedido('catalogo', 6, 'kb')]),
  pedido('p6', 6, 'aprovado', [itemPedido('personalizada', 1)]),
];

function entrada(over: Partial<EntradaOQueImprimir> = {}): EntradaOQueImprimir {
  return {
    produtos: [an, ha, kb, kr, velho],
    saldoCasa: (id) => saldosCasa[id] ?? 0,
    saldoParceiro: (id, pid) => (pid === 'beta' && id === 'kr' ? 5 : 0),
    parceirosAtivos: [alfa, beta, pausado],
    acertos,
    reservasPedidos: reservasDePedidos(pedidos),
    saldoMaterial: (id) => saldos[id] ?? 0,
    materiais,
    pedidosPersonalizados: pedidos,
    ...over,
  };
}

describe('reservas e reposição prevista', () => {
  it('reserva itens de catálogo de pedidos em produção (também os antigos em "aprovado") e prontos ainda não baixados', () => {
    assert.deepEqual(Array.from(reservasDePedidos(pedidos)), [['kb', 3]]);
    assert.deepEqual(reservasCatalogo(pedidos), reservasDePedidos(pedidos));
  });
  it('média dos últimos 3 acertos nos parceiros ativos (pausado fica fora)', () => {
    const saldo = () => 0;
    assert.equal(reposicaoPrevista('kb', [alfa, pausado], acertos, saldo), 5);
    assert.equal(reposicaoPrevista('an', [alfa], acertos, saldo), 2.5);
    assert.equal(reposicaoPrevista('ha', [alfa], acertos, saldo), 0);
  });
  it('só os 3 últimos acertos em que o produto estava no expositor', () => {
    const muitos = [
      acerto('o1', 'alfa', '2026-08-01', [item('kb', 10, 10)]),
      acerto('o2', 'alfa', '2026-08-16', [item('an', 8, 1)]),
      ...acertos,
      acerto('o3', 'alfa', '2026-10-31', [item('kb', 10, 8)]),
    ];
    // kb: 8, 6 e 4 (o de 01/08 fica fora).
    assert.equal(reposicaoPrevista('kb', [alfa], muitos, () => 0), 6);
  });
  it('sem histórico: nível ideal − saldo no parceiro (mínimo 0)', () => {
    assert.equal(reposicaoPrevista('kr', [beta], acertos, () => 5), 7);
    assert.equal(reposicaoPrevista('kr', [beta], acertos, () => 20), 0);
  });
});

describe('listaOQueImprimir', () => {
  const r = listaOQueImprimir(entrada());
  const porId = new Map(r.itens.map((i) => [i.produtoId, i]));

  it('necessidade = mínimo + reposição prevista + reservado − saldo em Casa', () => {
    // kb: 5 + 5 + 3 − 2 = 11. an: 4 + 2,5 − 4 = 2,5 -> 3. kr: 3 + 7 − 0 = 10. ha: 2 + 0 − 5 < 0 (fora).
    assert.equal(porId.get('kb')?.necessidade, 11);
    assert.equal(porId.get('an')?.necessidade, 3);
    assert.equal(porId.get('kr')?.necessidade, 10);
    assert.equal(porId.has('ha'), false);
    assert.equal(porId.has('old'), false);
    assert.equal(porId.get('kb')?.reposicaoPrevista, 5);
    assert.equal(porId.get('kb')?.reservado, 3);
  });
  it('mesas = arredondar para cima(necessidade ÷ N) e tempo total', () => {
    assert.deepEqual(porId.get('kb')?.mesas, [{ mesaId: 'm-kb', pecasPorMesa: 8, mesas: 2, tempoMin: 480 }]);
    assert.equal(porId.get('kb')?.tempoTotalMin, 480);
    assert.equal(porId.get('an')?.mesas[0].mesas, 1);
    assert.equal(porId.get('an')?.tempoTotalMin, 180);
  });
  it('filamento: soma da lista inteira por tipo, contra o saldo de todas as cores do tipo', () => {
    // Mesas inteiras: kb 2 mesas × 64 g = 128 g; an 1 mesa × 48 g = 48 g. Juntos 176 g de PLA > 100 g (Preto + Rosa).
    const fkb = porId.get('kb')!.filamentoNecessario;
    assert.deepEqual(fkb, [{ tipo: 'PLA', gramas: 128, saldo: 100, suficiente: false }]);
    assert.equal(porId.get('kb')?.filamentoSuficiente, false);
    assert.equal(porId.get('an')?.filamentoSuficiente, false);
    assert.deepEqual(porId.get('kr')?.filamentoNecessario, [{ tipo: 'PETG', gramas: 128, saldo: 1000, suficiente: true }]);
    assert.deepEqual(r.filamentos[0], { tipo: 'PLA', nome: 'PLA (todas as cores)', necessarioG: 176, saldoG: 100, faltaG: 76 });
    assert.deepEqual(r.filamentos[1], { tipo: 'PETG', nome: 'PETG (todas as cores)', necessarioG: 128, saldoG: 1000, faltaG: 0 });
  });
  it('com saldo suficiente para a lista inteira', () => {
    // 76 g a mais de Rosa: 60 + 116 = 176 g de PLA, exatamente o que a lista pede.
    const ok = listaOQueImprimir(entrada({ saldoMaterial: (id) => (id === 'rosa' ? 116 : (saldos[id] ?? 0)) }));
    assert.ok(ok.itens.every((i) => i.filamentoSuficiente));
    assert.equal(ok.filamentos.find((f) => f.tipo === 'PLA')?.faltaG, 0);
  });
  it('ordem: falta para pedidos, sem estoque em Casa, depois reposição', () => {
    assert.deepEqual(r.itens.map((i) => i.produtoId), ['kb', 'kr', 'an']);
    assert.deepEqual(r.itens.map((i) => i.urgencia), ['pedidos', 'sem_estoque', 'reposicao']);
  });
  it('motivo em texto curto', () => {
    assert.equal(porId.get('kb')?.motivo, '3 reservadas em pedidos; abaixo do mínimo em Casa (2 de 5); reposição prevista nos parceiros: 5');
    assert.equal(porId.get('an')?.motivo, 'Reposição prevista nos parceiros: 2,5');
    assert.equal(porId.get('kr')?.motivo, 'Abaixo do mínimo em Casa (0 de 3); reposição prevista nos parceiros: 7');
  });
  it('pedidos em "Em produção" (também os antigos em "aprovado"), pelo prazo (sem prazo no fim)', () => {
    assert.deepEqual(r.pedidos.map((p) => p.id), ['p2', 'p1', 'p6']);
  });
  it('saldo negativo em Casa entra na necessidade', () => {
    const neg = listaOQueImprimir(entrada({ produtos: [ha], saldoCasa: () => -3, parceirosAtivos: [] }));
    assert.equal(neg.itens[0].necessidade, 5);
    assert.equal(neg.itens[0].urgencia, 'sem_estoque');
    assert.equal(neg.itens[0].motivo, 'Saldo negativo em Casa (−3)');
  });
});
