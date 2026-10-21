// Cadastro de produtos (7.1): código automático, padrões, validações, produto sem cor fixa (decisão 85: a ficha
// guarda o tipo do filamento e o custo é a média dos carretéis do tipo), arquivar, alerta de licença e prévia de
// custo (Exemplo A).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, produtosAtivos } from '../data/selectors.ts';
import type { ID, Impressora, Material } from '../data/types.ts';
import { toCents } from '../lib/money.ts';
import { ErroNegocio } from './estoque.ts';
import {
  alertaLicenca,
  arquivarProduto,
  formatarCodigoProduto,
  previaCusto,
  salvarProduto,
  type DadosProduto,
} from './produtos.ts';

interface Fixture {
  imp: Impressora;
  preto: Material;
  rosa: Material;
  argola: Material;
  saquinho: Material;
}

let f: Fixture;

/** Parâmetros, impressora e materiais do Exemplo A. */
function montarExemploA(): Fixture {
  return db.tx((t) => {
    t.config((c) => ({
      ...c,
      custos: {
        ...c.custos,
        tarifaKwh: 1,
        valorHora: 25,
        taxaFalhaPct: 10,
        margemDesejadaPct: 50,
        arredondamento: 'noventa',
        taxaCartaoPct: 4,
      },
    }));
    const imp = t.insert('impressoras', {
      nome: 'A1 mini',
      modelo: 'A1 mini',
      valorPago: 2000,
      vidaUtilH: 4000,
      potenciaW: 80,
      manutencaoH: 0.1,
      ativa: true,
    });
    const fil = (nome: string, cor: string) =>
      t.insert('materiais', { tipo: 'filamento', nome, material: 'PLA', corNome: cor, unidade: 'g', custoMedio: 100, minimo: 250, arquivado: false });
    const ins = (nome: string, custo: number) =>
      t.insert('materiais', { tipo: 'insumo', nome, unidade: 'un', custoMedio: custo, minimo: 10, arquivado: false });
    return { imp, preto: fil('PLA Preto', 'Preto'), rosa: fil('PLA Rosa', 'Rosa'), argola: ins('Argola', 0.3), saquinho: ins('Saquinho', 0.1) };
  });
}

/** Chaveiro Kettlebell do Exemplo A: 1 mesa de 8 peças, 4 h, 64 g de PLA (qualquer cor), argola e saquinho. */
function kettlebell(extra: Partial<DadosProduto> = {}): DadosProduto {
  return {
    nome: 'Chaveiro Kettlebell',
    categoria: 'Chaveiro',
    mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: f.imp.id, filamentos: [{ tipo: 'PLA', gramas: 64 }] }],
    componentes: [
      { materialId: f.argola.id, quantidade: 1 },
      { materialId: f.saquinho.id, quantidade: 1 },
    ],
    ...extra,
  };
}

function falha(fn: () => unknown, re: RegExp): void {
  assert.throws(fn, (e: unknown) => e instanceof ErroNegocio && re.test(e.message));
}

beforeEach(() => {
  db.resetar();
  f = montarExemploA();
});

