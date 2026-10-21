// Critérios de aceite da Etapa 3 (seção 15): Exemplos B, C, E e F sobre os dados de exemplo.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { saldoCasa, saldoNoParceiro } from '../data/selectors.ts';
import { calcularAcerto, calcularLinha, validarLinha, type LinhaRascunho, type RascunhoAcerto } from '../domain/acerto.ts';
import { desempenhoParceiro } from '../domain/desempenho.ts';
import { carregarExemplo, DATA_VISITA_BC } from './exemplo.ts';
import {
  adicionarItemEncontrado,
  bloqueioConclusao,
  concluirAcerto,
  montarRascunho,
  pendenciasDoParceiro,
  podeReabrir,
  reabrirUltimoAcerto,
  registrarPagamentoParceiro,
  resultadoDoRascunho,
  sugerir,
  textoComprovante,
  ultimoAcerto,
} from './acertos.ts';

const parceiro = (nome: string) => db.all('parceiros').find((p) => p.nome === nome)!;
const produto = (nome: string) => db.all('produtos').find((p) => p.nome === nome)!;

function contar(r: RascunhoAcerto, contagem: Record<string, Partial<LinhaRascunho>>): RascunhoAcerto {
  return sugerir({
    ...r,
    linhas: r.linhas.map((l) => {
      const nome = db.get('produtos', l.produtoId)!.nome;
      return contagem[nome] ? { ...l, ...contagem[nome] } : l;
    }),
  });
}

describe('Exemplo B — acerto 70/30 quinzenal (Academia Alfa)', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('rascunho de 16/10: esperado 10, 8 e 6; período desde 01/10; 30%', () => {
    const r = montarRascunho(parceiro('Academia Alfa').id, DATA_VISITA_BC);
    const esp = Object.fromEntries(r.linhas.map((l) => [db.get('produtos', l.produtoId)!.nome, l.esperado]));
    assert.deepEqual(esp, { 'Chaveiro Anilha': 8, 'Chaveiro Halter': 6, 'Chaveiro Kettlebell': 10 });
    assert.equal(r.dataAnterior, '2026-10-01');
    assert.equal(r.pctParceiro, 30);
    assert.equal(r.pixDiretoCentavos, 0);
  });

  it('contei 4, 5 e 6 → números do Exemplo B ao centavo', () => {
    const alfa = parceiro('Academia Alfa');
    let r = montarRascunho(alfa.id, DATA_VISITA_BC);
    r = contar(r, {
      'Chaveiro Kettlebell': { contei: 4 },
      'Chaveiro Anilha': { contei: 5 },
      'Chaveiro Halter': { contei: 6 },
    });
    const res = resultadoDoRascunho(r);
    const vend = Object.fromEntries(res.linhas.map((l) => [db.get('produtos', l.produtoId)!.nome, [l.vendidos, l.repostos, l.estoqueFinal]]));
    assert.deepEqual(vend['Chaveiro Kettlebell'], [6, 6, 10]);
    assert.deepEqual(vend['Chaveiro Anilha'], [3, 3, 8]);
    assert.deepEqual(vend['Chaveiro Halter'], [0, 0, 6]);
    assert.equal(res.pecasVendidas, 9);
    assert.equal(res.bruto, 12600);
    assert.equal(res.parteParceiro, 3780);
    assert.equal(res.suaParte, 8820);
    assert.equal(res.valorAcerto, 8820);
    assert.equal(res.estoqueFinalTotal, 24);
    assert.equal(res.dias, 15);
    assert.equal(res.mediaPorDia, 0.6);
    assert.equal(res.giro, 0.375);
    assert.equal(res.pendenciaAnterior, 0);

    const a = concluirAcerto({ ...r, pagamento: { valorCentavos: 8820, forma: 'pix', data: DATA_VISITA_BC } });
    assert.equal(a.statusPagamento, 'pago');
    assert.equal(a.proximoAcerto, '2026-10-31');
    assert.equal(saldoNoParceiro(produto('Chaveiro Kettlebell').id, alfa.id), 10);
    assert.equal(saldoNoParceiro(produto('Chaveiro Anilha').id, alfa.id), 8);
    assert.equal(saldoNoParceiro(produto('Chaveiro Halter').id, alfa.id), 6);

    // Halter sem venda neste acerto e no anterior: parado.
    const d = desempenhoParceiro({ parceiro: alfa, acertos: db.all('acertos'), expositores: db.all('expositores'), parceiros: db.all('parceiros'), saldoAtual: (id) => saldoNoParceiro(id, alfa.id) });
    assert.deepEqual(d.itensParados.map((i) => db.get('produtos', i.produtoId)!.nome), ['Chaveiro Halter']);
    const ultimaLinha = d.porAcerto[d.porAcerto.length - 1];
    assert.equal(ultimaLinha.dias, 15);
    assert.equal(ultimaLinha.giroPct, 37.5);
    assert.equal(ultimaLinha.mediaPorDia, 0.6);

    const msg = textoComprovante(a.id);
    assert.match(msg, /Total vendido: R\$ 126,00/);
    assert.match(msg, /Parte de vocês \(30%\): R\$ 37,80/);
    assert.match(msg, /Parte 3D gestão \(70%\): R\$ 88,20/);
    assert.match(msg, /Total a acertar: R\$ 88,20/);
    assert.match(msg, /Próximo acerto: 31\/10\/2026/);
    assert.match(msg, /Ficaram 24 peças no expositor/);
    assert.doesNotMatch(msg, /PIX do expositor/);
    assert.doesNotMatch(msg, /Pendência anterior/);
  });

  it('reabrir o último acerto devolve o estoque e o rascunho', () => {
    const alfa = parceiro('Academia Alfa');
    const kb = produto('Chaveiro Kettlebell');
    const casaAntes = saldoCasa(kb.id);
    let r = montarRascunho(alfa.id, DATA_VISITA_BC);
    r = contar(r, { 'Chaveiro Kettlebell': { contei: 4 }, 'Chaveiro Anilha': { contei: 5 } });
    const a = concluirAcerto({ ...r, pagamento: { valorCentavos: 8820, forma: 'pix', data: DATA_VISITA_BC } });
    assert.equal(saldoCasa(kb.id), casaAntes - 6);
    assert.equal(podeReabrir(a.id), true);
    const volta = reabrirUltimoAcerto(alfa.id);
    assert.equal(db.get('acertos', a.id)!.situacao, 'estornado');
    assert.equal(saldoCasa(kb.id), casaAntes);
    assert.equal(saldoNoParceiro(kb.id, alfa.id), 10);
    assert.equal(volta.linhas.find((l) => l.produtoId === kb.id)!.contei, 4);
    assert.equal(ultimoAcerto(alfa.id)!.data, '2026-10-01');
    assert.equal(pendenciasDoParceiro(alfa.id).saldo!.saldo, 0);
    // Concluir de novo dá o mesmo resultado.
    const de2 = concluirAcerto(volta);
    assert.equal(de2.suaParteCentavos, 8820);
    assert.equal(de2.statusPagamento, 'pago');
  });
});

