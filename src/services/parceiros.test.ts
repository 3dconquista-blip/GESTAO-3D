// Etapa C (decisões 93 e 94): "Levar peças" com Desfazer e o acerto final que já encerra a parceria.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { saldoCasa, saldoNoParceiro } from '../data/selectors.ts';
import { passoDoRascunho } from '../domain/acerto.ts';
import { carregarExemplo, DATA_VISITA_BC } from './exemplo.ts';
import { concluirAcerto, montarRascunho, podeReabrir, reabrirUltimoAcerto, sugerir } from './acertos.ts';
import { salvarExpositor } from './expositores.ts';
import { desfazerRemessa, instalar, reposicaoAvulsa, salvarParceiro } from './parceiros.ts';

const parceiro = (nome: string) => db.all('parceiros').find((p) => p.nome === nome)!;
const produto = (nome: string) => db.all('produtos').find((p) => p.nome === nome)!;

beforeEach(() => {
  db.resetar();
  carregarExemplo();
});

describe('levar peças com Desfazer', () => {
  it('reposição: as peças voltam para Casa e o mix volta ao de antes', () => {
    const alfa = parceiro('Academia Alfa');
    const display = produto('Display PIX');
    const kb = produto('Chaveiro Kettlebell');
    const antes = { casa: saldoCasa(kb.id), noParceiro: saldoNoParceiro(kb.id, alfa.id), mix: alfa.mix.map((m) => ({ ...m })) };
    const res = reposicaoAvulsa({ parceiroId: alfa.id, itens: [{ produtoId: kb.id, quantidade: 2 }, { produtoId: display.id, quantidade: 1 }] });
    assert.ok(parceiro('Academia Alfa').mix.some((m) => m.produtoId === display.id), 'produto levado entra no mix');
    desfazerRemessa({ parceiroId: alfa.id, lote: res.lote, mixAnterior: antes.mix, instaladoEmAnterior: alfa.instaladoEm });
    assert.equal(saldoCasa(kb.id), antes.casa);
    assert.equal(saldoNoParceiro(kb.id, alfa.id), antes.noParceiro);
    assert.equal(saldoNoParceiro(display.id, alfa.id), 0);
    assert.deepEqual(parceiro('Academia Alfa').mix, antes.mix);
    assert.throws(() => desfazerRemessa({ parceiroId: alfa.id, lote: res.lote, mixAnterior: antes.mix }), /já foi desfeito/);
  });

  it('instalação: desfazer leva o expositor de volta para Casa e o parceiro volta a "sem instalação"', () => {
    const p = salvarParceiro({ nome: 'Loja Gama', tipo: 'loja', pctParceiro: 30, frequenciaDias: 15, quemRecebe: 'parceiro', dataInicio: DATA_VISITA_BC, termoAssinado: false });
    const exp = salvarExpositor({ codigo: 'EXP-03', modelo: '', capacidade: 10, custoCentavos: 5000 });
    const kb = produto('Chaveiro Kettlebell');
    const casa = saldoCasa(kb.id);
    const res = instalar({ parceiroId: p.id, expositorIds: [exp.id], itens: [{ produtoId: kb.id, quantidade: 3 }], data: DATA_VISITA_BC });
    assert.equal(parceiro('Loja Gama').instaladoEm, DATA_VISITA_BC);
    assert.equal(db.get('expositores', exp.id)?.parceiroId, p.id);
    desfazerRemessa({ parceiroId: p.id, lote: res.lote, mixAnterior: [], instaladoEmAnterior: undefined, expositorIds: [exp.id] });
    assert.equal(parceiro('Loja Gama').instaladoEm, undefined);
    assert.deepEqual(parceiro('Loja Gama').mix, []);
    assert.equal(db.get('expositores', exp.id)?.parceiroId ?? null, null);
    assert.equal(saldoCasa(kb.id), casa);
  });
});

describe('acerto final', () => {
  it('ao concluir, recolhe tudo, encerra a parceria e leva os expositores para Casa (sem reabrir)', () => {
    const alfa = parceiro('Academia Alfa');
    let r = montarRascunho(alfa.id, DATA_VISITA_BC, { final: true });
    r = sugerir({ ...r, linhas: r.linhas.map((l) => ({ ...l, contei: l.esperado })) });
    const a = concluirAcerto(r);
    assert.equal(a.final, true);
    assert.equal(parceiro('Academia Alfa').situacao, 'encerrado');
    assert.ok(db.all('expositores').every((e) => e.parceiroId !== alfa.id));
    for (const l of r.linhas) assert.equal(saldoNoParceiro(l.produtoId, alfa.id), 0);
    assert.equal(podeReabrir(a.id), false);
    assert.throws(() => reabrirUltimoAcerto(alfa.id), /não pode ser reaberto/);
  });
});

describe('acerto em 3 passos', () => {
  it('rascunhos antigos de 5 passos são convertidos', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((passo) => passoDoRascunho({ passo })), [1, 1, 3, 2, 3]);
    assert.deepEqual([1, 2, 3].map((passo) => passoDoRascunho({ passo, passos3: true })), [1, 2, 3]);
    assert.equal(montarRascunho(parceiro('Loja Beta').id, DATA_VISITA_BC).passos3, true);
  });
});
