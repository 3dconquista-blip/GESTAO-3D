import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { linkWhatsApp, normalizarWhatsApp, preencherModelo, valorMensagem } from './whatsapp.ts';

describe('WhatsApp', () => {
  it('normaliza números brasileiros', () => {
    assert.equal(normalizarWhatsApp('(71) 99999-8888').numero, '5571999998888');
    assert.equal(normalizarWhatsApp('71 3333-4444').numero, '557133334444');
    assert.equal(normalizarWhatsApp('+55 71 99999-8888').numero, '5571999998888');
    assert.equal(normalizarWhatsApp('071999998888').numero, '5571999998888');
    assert.equal(normalizarWhatsApp('5571999998888').numero, '5571999998888');
  });
  it('mantém outro código de país', () => {
    assert.equal(normalizarWhatsApp('+1 415 555 2671').numero, '14155552671');
    assert.equal(normalizarWhatsApp('+351 912 345 678').numero, '351912345678');
  });
  it('valida tamanho', () => {
    assert.ok(normalizarWhatsApp('9999').erro);
    assert.ok(normalizarWhatsApp('').erro);
    assert.ok(normalizarWhatsApp('12345678901234').erro);
  });
  it('codifica o texto (#, &, emoji)', () => {
    const l = linkWhatsApp('71999998888', 'Pedido #0001 & cia 🎉');
    assert.equal(l, `https://wa.me/5571999998888?text=${encodeURIComponent('Pedido #0001 & cia 🎉')}`);
    assert.ok(!l.includes('#'));
  });
  it('preenche modelo e remove linhas com variáveis vazias', () => {
    const m = 'Olá, {nome}!\nPendência: R$ {pend}\nFim {x}';
    assert.equal(preencherModelo(m, { nome: 'Ana', pend: '', x: 1 }), 'Olá, Ana!\nFim 1');
    assert.equal(preencherModelo('{desconhecida} ok', {}), '{desconhecida} ok');
  });
  it('valor sem R$', () => {
    assert.equal(valorMensagem(8820), '88,20');
    assert.equal(valorMensagem(123456), '1.234,56');
    assert.equal(valorMensagem(-500), '-5,00');
  });
});