describe('Exemplo C — acerto 80/20 mensal com avaria, PIX no expositor e pagamento parcial (Loja Beta)', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });

  it('números do Exemplo C, pendência de R$ 32,00 e pendência anterior no próximo acerto', () => {
    const beta = parceiro('Loja Beta');
    const rosa = produto('Chaveiro Kettlebell');
    const display = produto('Display PIX');
    let r = montarRascunho(beta.id, DATA_VISITA_BC);
    assert.equal(r.pixDiretoCentavos, null); // "Ambos": começa vazio
    assert.deepEqual(r.linhas.map((l) => l.esperado).sort((a, b) => a - b), [3, 12]);
    r = contar(r, { 'Chaveiro Kettlebell': { contei: 5, avariados: 1 }, 'Display PIX': { contei: 2 } });
    r = { ...r, pixDiretoCentavos: 3000, pixEditado: true, pagamento: { valorCentavos: 5000, forma: 'pix', data: DATA_VISITA_BC } };
    const res = resultadoDoRascunho(r);
    const linha = (id: string) => res.linhas.find((l) => l.produtoId === id)!;
    assert.equal(linha(rosa.id).vendidos, 7);
    assert.equal(linha(display.id).vendidos, 1);
    assert.equal(res.bruto, 14000);
    assert.equal(res.parteParceiro, 2800);
    assert.equal(res.suaParte, 11200);
    assert.equal(res.pixDireto, 3000);
    assert.equal(res.valorAcerto, 8200);
    assert.equal(linha(rosa.id).repostos, 8);
    assert.equal(linha(display.id).repostos, 1);
    assert.equal(linha(rosa.id).estoqueFinal, 12);
    assert.equal(linha(display.id).estoqueFinal, 3);
    assert.equal(res.restante, 3200);

    const a = concluirAcerto(r);
    assert.equal(a.statusPagamento, 'parcial');
    const pend = pendenciasDoParceiro(beta.id, '2026-10-17');
    assert.equal(pend.saldo!.aReceber, 3200);
    assert.equal(pend.vencida.valorCentavos, 3200);
    // Avaria: 1 Kettlebell vira perda pelo custo.
    const perdas = db.all('movEstoque').filter((m) => m.refId === a.id && m.tipo === 'perda');
    assert.equal(perdas.length, 1);
    assert.equal(perdas[0].quantidade, 1);
    assert.equal(perdas[0].custoUnit, 2.4873);
    assert.equal(saldoNoParceiro(rosa.id, beta.id), 12);
    assert.equal(saldoNoParceiro(display.id, beta.id), 3);

    const msg = textoComprovante(a.id);
    assert.match(msg, /Já recebido no PIX do expositor: R\$ 30,00/);
    assert.match(msg, /Total a acertar: R\$ 82,00/);
    assert.match(msg, /Parte de vocês \(20%\): R\$ 28,00/);

    // Próximo acerto: aparece "Pendência anterior: R$ 32,00".
    let prox = montarRascunho(beta.id, '2026-11-15');
    const resProx = resultadoDoRascunho(prox);
    assert.equal(resProx.pendenciaAnterior, 3200);
    prox = { ...prox, pixDiretoCentavos: 0, pixEditado: true, pagamento: { valorCentavos: 3200, forma: 'pix', data: '2026-11-15' } };
    const b = concluirAcerto(prox);
    assert.match(textoComprovante(b.id), /Pendência anterior: R\$ 32,00/);
    assert.equal(db.get('acertos', a.id)!.statusPagamento, 'pago');
  });

  it('pagamento da pendência fora da visita abate o acerto mais antigo', () => {
    const beta = parceiro('Loja Beta');
    let r = montarRascunho(beta.id, DATA_VISITA_BC);
    r = contar(r, { 'Chaveiro Kettlebell': { contei: 5, avariados: 1 }, 'Display PIX': { contei: 2 } });
    const a = concluirAcerto({ ...r, pixDiretoCentavos: 3000, pixEditado: true, pagamento: { valorCentavos: 5000, forma: 'pix', data: DATA_VISITA_BC } });
    assert.throws(() => registrarPagamentoParceiro({ parceiroId: beta.id, valorCentavos: 4000, forma: 'pix' }));
    registrarPagamentoParceiro({ parceiroId: beta.id, valorCentavos: 3200, forma: 'dinheiro', data: '2026-10-20' });
    assert.equal(db.get('acertos', a.id)!.statusPagamento, 'pago');
    assert.equal(pendenciasDoParceiro(beta.id).saldo!.aReceber, 0);
  });
});

