// Configurações (12) e assistente de primeiro acesso (4).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { MENSAGENS_PADRAO } from '../data/defaults.ts';
import { saldoMaterial, statusMargemProduto } from '../data/selectors.ts';
import type { Canal } from '../data/types.ts';
import { ErroNegocio } from './estoque.ts';
import { salvarProduto } from './produtos.ts';
import {
  adicionarCanal,
  adicionarCategoria,
  atualizarCanais,
  atualizarCustos,
  atualizarEmpresa,
  atualizarEstoqueConfig,
  atualizarMensagem,
  atualizarParcerias,
  atualizarPedidosConfig,
  canalPersonalizado,
  concluirOnboarding,
  nomeFilamento,
  removerCanal,
  removerCategoria,
  renomearCategoria,
  restaurarMensagem,
  type DadosOnboarding,
} from './config.ts';

function falha(fn: () => unknown, re: RegExp): void {
  assert.throws(fn, (e: unknown) => e instanceof ErroNegocio && re.test(e.message));
}

/** Parâmetros do Exemplo A. */
const CUSTOS_A = {
  tarifaKwh: 1,
  valorHora: 25,
  taxaFalhaPct: 10,
  margemDesejadaPct: 50,
  arredondamento: 'noventa' as const,
  taxaCartaoPct: 4,
};

/** Chaveiro Kettlebell do Exemplo A (custo 2,4873), com a etiqueta informada. */
function criarKettlebell(precoEtiquetaCentavos: number, categoria = 'Chaveiro') {
  const { imp, pla, argola, saquinho } = db.tx((t) => ({
    imp: t.insert('impressoras', { nome: 'A1 mini', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, potenciaW: 80, manutencaoH: 0.1, ativa: true }),
    pla: t.insert('materiais', { tipo: 'filamento', nome: 'PLA Preto', material: 'PLA', corNome: 'Preto', unidade: 'g', custoMedio: 100, minimo: 250, arquivado: false }),
    argola: t.insert('materiais', { tipo: 'insumo', nome: 'Argola', unidade: 'un', custoMedio: 0.3, minimo: 10, arquivado: false }),
    saquinho: t.insert('materiais', { tipo: 'insumo', nome: 'Saquinho', unidade: 'un', custoMedio: 0.1, minimo: 10, arquivado: false }),
  }));
  return salvarProduto({
    nome: 'Chaveiro Kettlebell',
    categoria,
    precoEtiquetaCentavos,
    mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: imp.id, filamentos: [{ materialId: pla.id, gramas: 64 }] }],
    componentes: [
      { materialId: argola.id, quantidade: 1 },
      { materialId: saquinho.id, quantidade: 1 },
    ],
  });
}

beforeEach(() => db.resetar());

describe('atualizarEmpresa', () => {
  it('aplica o patch e mantém o resto', () => {
    const e = atualizarEmpresa({ nome: ' OCTA 3D ', chavePix: 'pix@octa.com', whatsapp: '(71) 99999-8888' });
    assert.equal(e.nome, 'OCTA 3D');
    assert.equal(db.config.empresa.chavePix, 'pix@octa.com');
    assert.equal(db.config.empresa.corPrincipal, '#2B4A6B');
    assert.ok(db.config.empresa.politicaCancelamento.length > 0);
  });
  it('recusa nome vazio, WhatsApp e cor inválidos', () => {
    falha(() => atualizarEmpresa({ nome: '  ' }), /nome da empresa/);
    falha(() => atualizarEmpresa({ whatsapp: '123' }), /WhatsApp/);
    falha(() => atualizarEmpresa({ corPrincipal: 'azul' }), /cor principal/);
    assert.equal(db.config.empresa.nome, '3D gestão');
  });
});