describe('salvarProduto — criação', () => {
  it('gera código automático em sequência e aplica os padrões', () => {
    const p1 = salvarProduto(kettlebell());
    const p2 = salvarProduto(kettlebell({ nome: 'Chaveiro Anilha' }));
    assert.equal(p1.codigo, 'P-0001');
    assert.equal(p2.codigo, 'P-0002');
    assert.equal(db.config.proximoCodigoProduto, 3);
    assert.equal(p1.maoDeObraMin, 2);
    assert.equal(p1.estoqueMinimo, 0);
    assert.equal(p1.origemModelo, 'proprio');
    assert.equal(p1.arquivado, false);
    assert.ok(p1.mesas[0].id);
    assert.equal(formatarCodigoProduto(12), 'P-0012');
  });

  it('Exemplo A: custo 2,4873 e etiqueta padrão = etiqueta sugerida R$ 7,90', () => {
    const p = salvarProduto(kettlebell());
    assert.equal(custoProduto(p.id), 2.4873);
    assert.equal(toCents(custoProduto(p.id)), 249);
    assert.equal(p.precoEtiquetaCentavos, 790);
  });

  it('preço informado é respeitado', () => {
    const p = salvarProduto(kettlebell({ precoEtiquetaCentavos: 1500 }));
    assert.equal(p.precoEtiquetaCentavos, 1500);
  });

  it('o código pula números já usados', () => {
    salvarProduto(kettlebell());
    db.tx((t) => t.config({ proximoCodigoProduto: 1 }));
    const p = salvarProduto(kettlebell({ nome: 'Outro' }));
    assert.equal(p.codigo, 'P-0002');
    assert.equal(db.config.proximoCodigoProduto, 3);
  });

  it('categoria usa a grafia cadastrada; categoria nova entra na lista', () => {
    const p = salvarProduto(kettlebell({ categoria: ' chaveiro ' }));
    assert.equal(p.categoria, 'Chaveiro');
    const q = salvarProduto(kettlebell({ categoria: 'Brinde' }));
    assert.equal(q.categoria, 'Brinde');
    assert.ok(db.config.categorias.includes('Brinde'));
  });

  it('modelo de terceiro sem resposta de licença fica "não sei" e ganha alerta', () => {
    const p = salvarProduto(kettlebell({ origemModelo: 'terceiro', linkModelo: ' https://makerworld.com/x ' }));
    assert.equal(p.licencaVenda, 'nao_sei');
    assert.equal(p.linkModelo, 'https://makerworld.com/x');
    assert.equal(alertaLicenca(p), true);
  });

  it('mesas recebem ids distintos', () => {
    const p = salvarProduto(
      kettlebell({
        mesas: [
          { id: 'x', pecasPorMesa: 1, tempoMin: 60, impressoraId: f.imp.id, filamentos: [{ tipo: 'PLA', gramas: 20 }] },
          { id: 'x', pecasPorMesa: 1, tempoMin: 30, impressoraId: f.imp.id, filamentos: [{ tipo: 'PLA', gramas: 10 }] },
        ],
      }),
    );
    assert.equal(p.mesas[0].id, 'x');
    assert.notEqual(p.mesas[1].id, 'x');
  });
});

describe('salvarProduto — validações', () => {
  const mesa = (extra: object) => ({ pecasPorMesa: 8, tempoMin: 240, impressoraId: f.imp.id, filamentos: [{ tipo: 'PLA' as const, gramas: 64 }], ...extra });
  const casos: [string, () => DadosProduto, RegExp][] = [
    ['sem nome', () => kettlebell({ nome: '  ' }), /nome do produto/],
    ['sem mesa', () => kettlebell({ mesas: [] }), /pelo menos uma mesa/],
    ['impressora inexistente', () => kettlebell({ mesas: [mesa({ impressoraId: 'nao-existe' })] }), /impressora/],
    ['peças 0', () => kettlebell({ mesas: [mesa({ pecasPorMesa: 0 })] }), /Peças desta mesa/],
    ['peças fracionadas', () => kettlebell({ mesas: [mesa({ pecasPorMesa: 1.5 })] }), /número inteiro/],
    ['tempo 0', () => kettlebell({ mesas: [mesa({ tempoMin: 0 })] }), /tempo da mesa/],
    ['sem filamento', () => kettlebell({ mesas: [mesa({ filamentos: [] })] }), /pelo menos um filamento/],
    ['filamento inexistente', () => kettlebell({ mesas: [mesa({ filamentos: [{ materialId: 'x', gramas: 1 }] })] }), /não existe mais/],
    ['tipo inválido', () => kettlebell({ mesas: [mesa({ filamentos: [{ tipo: 'Madeira', gramas: 1 }] })] }), /tipo de filamento/],
    ['insumo como filamento', () => kettlebell({ mesas: [mesa({ filamentos: [{ materialId: f.argola.id, gramas: 1 }] })] }), /não é um filamento/],
    ['gramas negativas', () => kettlebell({ mesas: [mesa({ filamentos: [{ tipo: 'PLA', gramas: -1 }] })] }), /gramas/],
    ['gramas 0', () => kettlebell({ mesas: [mesa({ filamentos: [{ tipo: 'PLA', gramas: 0 }] })] }), /gramas de PLA/],
    ['componente com quantidade 0', () => kettlebell({ componentes: [{ materialId: f.argola.id, quantidade: 0 }] }), /maior que zero/],
    ['componente inexistente', () => kettlebell({ componentes: [{ materialId: 'x', quantidade: 1 }] }), /componente cadastrado/],
    ['filamento como componente', () => kettlebell({ componentes: [{ materialId: f.preto.id, quantidade: 1 }] }), /não é um insumo/],
    ['mão de obra negativa', () => kettlebell({ maoDeObraMin: -1 }), /mão de obra/],
    ['estoque mínimo fracionado', () => kettlebell({ estoqueMinimo: 1.5 }), /estoque mínimo/],
    ['preço negativo', () => kettlebell({ precoEtiquetaCentavos: -10 }), /preço de etiqueta/],
  ];
  for (const [nome, dados, re] of casos) {
    it(nome, () => {
      falha(() => salvarProduto(dados()), re);
      // Nada é gravado: nem produto, nem avanço do código, nem categoria nova.
      assert.equal(db.all('produtos').length, 0);
      assert.equal(db.config.proximoCodigoProduto, 1);
    });
  }
  it('sem impressora ativa pede para cadastrar uma', () => {
    db.tx((t) => t.update('impressoras', f.imp.id, { ativa: false }));
    falha(() => salvarProduto(kettlebell({ mesas: [mesa({ impressoraId: undefined })] })), /Cadastre uma impressora/);
    assert.equal(db.all('produtos').length, 0);
  });
});

