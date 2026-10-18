// Dados de exemplo (seção 16) e Exemplo A sobre eles; backup exportado e importado.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { custoProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import { configPadrao } from '../data/defaults.ts';
import { etiquetaSugerida, precoSugerido, simular } from '../domain/pricing.ts';
import { pecasPorMesas } from '../domain/consumo.ts';
import { toCents } from '../lib/money.ts';
import { apagarExemplo, carregarExemplo, contagemExemplo, DATA_PRODUCAO_G } from './exemplo.ts';
import { registrarProducao } from './producao.ts';
import { exportarBackup, importarBackup, validarBackup } from './backup.ts';

const produto = (nome: string) => db.all('produtos').find((p) => p.nome === nome)!;

describe('dados de exemplo — etapa 1', () => {
  beforeEach(() => db.resetar());

  it('carrega impressoras, materiais e produtos marcados como exemplo', () => {
    const r = carregarExemplo();
    assert.deepEqual(r, { impressoras: 2, materiais: 7, produtos: 5 });
    assert.equal(db.config.onboardingConcluido, true);
    assert.equal(db.config.custos.taxaCartaoPct, 4);
    assert.equal(db.config.canais.find((c) => c.tipo === 'cartao')!.comissaoPct, 4);
    for (const m of db.all('materiais')) assert.equal(m.exemplo, true);
    const pla = db.all('materiais').find((m) => m.nome === 'PLA Preto')!;
    assert.equal(pla.custoMedio, 100);
    const rosa = db.all('materiais').find((m) => m.nome === 'PLA Rosa')!;
    // 1.000 g comprados − 24 Kettlebell Rosa (3 mesas × 64 g) produzidos em setembro.
    assert.equal(saldoMaterial(rosa.id), 1000 - 192);
    assert.equal(db.all('parceiros').length, 2);
    assert.equal(db.all('expositores').length, 2);
    assert.equal(db.all('acertos').length, 1);
    for (const m of db.all('materiais')) assert.ok(saldoMaterial(m.id) >= 0, `${m.nome} não pode ficar negativo`);
    const argola = db.all('materiais').find((m) => m.nome === 'Argola')!;
    assert.equal(argola.custoMedio, 0.3);
    assert.equal(produto('Display PIX').mesas.length, 2);
    assert.throws(() => carregarExemplo());
  });

  it('Exemplo A sobre os dados de exemplo', () => {
    carregarExemplo();
    const kb = produto('Chaveiro Kettlebell Preto');
    const cu = custoProduto(kb.id);
    assert.equal(cu, 2.4873);
    const { canais, custos } = db.config;
    const sug = Object.fromEntries(
      canais.filter((c) => c.ativo).map((c) => {
        const s = precoSugerido(cu, c, custos);
        return [c.id, 'erro' in s ? null : s.centavos];
      }),
    );
    assert.deepEqual(sug, { direto_pix: 590, direto_cartao: 590, parceiro_80_20: 690, parceiro_70_30: 790 });
    assert.equal(etiquetaSugerida(cu, canais, custos), 790);
    const s = simular(1500, cu, canais, custos);
    const linha = (id: string) => s.linhas.find((l) => l.canal.id === id)!;
    assert.deepEqual([toCents(linha('direto_cartao').recebido), toCents(linha('direto_cartao').lucro), Math.round(linha('direto_cartao').margemPct * 10) / 10], [1440, 1191, 82.7]);
    assert.deepEqual([toCents(linha('parceiro_70_30').recebido), toCents(linha('parceiro_70_30').lucro)], [1050, 801]);
  });

  it('Exemplo G nos dados de exemplo: 15 boas em Casa, −128 g de PLA Preto, −15 argolas, −15 saquinhos', () => {
    carregarExemplo();
    const kb = produto('Chaveiro Kettlebell Preto');
    const prod = db.all('producoes').find((p) => p.produtoId === kb.id && p.data === DATA_PRODUCAO_G)!;
    assert.equal(prod.qtdBoa, 15);
    assert.equal(prod.qtdPerdida, 1);
    assert.equal(prod.custoUnit, 2.4873);
    const entrada = db.all('movEstoque').find((m) => m.refId === prod.id)!;
    assert.deepEqual([entrada.quantidade, entrada.origem, entrada.destino], [15, null, 'casa']);
    const mat = (nome: string) => db.all('materiais').find((m) => m.nome === nome)!;
    const baixa = (nome: string) =>
      db
        .all('movMateriais')
        .filter((m) => m.materialId === mat(nome).id && m.refId === prod.id)
        .reduce((s, m) => s + m.quantidade, 0);
    assert.equal(baixa('PLA Preto'), -128);
    assert.equal(baixa('Argola'), -15);
    assert.equal(baixa('Saquinho'), -15);
    // Registrar de novo pela tela dá o mesmo efeito: +15 em Casa, −128 g, −15 argolas e saquinhos.
    const casa = saldoCasa(kb.id);
    const pla = saldoMaterial(mat('PLA Preto').id);
    const arg = saldoMaterial(mat('Argola').id);
    registrarProducao({ produtoId: kb.id, qtdBoa: pecasPorMesas(2, 8) - 1, qtdPerdida: 1 });
    assert.equal(saldoCasa(kb.id), casa + 15);
    assert.equal(saldoMaterial(mat('PLA Preto').id), pla - 128);
    assert.equal(saldoMaterial(mat('Argola').id), arg - 15);
  });

  it('apagar devolve os parâmetros anteriores e remove só os exemplos', () => {
    const antes = configPadrao().custos;
    carregarExemplo();
    db.tx((t) => t.insert('clientes', { nome: 'Cliente real', aceitaNovidades: false, arquivado: false }));
    const { removidos } = apagarExemplo();
    assert.ok(removidos > 10);
    assert.equal(contagemExemplo(), 0);
    assert.equal(db.all('clientes').length, 1);
    assert.deepEqual(db.config.custos, antes);
    assert.equal(db.config.canais.find((c) => c.tipo === 'cartao')!.comissaoPct, antes.taxaCartaoPct);
    assert.equal(db.config.exemploCarregado, false);
  });

  it('backup exportado e importado reproduz os mesmos números', async () => {
    carregarExemplo();
    const kbId = produto('Chaveiro Kettlebell Preto').id;
    const custo = custoProduto(kbId);
    const texto = await exportarBackup();
    assert.equal(validarBackup(texto).ok, true);
    db.resetar();
    assert.equal(db.all('produtos').length, 0);
    await importarBackup(texto);
    assert.equal(custoProduto(kbId), custo);
    assert.equal(db.config.custos.taxaCartaoPct, 4);
    assert.equal(validarBackup('{"app":"outro"}').ok, false);
    assert.equal(validarBackup('não é json').ok, false);
  });
});