describe('Exemplo E — arredondamento da divisão', () => {
  it('R$ 14,95 em 70/30: parceiro R$ 4,49 e sua parte R$ 10,46', () => {
    const linha: LinhaRascunho = { produtoId: 'x', esperado: 1, contei: 0, avariados: 0, recolhidos: 0, faltasAbonadas: 0, precoUnitCentavos: 1495, repostos: 0 };
    const r: RascunhoAcerto = { parceiroId: 'p', data: '2026-10-16', dataAnterior: '2026-10-01', pctParceiro: 30, quemRecebe: 'parceiro', pixDiretoCentavos: 0, linhas: [linha], pagamento: { valorCentavos: null, forma: 'pix', data: '2026-10-16' }, passo: 3, atualizadoEm: '' };
    const res = calcularAcerto(r);
    assert.equal(res.bruto, 1495);
    assert.equal(res.parteParceiro, 449);
    assert.equal(res.suaParte, 1046);
  });
});

describe('Exemplo F — contagem maior que o esperado', () => {
  it('pede recontagem; confirmada, 0 vendidos e ajuste de entrada de 1', () => {
    const linha: LinhaRascunho = { produtoId: 'x', esperado: 4, contei: 5, avariados: 0, recolhidos: 0, faltasAbonadas: 0, precoUnitCentavos: 1500, repostos: 0 };
    assert.equal(validarLinha(linha)[0].tipo, 'recontar');
    const ok = { ...linha, recontagemConfirmada: true };
    assert.deepEqual(validarLinha(ok), []);
    assert.deepEqual(calcularLinha(ok), { vendidos: 0, ajusteEntrada: 1, valorCentavos: 0, estoqueFinal: 5 });
  });

  it('no acerto real: bloqueia sem recontagem; confirmado, cria o ajuste de entrada no parceiro', () => {
    db.resetar();
    carregarExemplo();
    const alfa = parceiro('Academia Alfa');
    const halter = produto('Chaveiro Halter');
    let r = montarRascunho(alfa.id, DATA_VISITA_BC);
    r = contar(r, { 'Chaveiro Halter': { contei: 7 } });
    assert.match(bloqueioConclusao(r)!, /recont/i);
    r = contar(r, { 'Chaveiro Halter': { contei: 7, recontagemConfirmada: true } });
    const a = concluirAcerto(r);
    const item = a.itens.find((i) => i.produtoId === halter.id)!;
    assert.equal(item.vendidos, 0);
    assert.equal(item.ajusteEntrada, 1);
    const aj = db.all('movEstoque').filter((m) => m.refId === a.id && m.tipo === 'ajuste');
    assert.equal(aj.length, 1);
    assert.equal(aj[0].motivo, 'contagem maior que o esperado');
    assert.equal(aj[0].destino, `p:${alfa.id}`);
    assert.equal(saldoNoParceiro(halter.id, alfa.id), 7);
  });

  it('item encontrado que não estava no sistema entra como ajuste de entrada', () => {
    db.resetar();
    carregarExemplo();
    const alfa = parceiro('Academia Alfa');
    const display = produto('Display PIX');
    let r = montarRascunho(alfa.id, DATA_VISITA_BC);
    r = adicionarItemEncontrado(r, display.id, 2);
    const a = concluirAcerto(sugerir(r));
    assert.equal(a.itens.find((i) => i.produtoId === display.id)!.ajusteEntrada, 2);
    assert.equal(saldoNoParceiro(display.id, alfa.id), 2);
    assert.ok(db.get('parceiros', alfa.id)!.mix.some((m) => m.produtoId === display.id));
  });
});

