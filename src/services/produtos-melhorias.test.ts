// Melhorias de 19/10/2026 sobre os dados de exemplo: copiar produto com um clique, excluir produto mantendo o
// histórico, margem de lucro própria do produto e edição em massa.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, nomeProduto, produtosAtivos, saldoCasa, statusMargemProduto } from '../data/selectors.ts';
import { CASA } from '../data/types.ts';
import { custosComMargem } from '../domain/pricing.ts';
import { lancarMov } from './estoque.ts';
import { carregarExemplo } from './exemplo.ts';
import {
  arquivarProduto,
  copiarProduto,
  editarProdutosEmMassa,
  excluirProduto,
  excluirProdutos,
  nomeDaCopia,
  previaCusto,
  previaExclusao,
  salvarProduto,
} from './produtos.ts';

const produto = (nome: string) => db.all('produtos').find((p) => p.nome === nome)!;
const KB = 'Chaveiro Kettlebell';

/** Põe peças em Casa (produção) sem mexer em materiais. */
function produzir(produtoId: string, quantidade: number) {
  db.tx((t) => lancarMov(t, { data: '2026-10-18', produtoId, quantidade, origem: null, destino: CASA, tipo: 'producao' }));
}

beforeEach(() => {
  db.resetar();
  carregarExemplo();
});

describe('copiar produto (um clique)', () => {
  it('copia tudo, com "cópia" entre aspas no nome, código novo e estoque zerado', () => {
    const orig = produto(KB);
    const c = copiarProduto(orig.id);
    assert.equal(c.nome, `${KB} "cópia"`);
    assert.notEqual(c.codigo, orig.codigo);
    assert.notEqual(c.id, orig.id);
    for (const campo of ['modelo', 'cor', 'categoria', 'precoEtiquetaCentavos', 'estoqueMinimo', 'maoDeObraMin', 'origemModelo'] as const) {
      assert.equal(c[campo], orig[campo], campo);
    }
    assert.deepEqual(
      c.mesas.map(({ id: _i, ...m }) => m),
      orig.mesas.map(({ id: _i, ...m }) => m),
    );
    assert.deepEqual(c.componentes, orig.componentes);
    assert.equal(custoProduto(c.id), custoProduto(orig.id));
    assert.equal(saldoCasa(c.id), 0);
    assert.equal(c.arquivado, false);
  });

  it('copiar de novo numera: "cópia 2", "cópia 3"', () => {
    const orig = produto(KB);
    copiarProduto(orig.id);
    assert.equal(copiarProduto(orig.id).nome, `${KB} "cópia 2"`);
    assert.equal(copiarProduto(orig.id).nome, `${KB} "cópia 3"`);
    assert.equal(nomeDaCopia('Vaso', ['vaso "CÓPIA"']), 'Vaso "cópia 2"');
  });

  it('a margem própria também é copiada', () => {
    const orig = salvarProduto({ ...produto(KB), margemPct: 60 });
    assert.equal(copiarProduto(orig.id).margemPct, 60);
  });
});

describe('margem de lucro do produto', () => {
  it('muda os preços sugeridos só deste produto (Exemplo A: 50% → etiqueta R$ 7,90; 60% → R$ 8,90)', () => {
    const kb = produto(KB);
    assert.equal(previaCusto(kb, null).etiquetaSugeridaCentavos, 790);
    const p60 = previaCusto(kb, null, 60);
    assert.equal(p60.etiquetaSugeridaCentavos, 890);
    assert.equal(p60.sugestoes.find((s) => s.canal.id === 'direto_pix')?.centavos, 690); // 2,4873 ÷ 0,4 = 6,22 → 6,90
    salvarProduto({ ...kb, margemPct: 60 });
    assert.equal(produto(KB).margemPct, 60);
    assert.equal(produto('Chaveiro Halter').margemPct, undefined);
  });

  it('a cor da margem usa a margem do produto', () => {
    const kb = produto(KB);
    // Etiqueta 15,00: pior canal (70/30) recebe 10,50 e lucra 8,01 = 76,3%.
    assert.equal(statusMargemProduto(kb), 'ok');
    salvarProduto({ ...kb, margemPct: 80 });
    assert.equal(statusMargemProduto(produto(KB)), 'atencao');
  });

  it('vazio volta à margem padrão; fora de 0% a 99% é recusado', () => {
    const kb = salvarProduto({ ...produto(KB), margemPct: 40 });
    assert.equal(salvarProduto({ id: kb.id, nome: kb.nome, categoria: kb.categoria, mesas: kb.mesas, margemPct: null }).margemPct, undefined);
    assert.throws(() => salvarProduto({ ...kb, margemPct: 100 }), /margem de lucro/);
    assert.throws(() => salvarProduto({ ...kb, margemPct: -1 }), /margem de lucro/);
  });

  it('margem menor que a mínima de alerta baixa a mínima junto', () => {
    const c = custosComMargem(db.config.custos, 20);
    assert.equal(c.margemDesejadaPct, 20);
    assert.equal(c.margemMinimaPct, 20);
    assert.equal(custosComMargem(db.config.custos, null), db.config.custos);
  });
});

