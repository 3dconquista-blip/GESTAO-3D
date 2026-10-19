// Critério de aceite da Etapa 5 (seção 15): "o resultado do mês soma os exemplos sem contar nada duas vezes,
// e um backup exportado e importado num banco vazio reproduz os mesmos números".
// Outubro/2026 sobre os dados de exemplo: acerto anterior da Academia Alfa (01/10), Exemplos B e C (16/10),
// Exemplo D entregue (21/10) e uma venda direta no cartão (17/10).
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, saldoMaterial, saldosEstoque } from '../data/selectors.ts';
import type { LinhaRascunho, RascunhoAcerto } from '../domain/acerto.ts';
import { toCents } from '../lib/money.ts';
import { concluirAcerto, montarRascunho, sugerir } from './acertos.ts';
import { exportarBackup, importarBackup } from './backup.ts';
import { carregarExemplo, DATA_VISITA_BC } from './exemplo.ts';
import { csvPlanilha, PLANILHAS } from './exportacao.ts';
import { duplicarOrcamento, moverEtapa } from './pedidos.ts';
import {
  resumoDoAno,
  csvCanais,
  csvResultado,
  dinheiroDoPeriodo,
  movimentoDinheiro,
  painelInicio,
  parceirosDoPeriodo,
  produtosDoPeriodo,
  produtosParados,
  resultadoDoMes,
  resultadoDoPeriodo,
} from './relatorios.ts';
import { cancelarVenda, registrarVenda } from './vendas.ts';

const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31' };
const parceiro = (nome: string) => db.all('parceiros').find((p) => p.nome === nome)!;
const produto = (nome: string) => db.all('produtos').find((p) => p.nome === nome)!;
const pedido1 = () => db.all('pedidos').find((p) => p.numero === 1)!;

function contar(r: RascunhoAcerto, contagem: Record<string, Partial<LinhaRascunho>>): RascunhoAcerto {
  return sugerir({
    ...r,
    linhas: r.linhas.map((l) => {
      const nome = db.get('produtos', l.produtoId)!.nome;
      return contagem[nome] ? { ...l, ...contagem[nome] } : l;
    }),
  });
}

/** Faz B, C, D e uma venda direta de 2 Kettlebell Preto a R$ 15,00 no cartão (taxa 4% = R$ 1,20). */
function mesDeOutubro() {
  let b = montarRascunho(parceiro('Academia Alfa').id, DATA_VISITA_BC);
  b = contar(b, { 'Chaveiro Kettlebell Preto': { contei: 4 }, 'Chaveiro Anilha Vermelha': { contei: 5 }, 'Chaveiro Halter Cinza': { contei: 6 } });
  concluirAcerto({ ...b, pagamento: { valorCentavos: 8820, forma: 'pix', data: DATA_VISITA_BC } });

  let c = montarRascunho(parceiro('Loja Beta').id, DATA_VISITA_BC);
  c = contar(c, { 'Chaveiro Kettlebell Rosa': { contei: 5, avariados: 1 }, 'Display PIX': { contei: 2 } });
  concluirAcerto({ ...c, pixDiretoCentavos: 3000, pixEditado: true, pagamento: { valorCentavos: 5000, forma: 'pix', data: DATA_VISITA_BC } });

  const d = pedido1();
  moverEtapa(d.id, 'aprovado', { data: '2026-10-17', sinal: { valorCentavos: 5895, forma: 'pix' } });
  moverEtapa(d.id, 'producao', { data: '2026-10-18' });
  moverEtapa(d.id, 'pronto', { data: '2026-10-20' });
  moverEtapa(d.id, 'entregue', { data: '2026-10-21', pagamentoSaldo: { valorCentavos: 5895, forma: 'pix' } });

  registrarVenda({
    itens: [{ produtoId: produto('Chaveiro Kettlebell Preto').id, quantidade: 2, precoUnitCentavos: 1500 }],
    forma: 'cartao',
    canal: 'feira',
    data: '2026-10-17',
  });
}