describe('atualizarCustos', () => {
  it('salva os parâmetros do Exemplo A e o canal cartão acompanha a taxa', () => {
    const r = atualizarCustos(CUSTOS_A);
    assert.equal(r.custos.tarifaKwh, 1);
    assert.equal(db.config.custos.valorHora, 25);
    assert.equal(db.config.custos.margemMinimaPct, 30);
    assert.deepEqual(r.avisos, []);
    assert.equal(db.config.canais.find((c) => c.tipo === 'cartao')?.comissaoPct, 4);
  });

  it('percentuais de 0 a 100', () => {
    falha(() => atualizarCustos({ taxaFalhaPct: 101 }), /Taxa de falha.*entre 0% e 100%/);
    falha(() => atualizarCustos({ margemMinimaPct: -1 }), /Margem mínima/);
    falha(() => atualizarCustos({ taxaCartaoPct: 100 }), /taxa do cartão/);
  });

  it('margem desejada ≥ 100% é bloqueada com explicação', () => {
    falha(() => atualizarCustos({ margemDesejadaPct: 100 }), /nenhum preço cobre o custo/);
    assert.equal(db.config.custos.margemDesejadaPct, 50);
  });

  it('tarifas e valores não negativos; arredondamento válido', () => {
    falha(() => atualizarCustos({ tarifaKwh: -0.1 }), /Tarifa de energia/);
    falha(() => atualizarCustos({ valorHora: -1 }), /hora de trabalho/);
    falha(() => atualizarCustos({ custosFixosMensaisCentavos: -1 }), /Custos fixos/);
    falha(() => atualizarCustos({ arredondamento: 'meio' as never }), /arredondamento/);
  });

  it('margem mínima acima da desejada é permitida, com aviso', () => {
    const r = atualizarCustos({ margemMinimaPct: 60 });
    assert.equal(db.config.custos.margemMinimaPct, 60);
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /margem mínima de alerta está maior/);
  });

  it('mudar custos não muda o preço de etiqueta: o produto ganha alerta de margem', () => {
    atualizarCustos(CUSTOS_A);
    const p = criarKettlebell(590);
    assert.equal(statusMargemProduto(p), 'atencao'); // Parceiro 70/30: margem 39,8%
    // Hora de trabalho R$ 60,00: custo 3,654 -> Parceiro 70/30 com margem 11,5%.
    const r = atualizarCustos({ valorHora: 60 });
    assert.equal(db.get('produtos', p.id)?.precoEtiquetaCentavos, 590);
    assert.equal(statusMargemProduto(db.get('produtos', p.id)!), 'prejuizo');
    assert.equal(r.avisos.length, 1);
    assert.match(r.avisos[0], /^1 produto ficou com margem abaixo da mínima/);
    // Mudar de novo sem novos alertas não repete o aviso.
    assert.deepEqual(atualizarCustos({ valorHora: 61 }).avisos, []);
  });
});

