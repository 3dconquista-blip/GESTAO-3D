// Agenda de acertos (seção 8.8), com as datas do Exemplo B.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Acerto, Parceiro } from '../data/types.ts';
import { listaAgenda, resumoAgendaHoje, statusAgenda, textoVencimento, ultimoAcertoConcluido } from './agenda.ts';

const base = { criadoEm: '2026-09-01T12:00:00.000Z', atualizadoEm: '2026-09-01T12:00:00.000Z' };

function parceiro(over: Partial<Parceiro> & { id: string; nome: string }): Parceiro {
  return {
    ...base,
    tipo: 'academia',
    responsavel: 'Ana',
    whatsapp: '',
    endereco: '',
    bairro: '',
    linkMapa: '',
    pctParceiro: 30,
    percentuais: [{ pct: 30, vigenteDesde: '2026-09-16' }],
    frequenciaDias: 15,
    quemRecebe: 'parceiro',
    dataInicio: '2026-09-16',
    situacao: 'ativo',
    termoAssinado: true,
    mix: [],
    instaladoEm: '2026-09-16',
    arquivado: false,
    ...over,
  };
}

function acerto(over: Partial<Acerto> & { id: string; parceiroId: string; data: string; proximoAcerto: string }): Acerto {
  return {
    ...base,
    dataAnterior: '2026-09-16',
    pctParceiro: 30,
    brutoCentavos: 12600,
    parteParceiroCentavos: 3780,
    suaParteCentavos: 8820,
    pixDiretoCentavos: 0,
    valorAcertoCentavos: 8820,
    situacao: 'concluido',
    statusPagamento: 'pago',
    itens: [],
    ...over,
  };
}

// Exemplo B: Academia Alfa, a cada 15 dias. Acerto em 16/10/2026 -> próximo em 31/10/2026.
const alfa = parceiro({ id: 'alfa', nome: 'Academia Alfa' });
const acertoB = acerto({ id: 'b2', parceiroId: 'alfa', data: '2026-10-16', dataAnterior: '2026-10-01', proximoAcerto: '2026-10-31' });

describe('statusAgenda', () => {
  it('Exemplo B no dia do acerto: em dia, vence em 15 dias, visita hoje', () => {
    const s = statusAgenda(alfa, acertoB, '2026-10-16');
    assert.equal(s.proximoAcerto, '2026-10-31');
    assert.equal(s.diasParaVencer, 15);
    assert.equal(s.status, 'em_dia');
    assert.equal(s.ultimaVisita, '2026-10-16');
    assert.equal(s.diasDesdeUltimaVisita, 0);
  });
  it('vence em até 3 dias (amarelo), incluindo hoje', () => {
    assert.equal(statusAgenda(alfa, acertoB, '2026-10-27').status, 'em_dia');
    assert.equal(statusAgenda(alfa, acertoB, '2026-10-28').status, 'vence_logo');
    const hoje = statusAgenda(alfa, acertoB, '2026-10-31');
    assert.equal(hoje.status, 'vence_logo');
    assert.equal(hoje.diasParaVencer, 0);
    assert.equal(hoje.diasDesdeUltimaVisita, 15);
  });
  it('passou da data: atrasado (vermelho)', () => {
    const s = statusAgenda(alfa, acertoB, '2026-11-01');
    assert.equal(s.status, 'atrasado');
    assert.equal(s.diasParaVencer, -1);
  });
  it('dias de aviso configuráveis', () => {
    assert.equal(statusAgenda(alfa, acertoB, '2026-10-26', 5).status, 'vence_logo');
    assert.equal(statusAgenda(alfa, acertoB, '2026-10-26', 0).status, 'em_dia');
  });
  it('sem acerto: instalação + frequência', () => {
    const s = statusAgenda(parceiro({ id: 'x', nome: 'X', instaladoEm: '2026-10-01' }), null, '2026-10-20');
    assert.equal(s.proximoAcerto, '2026-10-16');
    assert.equal(s.diasParaVencer, -4);
    assert.equal(s.status, 'atrasado');
    assert.equal(s.diasDesdeUltimaVisita, 19);
  });
  it('sem instalação nem acerto', () => {
    const s = statusAgenda(parceiro({ id: 'x', nome: 'X', instaladoEm: undefined }), null, '2026-10-20');
    assert.deepEqual(s, { proximoAcerto: null, diasParaVencer: null, status: 'sem_instalacao', ultimaVisita: null, diasDesdeUltimaVisita: null });
  });
});