describe('salvarProduto — edição', () => {
  it('mantém código, não avança a sequência e não muda o preço sozinho', () => {
    const p = salvarProduto(kettlebell({ precoEtiquetaCentavos: 1500 }));
    const editado = salvarProduto({ ...p, nome: 'Kettlebell Preto', estoqueMinimo: 10 });
    assert.equal(editado.id, p.id);
    assert.equal(editado.codigo, 'P-0001');
    assert.equal(editado.nome, 'Kettlebell Preto');
    assert.equal(editado.estoqueMinimo, 10);
    assert.equal(editado.precoEtiquetaCentavos, 1500);
    assert.equal(editado.mesas[0].id, p.mesas[0].id);
    assert.equal(db.config.proximoCodigoProduto, 2);
    assert.equal(db.all('produtos').length, 1);
  });

  it('edição inválida não altera o produto', () => {
    const p = salvarProduto(kettlebell());
    falha(() => salvarProduto({ ...p, mesas: [] }), /mesa/);
    assert.equal(db.get('produtos', p.id)?.mesas.length, 1);
  });
});

describe('produto sem cor fixa (decisão 85)', () => {
  it('a ficha guarda o tipo; um carretel informado fica só como cor sugerida', () => {
    const p = salvarProduto(kettlebell());
    assert.deepEqual(p.mesas[0].filamentos, [{ tipo: 'PLA', gramas: 64 }]);
    assert.equal(p.cor, undefined);
    const q = salvarProduto(kettlebell({ nome: 'Outro', mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: f.imp.id, filamentos: [{ materialId: f.rosa.id, gramas: 64 }] }] }));
    assert.deepEqual(q.mesas[0].filamentos, [{ tipo: 'PLA', materialId: f.rosa.id, gramas: 64 }]);
  });

  it('o custo do filamento é a média do kg dos carretéis ativos do tipo', () => {
    const p = salvarProduto(kettlebell());
    assert.equal(custoProduto(p.id), 2.4873);
    // Rosa passa a R$ 120/kg: média (100 + 120) ÷ 2 = R$ 110/kg → material R$ 0,88 por peça.
    db.tx((t) => t.update('materiais', f.rosa.id, { custoMedio: 120 }));
    assert.equal(custoProduto(p.id), 2.5753);
    // Carretel arquivado sai da média.
    db.tx((t) => t.update('materiais', f.rosa.id, { arquivado: true }));
    assert.equal(custoProduto(p.id), 2.4873);
  });

  it('sem carretel do tipo, a prévia avisa para cadastrar um', () => {
    const p = previaCusto({ mesas: [{ pecasPorMesa: 1, tempoMin: 60, impressoraId: f.imp.id, filamentos: [{ tipo: 'PETG', gramas: 10 }] }], componentes: [], maoDeObraMin: 2 });
    assert.ok(p.composicao.avisos.some((a) => /Cadastre um filamento PETG/.test(a)));
  });

  it('sem impressora e sem categoria: a primeira impressora ativa e a categoria do último produto', () => {
    salvarProduto(kettlebell({ categoria: 'Brinde' }));
    const p = salvarProduto(kettlebell({ nome: 'Sem detalhes', categoria: undefined, mesas: [{ pecasPorMesa: 1, tempoMin: 30, filamentos: [{ tipo: 'PLA', gramas: 10 }] }] }));
    assert.equal(p.mesas[0].impressoraId, f.imp.id);
    assert.equal(p.categoria, 'Brinde');
  });
});

describe('arquivarProduto', () => {
  it('arquiva e reativa sem apagar', () => {
    const p = salvarProduto(kettlebell());
    assert.equal(arquivarProduto(p.id).arquivado, true);
    assert.equal(produtosAtivos().length, 0);
    assert.equal(db.all('produtos').length, 1);
    assert.equal(arquivarProduto(p.id, false).arquivado, false);
    assert.equal(produtosAtivos().length, 1);
    falha(() => arquivarProduto('x'), /não encontrado/);
  });
});