describe('canais', () => {
  const canais = () => db.config.canais.map((c) => ({ ...c }));

  it('edita comissão, tarifa, nome e ativo; cartão sempre segue a taxa', () => {
    const lista = canais();
    const mk = lista.find((c) => c.id === 'marketplace')!;
    mk.ativo = true;
    mk.comissaoPct = 18;
    mk.tarifaFixaCentavos = 400;
    mk.nome = 'Shopee';
    lista.find((c) => c.id === 'direto_cartao')!.comissaoPct = 99;
    lista.find((c) => c.id === 'direto_cartao')!.tipo = 'direto';
    const r = atualizarCanais(lista);
    const mk2 = r.canais.find((c) => c.id === 'marketplace')!;
    assert.equal(mk2.nome, 'Shopee');
    assert.equal(mk2.comissaoPct, 18);
    assert.equal(mk2.tarifaFixaCentavos, 400);
    assert.equal(mk2.ativo, true);
    const cartao = db.config.canais.find((c) => c.id === 'direto_cartao')!;
    assert.equal(cartao.tipo, 'cartao');
    assert.equal(cartao.comissaoPct, 3.5);
  });

  it('comissão de 100% é bloqueada com explicação', () => {
    const lista = canais();
    lista[2].comissaoPct = 100;
    falha(() => atualizarCanais(lista), /é de 100% ou mais\. Assim você não recebe nada/);
    assert.equal(db.config.canais[2].comissaoPct, 20);
  });

  it('pelo menos um canal ativo; canais padrão não somem; nomes sem repetir', () => {
    falha(() => atualizarCanais(canais().map((c) => ({ ...c, ativo: false }))), /pelo menos um canal ativo/);
    falha(() => atualizarCanais(canais().filter((c) => c.id !== 'parceiro_70_30')), /é padrão e não pode ser removido/);
    const dup = canais();
    dup[1].nome = 'direto pix/dinheiro';
    falha(() => atualizarCanais(dup), /Já existe um canal/);
    const neg = canais();
    neg[0].tarifaFixaCentavos = -1;
    falha(() => atualizarCanais(neg), /tarifa fixa/);
  });

  it('adicionar e remover só canais personalizados', () => {
    const { canal } = adicionarCanal({ nome: 'Mercado Livre', tipo: 'marketplace', comissaoPct: 16, tarifaFixaCentavos: 650 });
    assert.ok(canal.id.startsWith('canal_'));
    assert.equal(canal.ativo, true);
    assert.equal(canalPersonalizado(canal), true);
    assert.equal(canalPersonalizado({ id: 'direto_pix' }), false);
    assert.equal(db.config.canais.length, 6);
    falha(() => adicionarCanal({ nome: 'mercado livre' }), /Já existe um canal/);
    falha(() => adicionarCanal({ nome: 'Caro', comissaoPct: 100 }), /100% ou mais/);
    falha(() => removerCanal('direto_pix'), /é padrão e não pode ser removido/);
    falha(() => removerCanal('nao-existe'), /não encontrado/);
    const lista: Canal[] = removerCanal(canal.id);
    assert.equal(lista.length, 5);
    assert.equal(db.config.canais.length, 5);
  });

  it('canal novo pode deixar produto com margem baixa: aviso, sem mudar a etiqueta', () => {
    atualizarCustos(CUSTOS_A);
    const p = criarKettlebell(790);
    const r = adicionarCanal({ nome: 'Marketplace caro', comissaoPct: 60 });
    assert.equal(r.avisos.length, 1);
    assert.equal(db.get('produtos', p.id)?.precoEtiquetaCentavos, 790);
  });
});

describe('parcerias, pedidos e estoque', () => {
  it('divisões sem repetir, entre 0% e 100%', () => {
    const p = atualizarParcerias({ divisoes: [25, 30, 25], frequenciaPadraoDias: 30 });
    assert.deepEqual(p.divisoes, [25, 30]);
    assert.equal(db.config.parcerias.frequenciaPadraoDias, 30);
    assert.equal(db.config.parcerias.diasAviso, 3);
    falha(() => atualizarParcerias({ divisoes: [100] }), /% do parceiro/);
    falha(() => atualizarParcerias({ divisoes: [] }), /pelo menos uma divisão/);
    falha(() => atualizarParcerias({ frequenciaPadraoDias: 0 }), /frequência/);
    falha(() => atualizarParcerias({ limiteBaixoDesempenhoCentavos: -1 }), /baixo desempenho/);
  });

  it('padrões dos pedidos (o número sequencial não muda)', () => {
    const p = atualizarPedidosConfig({ pedidoMinimoCentavos: 5000, sinalPct: 40 });
    assert.equal(p.pedidoMinimoCentavos, 5000);
    assert.equal(p.sinalPct, 40);
    assert.equal(p.proximoNumero, 1);
    falha(() => atualizarPedidosConfig({ urgenciaPct: 120 }), /urgência/);
    falha(() => atualizarPedidosConfig({ validadeDias: 0 }), /validade/);
    falha(() => atualizarPedidosConfig({ descontoQtdPct: 100 }), /desconto/);
  });

  it('padrões de estoque', () => {
    assert.equal(atualizarEstoqueConfig({ minimoFilamentoPadraoG: 300 }).minimoFilamentoPadraoG, 300);
    falha(() => atualizarEstoqueConfig({ diasSemVendaAlerta: 0 }), /dias sem venda/);
  });
});