describe('Etapa 5 — resultado de outubro soma os exemplos sem contar nada duas vezes', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
    mesDeOutubro();
  });

  it('receita, custo, perdas, custos fixos e lucro batem com a soma feita à mão', () => {
    const r = resultadoDoMes('2026-10');
    const kb = custoProduto(produto('Chaveiro Kettlebell Preto').id);
    const display = custoProduto(produto('Display PIX').id);
    assert.equal(kb, 2.4873);

    // Receita = o que fica com o dono.
    assert.equal(r.receitaPorCanal.direta, 3000 - 120); // venda − taxa do cartão
    assert.equal(r.receitaPorCanal.parceiros, 5880 + 8820 + 11200); // sua parte: 01/10, B e C
    assert.equal(r.receitaPorCanal.pedidos, 11790); // pedido entregue (sinal e saldo NÃO somam de novo)
    assert.equal(r.receitaCentavos, 2880 + 25900 + 11790);
    assert.equal(r.totalVendidoParceirosCentavos, 8400 + 12600 + 14000);
    assert.equal(r.taxasCartaoCentavos, 120);

    // Custo dos produtos vendidos: snapshots de cada venda, acerto e pedido.
    const cmvDireta = toCents(2 * kb);
    const cmvParceiros = toCents((6 + 9 + 7) * kb + 1 * display); // 01/10: 4 + 2; B: 6 + 3; C: 7 Rosa + 1 Display
    const cmvPedido = toCents(38.8367 + 40); // custo de produção + modelagem (Exemplo D)
    assert.equal(r.cmvCentavos, cmvDireta + cmvParceiros + cmvPedido);

    // Perdas: só a avaria do Exemplo C (a falha da produção G já está no custo).
    assert.equal(r.perdasCentavos, toCents(kb));
    assert.equal(r.perdas.linhas.length, 1);

    const fixos = db.config.custos.custosFixosMensaisCentavos;
    assert.equal(r.custosFixosCentavos, fixos);
    assert.equal(r.lucroCentavos, r.receitaCentavos - r.cmvCentavos - toCents(kb) - fixos);

    // Pedido D isolado: lucro do Exemplo D (R$ 39,06).
    const ped = r.canais.find((c) => c.canal === 'pedidos')!;
    assert.equal(ped.lucroCentavos, 3906);
  });

  it('as linhas por canal, produto e parceiro fecham com o total', () => {
    const r = resultadoDoPeriodo(OUTUBRO);
    assert.equal(r.canais.reduce((s, c) => s + c.receitaCentavos, 0), r.receitaCentavos);
    assert.equal(r.direta.reduce((s, c) => s + c.receitaCentavos, 0), r.receitaPorCanal.direta);
    assert.equal(r.direta.find((c) => c.canal === 'feira')!.receitaCentavos, 2880);

    const prods = produtosDoPeriodo(OUTUBRO);
    assert.equal(prods.reduce((s, l) => s + l.receitaCentavos, 0), r.receitaPorCanal.direta + r.receitaPorCanal.parceiros);
    const kbPreto = prods.find((l) => l.produtoId === produto('Chaveiro Kettlebell Preto').id)!;
    assert.deepEqual([kbPreto.unidadesDireta, kbPreto.unidadesParceiros], [2, 4 + 6]);

    const parcs = parceirosDoPeriodo(OUTUBRO);
    const alfa = parcs.find((l) => l.parceiroId === parceiro('Academia Alfa').id)!;
    const beta = parcs.find((l) => l.parceiroId === parceiro('Loja Beta').id)!;
    assert.deepEqual([alfa.quantidade, alfa.receitaCentavos, alfa.vendidoCentavos, alfa.aReceberCentavos], [2, 14700, 21000, 0]);
    assert.deepEqual([beta.quantidade, beta.receitaCentavos, beta.pixDiretoCentavos, beta.aReceberCentavos], [1, 11200, 3000, 3200]);
    // Giro do Exemplo B: 9 vendidas de 24 no acerto de 16/10 (o de 01/10 tinha 24 e vendeu 6).
    assert.equal(alfa.esperado, 48);
    assert.equal(alfa.unidades, 15);
  });

  it('dinheiro que entrou: pagamentos pela data (sinal e saldo separados) + PIX no expositor', () => {
    const d = dinheiroDoPeriodo(OUTUBRO);
    assert.equal(d.porOrigem.venda, 3000);
    assert.equal(d.porOrigem.acerto, 5880 + 8820 + 5000);
    assert.equal(d.porOrigem.pedido, 5895 + 5895);
    assert.equal(d.pixExpositorCentavos, 3000);
    assert.equal(d.totalCentavos, 3000 + 19700 + 11790 + 3000);
    assert.equal(d.taxasCartaoCentavos, 120);
    const linhas = movimentoDinheiro(OUTUBRO).filter((l) => l.entraNoTotal);
    assert.equal(linhas.reduce((s, l) => s + l.valorCentavos, 0), d.totalCentavos);
  });

  it('venda cancelada sai da receita e o estorno desconta do dinheiro que entrou', () => {
    const v = db.all('vendas')[0];
    cancelarVenda(v.id, 'Cliente desistiu', '2026-10-18');
    const r = resultadoDoMes('2026-10');
    assert.equal(r.receitaPorCanal.direta, 0);
    assert.equal(dinheiroDoPeriodo(OUTUBRO).porOrigem.venda, 0);
  });

  it('pedido cancelado com sinal retido: o valor retido é receita e o material gasto vira perda', () => {
    const antes = resultadoDoMes('2026-10');
    const novo = duplicarOrcamento(pedido1().id, '2026-10-22');
    moverEtapa(novo.id, 'aprovado', { data: '2026-10-22', sinal: { valorCentavos: 5895, forma: 'pix' } });
    moverEtapa(novo.id, 'pronto', { data: '2026-10-24' });
    moverEtapa(novo.id, 'cancelado', { data: '2026-10-25', motivo: 'Desistiu', destinoSinal: 'reter' });
    const r = resultadoDoMes('2026-10');
    assert.equal(r.receitaPorCanal.pedidos - antes.receitaPorCanal.pedidos, 5895);
    assert.equal(r.cmvCentavos, antes.cmvCentavos);
    // 120 g de PLA Branco a R$ 100,00/kg + 20 argolas a R$ 0,30.
    assert.equal(r.perdasCentavos - antes.perdasCentavos, 1200 + 600);
  });

  it('Início: este mês × mês anterior, 6 meses, top 5 e a receber', () => {
    const p = painelInicio('2026-10-25');
    assert.equal(p.mes.atual.receitaCentavos, resultadoDoMes('2026-10').receitaCentavos);
    assert.equal(p.mes.anterior.receitaCentavos, 0);
    assert.equal(p.serie.length, 6);
    assert.equal(p.serie[5].mes, '2026-10');
    assert.equal(p.serie[5].direta + p.serie[5].parceiros + p.serie[5].pedidos, p.mes.atual.receitaCentavos);
    assert.equal(p.topProdutos[0].produtoId, produto('Chaveiro Kettlebell Preto').id);
    assert.equal(p.topParceiros[0].parceiroId, parceiro('Academia Alfa').id);
    assert.equal(p.hoje.aReceber.parceirosCentavos, 3200);
    assert.equal(p.hoje.aReceber.pedidosCentavos, 0);
    assert.equal(resumoDoAno(2026, '2026-10-25').receita.receitaCentavos, p.mes.atual.receitaCentavos);
  });

  it('produtos parados: com estoque e sem venda no período', () => {
    const parados = produtosParados(OUTUBRO).map((x) => x.produto.nome);
    assert.ok(parados.includes('Chaveiro Halter Cinza'));
    assert.ok(!parados.includes('Chaveiro Kettlebell Preto'));
  });

  it('CSV do resultado e por canal: ";" e vírgula decimal, prontos para o Excel', () => {
    const r = csvResultado(OUTUBRO).texto;
    assert.match(r, /^﻿/);
    assert.match(r, /Receita - parceiros \(sua parte\);259,00\r\n/);
    assert.match(r, /Receita - pedidos;117,90\r\n/);
    const c = csvCanais(OUTUBRO).texto;
    assert.match(c, /Venda direta - Feira;1;2;30,00;1,20;28,80;/);
    assert.match(c, /Total;/);
  });

  it('backup exportado e importado num banco vazio reproduz os mesmos números', async () => {
    const outubro = resultadoDoMes('2026-10');
    const setembro = resultadoDoMes('2026-09');
    const dinheiro = dinheiroDoPeriodo(OUTUBRO);
    const saldos = JSON.stringify(Array.from(saldosEstoque(), ([id, m]) => [id, Array.from(m)]).sort());
    const materiais = db.all('materiais').map((m) => [m.nome, saldoMaterial(m.id), m.custoMedio]);
    const planilhas = PLANILHAS.map((p) => csvPlanilha(p.id));

    const json = await exportarBackup();
    db.resetar();
    assert.equal(db.all('vendas').length, 0);
    assert.equal(resultadoDoMes('2026-10').receitaCentavos, 0);

    await importarBackup(json);
    assert.deepEqual(resultadoDoMes('2026-10'), outubro);
    assert.deepEqual(resultadoDoMes('2026-09'), setembro);
    assert.deepEqual(dinheiroDoPeriodo(OUTUBRO), dinheiro);
    assert.equal(JSON.stringify(Array.from(saldosEstoque(), ([id, m]) => [id, Array.from(m)]).sort()), saldos);
    assert.deepEqual(db.all('materiais').map((m) => [m.nome, saldoMaterial(m.id), m.custoMedio]), materiais);
    assert.deepEqual(PLANILHAS.map((p) => csvPlanilha(p.id)), planilhas);
  });
});