describe('excluir produto', () => {
  it('bloqueia enquanto houver peças em parceiros', () => {
    const kb = produto(KB);
    const pr = previaExclusao(kb.id);
    assert.match(pr.bloqueio ?? '', /Academia Alfa/);
    assert.throws(() => excluirProduto(kb.id), /parceiros/);
    assert.equal(produto(KB).excluido, undefined);
  });

  it('tira as peças de Casa com ajuste, sai do mix, some das listas e mantém o histórico', () => {
    const c = copiarProduto(produto(KB).id);
    produzir(c.id, 5);
    const alfa = db.all('parceiros').find((p) => p.nome === 'Academia Alfa')!;
    db.tx((t) => t.update('parceiros', alfa.id, { mix: [...alfa.mix, { produtoId: c.id, nivelIdeal: 4 }] }));
    const movsAntes = db.all('movEstoque').filter((m) => m.produtoId === c.id).length;

    const pr = previaExclusao(c.id);
    assert.equal(pr.bloqueio, null);
    assert.equal(pr.emCasa, 5);
    assert.deepEqual(pr.mixes, ['Academia Alfa']);

    const ex = excluirProduto(c.id, '2026-10-19');
    assert.equal(ex.excluido, true);
    assert.equal(ex.excluidoEm, '2026-10-19');
    assert.equal(saldoCasa(c.id), 0);
    const movs = db.all('movEstoque').filter((m) => m.produtoId === c.id);
    assert.equal(movs.length, movsAntes + 1);
    const ajuste = movs.find((m) => m.refTipo === 'exclusao')!;
    assert.deepEqual([ajuste.tipo, ajuste.quantidade, ajuste.origem, ajuste.destino, ajuste.motivo], ['ajuste', 5, CASA, null, 'Produto excluído']);
    assert.ok(!db.get('parceiros', alfa.id)!.mix.some((m) => m.produtoId === c.id));
    assert.ok(!produtosAtivos().some((p) => p.id === c.id));
    assert.equal(nomeProduto(c.id), `${c.nome} (excluído)`);
  });

  it('produto excluído não volta, não é editado nem copiado', () => {
    const c = copiarProduto(produto(KB).id);
    excluirProduto(c.id);
    assert.throws(() => arquivarProduto(c.id, false), /excluído/);
    assert.throws(() => salvarProduto({ ...db.get('produtos', c.id)!, nome: 'Outro' }), /excluído/);
    assert.throws(() => copiarProduto(c.id), /não encontrado/);
    assert.throws(() => excluirProduto(c.id), /não encontrado/);
  });

  it('em lote é tudo ou nada', () => {
    const a = copiarProduto(produto(KB).id);
    const kb = produto(KB); // tem peças na Academia Alfa
    assert.throws(() => excluirProdutos([a.id, kb.id]));
    assert.equal(db.get('produtos', a.id)!.excluido, undefined);
    const b = copiarProduto(produto(KB).id);
    assert.equal(excluirProdutos([a.id, b.id]), 2);
  });
});

describe('edição em massa', () => {
  const dois = () => [produto(KB).id, produto('Chaveiro Halter').id];

  it('categoria, mínimo, margem e reajuste de preço em vários produtos de uma vez', () => {
    const r = editarProdutosEmMassa(dois(), { categoria: 'Display', estoqueMinimo: 7, margemPct: 60, preco: { modo: 'percentual', pct: 10 } });
    assert.equal(r.length, 2);
    for (const nome of [KB, 'Chaveiro Halter']) {
      const p = produto(nome);
      assert.equal(p.categoria, 'Display');
      assert.equal(p.estoqueMinimo, 7);
      assert.equal(p.margemPct, 60);
    }
    assert.equal(produto(KB).precoEtiquetaCentavos, 1690); // 15,00 + 10% = 16,50 → 16,90
    assert.equal(produto('Chaveiro Halter').precoEtiquetaCentavos, 1390); // 12,00 + 10% = 13,20 → 13,90
    assert.equal(produto('Chaveiro Anilha').categoria, 'Chaveiro');
  });

  it('preço sugerido usa a margem de cada produto; "mesmo valor" iguala tudo', () => {
    editarProdutosEmMassa(dois(), { margemPct: 60, preco: { modo: 'sugerido' } });
    assert.equal(produto(KB).precoEtiquetaCentavos, 890);
    editarProdutosEmMassa(dois(), { margemPct: null, preco: { modo: 'sugerido' } });
    assert.equal(produto(KB).margemPct, undefined);
    assert.equal(produto(KB).precoEtiquetaCentavos, 790);
    editarProdutosEmMassa(dois(), { preco: { modo: 'definir', centavos: 1200 } });
    assert.equal(produto('Chaveiro Halter').precoEtiquetaCentavos, 1200);
  });

  it('arquivar e reativar em lote', () => {
    editarProdutosEmMassa(dois(), { arquivado: true });
    assert.ok(produto(KB).arquivado && produto('Chaveiro Halter').arquivado);
    editarProdutosEmMassa(dois(), { arquivado: false });
    assert.equal(produto(KB).arquivado, false);
  });

  it('valor inválido não muda nada (tudo ou nada)', () => {
    assert.throws(() => editarProdutosEmMassa(dois(), { categoria: 'Display', estoqueMinimo: -1 }), /mínimo/);
    assert.throws(() => editarProdutosEmMassa(dois(), { margemPct: 100 }), /margem/);
    assert.throws(() => editarProdutosEmMassa(dois(), { preco: { modo: 'percentual', pct: -100 } }), /reajuste/i);
    assert.throws(() => editarProdutosEmMassa([], { estoqueMinimo: 1 }), /Selecione/);
    assert.equal(produto(KB).categoria, 'Chaveiro');
  });
});