describe('mensagens', () => {
  it('edita e restaura o modelo', () => {
    atualizarMensagem('pos_venda', 'Oi {cliente}, deu tudo certo?  ');
    assert.equal(db.config.mensagens.pos_venda, 'Oi {cliente}, deu tudo certo?');
    falha(() => atualizarMensagem('pos_venda', '   '), /não pode ficar vazia/);
    falha(() => atualizarMensagem('inexistente' as never, 'x'), /desconhecido/);
    assert.equal(restaurarMensagem('pos_venda'), MENSAGENS_PADRAO.pos_venda);
    assert.equal(db.config.mensagens.pos_venda, MENSAGENS_PADRAO.pos_venda);
  });
});

describe('categorias', () => {
  it('adiciona sem repetir (ignora maiúsculas e acentos)', () => {
    assert.deepEqual(adicionarCategoria(' Brinde '), ['Chaveiro', 'Display', 'Decoração', 'Personalizado', 'Outro', 'Brinde']);
    falha(() => adicionarCategoria('decoracao'), /Já existe a categoria "Decoração"/);
    falha(() => adicionarCategoria(''), /nome da categoria/);
  });

  it('renomear troca o nome nos produtos, inclusive arquivados, na mesma transação', () => {
    const p = criarKettlebell(790);
    db.tx((t) => t.update('produtos', p.id, { arquivado: true }));
    const r = renomearCategoria('chaveiro', 'Chaveiros');
    assert.equal(r.produtosAlterados, 1);
    assert.equal(r.categorias[0], 'Chaveiros');
    assert.ok(!db.config.categorias.includes('Chaveiro'));
    assert.equal(db.get('produtos', p.id)?.categoria, 'Chaveiros');
    falha(() => renomearCategoria('Chaveiros', 'display'), /Já existe a categoria "Display"/);
    falha(() => renomearCategoria('Nada', 'Algo'), /não encontrada/);
    // Só maiúsculas: permitido.
    renomearCategoria('Chaveiros', 'CHAVEIROS');
    assert.equal(db.get('produtos', p.id)?.categoria, 'CHAVEIROS');
  });

  it('remover recusa categoria em uso e a última categoria', () => {
    criarKettlebell(790);
    falha(() => removerCategoria('Chaveiro'), /está em 1 produto\. Troque a categoria dele/);
    assert.deepEqual(removerCategoria('Outro'), ['Chaveiro', 'Display', 'Decoração', 'Personalizado']);
    db.tx((t) => t.config({ categorias: ['Display'] }));
    falha(() => removerCategoria('Display'), /pelo menos uma categoria/);
  });
});