describe('alertaLicenca', () => {
  it('só para modelo de terceiro sem licença de venda', () => {
    assert.equal(alertaLicenca({ origemModelo: 'proprio' }), false);
    assert.equal(alertaLicenca({ origemModelo: 'proprio', licencaVenda: 'nao' }), false);
    assert.equal(alertaLicenca({ origemModelo: 'terceiro', licencaVenda: 'sim' }), false);
    assert.equal(alertaLicenca({ origemModelo: 'terceiro', licencaVenda: 'nao' }), true);
    assert.equal(alertaLicenca({ origemModelo: 'terceiro', licencaVenda: 'nao_sei' }), true);
    assert.equal(alertaLicenca({ origemModelo: 'terceiro' }), true);
  });
});

describe('previaCusto — Exemplo A', () => {
  const ficha = () => ({
    mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: f.imp.id, filamentos: [{ tipo: 'PLA' as const, gramas: 64 }] }],
    componentes: [
      { materialId: f.argola.id, quantidade: 1 },
      { materialId: f.saquinho.id, quantidade: 1 },
    ],
    maoDeObraMin: 2,
  });

  it('composição, custo e preços sugeridos por canal', () => {
    const p = previaCusto(ficha());
    assert.ok(Math.abs(p.composicao.material - 0.8) < 1e-9);
    assert.ok(Math.abs(p.composicao.energia - 0.04) < 1e-9);
    assert.ok(Math.abs(p.composicao.maquina - 0.3) < 1e-9);
    assert.ok(Math.abs(p.composicao.impressao - 1.254) < 1e-9);
    assert.ok(Math.abs(p.composicao.componentes - 0.4) < 1e-9);
    assert.equal(p.custoUnit, 2.4873);
    assert.equal(p.erro, null);
    const esperado: Record<ID, [number, number]> = {
      direto_pix: [4.9747, 590],
      direto_cartao: [5.1819, 590],
      parceiro_80_20: [6.2183, 690],
      parceiro_70_30: [7.1067, 790],
    };
    assert.equal(p.sugestoes.length, 4); // Marketplace desligado
    for (const s of p.sugestoes) {
      const [exato, cents] = esperado[s.canal.id];
      assert.equal(Math.round((s.exato ?? 0) * 10000) / 10000, exato, s.canal.id);
      assert.equal(s.centavos, cents, s.canal.id);
      assert.equal(s.erro, null);
    }
    assert.equal(p.etiquetaSugeridaCentavos, 790);
    assert.equal(p.simulacao, null);
    assert.equal(p.status, null);
  });

  it('simulação com etiqueta R$ 15,00', () => {
    const p = previaCusto(ficha(), 1500);
    const tabela: Record<ID, [number, number, number]> = {
      direto_pix: [1500, 1251, 83.4],
      direto_cartao: [1440, 1191, 82.7],
      parceiro_80_20: [1200, 951, 79.3],
      parceiro_70_30: [1050, 801, 76.3],
    };
    assert.ok(p.simulacao);
    for (const l of p.simulacao.linhas) {
      const [rec, lucro, margem] = tabela[l.canal.id];
      assert.equal(toCents(l.recebido), rec);
      assert.equal(toCents(l.lucro), lucro);
      assert.equal(Math.round(l.margemPct * 10) / 10, margem);
    }
    assert.equal(p.status, 'ok');
  });

  it('margem ≥ 100% bloqueia a sugestão com explicação', () => {
    db.tx((t) => t.config((c) => ({ ...c, custos: { ...c.custos, margemDesejadaPct: 100 } })));
    const p = previaCusto(ficha());
    assert.match(p.erro ?? '', /100% ou mais/);
    assert.equal(p.etiquetaSugeridaCentavos, null);
    assert.ok(p.sugestoes.every((s) => s.centavos == null && s.erro));
  });

  it('ficha incompleta não quebra a prévia (avisos)', () => {
    // Sem impressora vale a primeira ativa; PETG sem carretel cadastrado vira aviso, sem quebrar o cálculo.
    const p = previaCusto({ mesas: [{ pecasPorMesa: 1, tempoMin: 60, impressoraId: '', filamentos: [{ tipo: 'PETG', gramas: 10 }] }], componentes: [], maoDeObraMin: 2 });
    assert.ok(p.composicao.avisos.length > 0);
    assert.ok(Number.isFinite(p.custoUnit));
  });
});