describe('ultimoAcertoConcluido', () => {
  it('ignora estornados e pega o mais recente', () => {
    const lista = [
      acerto({ id: 'a1', parceiroId: 'alfa', data: '2026-10-01', proximoAcerto: '2026-10-16' }),
      acertoB,
      acerto({ id: 'a3', parceiroId: 'alfa', data: '2026-10-20', proximoAcerto: '2026-11-04', situacao: 'estornado' }),
      acerto({ id: 'z', parceiroId: 'beta', data: '2026-10-25', proximoAcerto: '2026-11-24' }),
    ];
    assert.equal(ultimoAcertoConcluido(lista, 'alfa')?.id, 'b2');
    assert.equal(ultimoAcertoConcluido(lista, 'gama'), null);
  });
});

describe('listaAgenda', () => {
  const beta = parceiro({ id: 'beta', nome: 'Loja Beta', frequenciaDias: 30, instaladoEm: '2026-09-20' });
  const gama = parceiro({ id: 'gama', nome: 'Café Gama', instaladoEm: undefined });
  const pausado = parceiro({ id: 'p', nome: 'Pausado', situacao: 'pausado', instaladoEm: '2026-01-01' });
  const encerrado = parceiro({ id: 'e', nome: 'Encerrado', situacao: 'encerrado', instaladoEm: '2026-01-01' });
  const arquivado = parceiro({ id: 'a', nome: 'Arquivado', arquivado: true, instaladoEm: '2026-01-01' });
  const acertos = [acertoB, acerto({ id: 'c', parceiroId: 'beta', data: '2026-10-10', dataAnterior: '2026-09-20', proximoAcerto: '2026-11-09', suaParteCentavos: 11200 })];
  const cartoes = listaAgenda([gama, beta, pausado, alfa, encerrado, arquivado], acertos, { alfa: 24, beta: 15 }, '2026-11-02');

  it('só parceiros ativos (pausados ficam fora)', () => {
    assert.deepEqual(cartoes.map((c) => c.parceiro.id), ['alfa', 'beta', 'gama']);
  });
  it('mais atrasado primeiro; sem instalação no fim', () => {
    assert.equal(cartoes[0].status, 'atrasado');
    assert.equal(cartoes[0].diasParaVencer, -2);
    assert.equal(cartoes[1].status, 'em_dia');
    assert.equal(cartoes[2].status, 'sem_instalacao');
  });
  it('peças no expositor, último valor (sua parte) e dias desde a última visita', () => {
    assert.equal(cartoes[0].pecasNoExpositor, 24);
    assert.equal(cartoes[0].ultimoValorCentavos, 8820);
    assert.equal(cartoes[0].diasDesdeUltimaVisita, 17);
    assert.equal(cartoes[1].ultimoValorCentavos, 11200);
    assert.equal(cartoes[2].pecasNoExpositor, 0);
    assert.equal(cartoes[2].ultimoValorCentavos, null);
  });
  it('bloco "Hoje": atrasados e da semana', () => {
    const r = resumoAgendaHoje(listaAgenda([alfa, beta], acertos, {}, '2026-11-03'));
    assert.deepEqual(r.atrasados.map((c) => c.parceiro.id), ['alfa']);
    assert.deepEqual(r.daSemana.map((c) => c.parceiro.id), ['beta']);
  });
});

describe('textoVencimento', () => {
  it('textos curtos', () => {
    assert.equal(textoVencimento(-1), 'Atrasado há 1 dia');
    assert.equal(textoVencimento(-4), 'Atrasado há 4 dias');
    assert.equal(textoVencimento(0), 'Vence hoje');
    assert.equal(textoVencimento(1), 'Vence amanhã');
    assert.equal(textoVencimento(15), 'Vence em 15 dias');
    assert.equal(textoVencimento(null), 'Sem instalação');
  });
});