describe('concluirOnboarding', () => {
  const dados = (): DadosOnboarding => ({
    empresa: { nome: ' Polvo 3D ', chavePix: 'pix@polvo3d.com', nomePix: '', whatsapp: '71 99999-8888' },
    impressoras: [
      { nome: 'Mini', modelo: 'A1 mini' },
      { nome: '', modelo: 'A1', valorPago: 3000 },
    ],
    filamentos: [
      { material: 'PLA', corNome: 'Preto', corHex: '#111111', custoMedio: 100, gramasIniciais: 1000 },
      { material: 'PETG', corNome: 'Branco', custoMedio: 120.5, gramasIniciais: 0 },
    ],
    data: '2026-10-01',
  });

  it('salva empresa, impressoras e filamentos (saldo inicial como ajuste) numa transação', () => {
    const versao = db.version;
    const r = concluirOnboarding(dados());
    assert.equal(db.version, versao + 1); // uma única transação
    assert.equal(db.config.onboardingConcluido, true);
    assert.equal(db.config.empresa.nome, 'Polvo 3D');
    assert.equal(db.config.empresa.chavePix, 'pix@polvo3d.com');
    assert.equal(db.config.empresa.nomePix, 'Polvo 3D');
    assert.equal(db.config.empresa.whatsapp, '71 99999-8888');

    assert.equal(r.impressoras.length, 2);
    const [mini, a1] = r.impressoras;
    assert.equal(mini.nome, 'Mini');
    assert.equal(mini.valorPago, 2179);
    assert.equal(mini.potenciaW, 100);
    assert.equal(a1.nome, 'A1');
    assert.equal(a1.valorPago, 3000);
    assert.equal(a1.potenciaW, 95);

    const [preto, branco] = r.materiais;
    assert.equal(preto.nome, 'PLA Preto');
    assert.equal(preto.tipo, 'filamento');
    assert.equal(preto.unidade, 'g');
    assert.equal(preto.custoMedio, 100);
    assert.equal(preto.corHex, '#111111');
    assert.equal(preto.minimo, 250);
    assert.equal(branco.nome, 'PETG Branco');
    assert.equal(branco.custoMedio, 120.5);

    const movs = db.all('movMateriais');
    assert.equal(movs.length, 1); // 0 g não lança movimento
    assert.equal(movs[0].materialId, preto.id);
    assert.equal(movs[0].tipo, 'ajuste');
    assert.equal(movs[0].motivo, 'Saldo inicial');
    assert.equal(movs[0].quantidade, 1000);
    assert.equal(movs[0].data, '2026-10-01');
    assert.equal(movs[0].custoUnitSnapshot, 100);
    assert.equal(saldoMaterial(preto.id), 1000);
    assert.equal(saldoMaterial(branco.id), 0);
  });

  it('listas vazias são aceitas (passos pulados)', () => {
    const r = concluirOnboarding({ empresa: { nome: 'OCTA', chavePix: '', nomePix: '' }, impressoras: [], filamentos: [] });
    assert.equal(r.impressoras.length, 0);
    assert.equal(db.config.onboardingConcluido, true);
    assert.equal(db.config.empresa.nomePix, '');
  });

  it('erro em qualquer passo não grava nada', () => {
    const d = dados();
    d.filamentos[1].custoMedio = 0;
    falha(() => concluirOnboarding(d), /PETG Branco.*custo do kg/);
    assert.equal(db.config.onboardingConcluido, false);
    assert.equal(db.config.empresa.nome, '3D gestão');
    assert.equal(db.all('impressoras').length, 0);
    assert.equal(db.all('materiais').length, 0);
    assert.equal(db.all('movMateriais').length, 0);

    const d2 = dados();
    d2.filamentos.push({ material: 'PLA', corNome: 'preto', custoMedio: 90 });
    falha(() => concluirOnboarding(d2), /já foi informado/);
    const d3 = dados();
    d3.filamentos[0].gramasIniciais = -5;
    falha(() => concluirOnboarding(d3), /não pode ser negativo/);
    const d4 = dados();
    d4.empresa.nome = '';
    falha(() => concluirOnboarding(d4), /nome da empresa/);
    const d5 = dados();
    d5.impressoras[0].vidaUtilH = 0;
    falha(() => concluirOnboarding(d5), /vida útil/);
    assert.equal(db.all('materiais').length, 0);
  });

  it('não roda duas vezes', () => {
    concluirOnboarding(dados());
    falha(() => concluirOnboarding(dados()), /já foi concluído/);
    assert.equal(db.all('impressoras').length, 2);
  });

  it('nome padrão do filamento', () => {
    assert.equal(nomeFilamento('PLA', ' Rosa '), 'PLA Rosa');
    assert.equal(nomeFilamento('Outro', 'Madeira'), 'Filamento Madeira');
  });
});