describe('validações do acerto', () => {
  beforeEach(() => {
    db.resetar();
    carregarExemplo();
  });
  it('avariados + recolhidos ≤ contei; faltas ≤ esperado − contei, com motivo', () => {
    const base: LinhaRascunho = { produtoId: 'x', esperado: 10, contei: 4, avariados: 3, recolhidos: 2, faltasAbonadas: 0, precoUnitCentavos: 1500, repostos: 0 };
    assert.ok(validarLinha(base).some((e) => e.campo === 'avariados'));
    assert.ok(validarLinha({ ...base, avariados: 0, recolhidos: 0, faltasAbonadas: 7, motivoFalta: 'x' }).some((e) => e.campo === 'faltasAbonadas'));
    assert.ok(validarLinha({ ...base, avariados: 0, recolhidos: 0, faltasAbonadas: 2 }).some((e) => e.campo === 'motivoFalta'));
    const ok = { ...base, avariados: 0, recolhidos: 0, faltasAbonadas: 2, motivoFalta: 'caiu atrás do balcão' };
    assert.deepEqual(validarLinha(ok), []);
    assert.equal(calcularLinha(ok).vendidos, 4);
  });
  it('não aceita receber mais do que o total de hoje', () => {
    const alfa = parceiro('Academia Alfa');
    let r = montarRascunho(alfa.id, DATA_VISITA_BC);
    r = contar(r, { 'Chaveiro Kettlebell': { contei: 9 } });
    r = { ...r, pagamento: { valorCentavos: 99999, forma: 'pix', data: DATA_VISITA_BC } };
    assert.match(bloqueioConclusao(r)!, /passa do total/);
  });
  it('estoque mudou depois de começar a contagem: pede para atualizar', () => {
    const alfa = parceiro('Academia Alfa');
    const r = montarRascunho(alfa.id, DATA_VISITA_BC);
    db.tx((t) => t.insert('movEstoque', { data: DATA_VISITA_BC, produtoId: produto('Chaveiro Halter').id, quantidade: 1, origem: 'casa', destino: `p:${alfa.id}`, tipo: 'remessa', custoUnit: 2.4873 }));
    assert.match(bloqueioConclusao(r)!, /mudou/);
  });
});
