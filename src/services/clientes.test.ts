// Cliente enxuto (decisão 86): a tela mostra só Nome e WhatsApp e o resto fica em "Mais detalhes". Editar só o que
// está na tela não pode apagar os outros dados; cadastrar só com nome e WhatsApp continua valendo.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../data/db.ts';
import { formatarTelefone } from '../domain/termo.ts';
import { salvarCliente } from './clientes.ts';

beforeEach(() => db.resetar());

function clienteCompleto() {
  return salvarCliente({
    nome: 'Marina',
    whatsapp: '(71) 99999-8888',
    instagram: '@marina',
    cidade: 'Salvador',
    bairro: 'Barra',
    endereco: 'Rua A, 10',
    aniversario: '1990-03-14',
    comoConheceu: 'indicacao',
    aceitaNovidades: true,
    observacoes: 'Prefere azul',
  });
}

const OUTROS_DADOS = {
  instagram: '@marina',
  cidade: 'Salvador',
  bairro: 'Barra',
  endereco: 'Rua A, 10',
  aniversario: '1990-03-14',
  comoConheceu: 'indicacao',
  aceitaNovidades: true,
  observacoes: 'Prefere azul',
};

describe('salvarCliente — só Nome e WhatsApp na tela', () => {
  it('editar nome e WhatsApp mantém os dados de "Mais detalhes"', () => {
    const c = clienteCompleto();
    const e = salvarCliente({ id: c.id, nome: 'Novo nome', whatsapp: '(71) 98888-7777' });
    assert.equal(e.id, c.id);
    assert.equal(e.nome, 'Novo nome');
    assert.equal(e.whatsapp, '5571988887777');
    for (const [campo, valor] of Object.entries(OUTROS_DADOS)) assert.equal(e[campo as keyof typeof e], valor, campo);
    assert.equal(db.all('clientes').length, 1);
  });

  it('salvar a edição sem mexer em nada ({ ...atual }, como a tela) mantém tudo', () => {
    const c = clienteCompleto();
    const e = salvarCliente({ ...c, whatsapp: formatarTelefone(c.whatsapp) });
    assert.equal(e.nome, 'Marina');
    assert.equal(e.whatsapp, '5571999998888');
    for (const [campo, valor] of Object.entries(OUTROS_DADOS)) assert.equal(e[campo as keyof typeof e], valor, campo);
    assert.equal(e.arquivado, false);
  });

  it('aniversário antigo sem o ano continua guardado ao salvar a edição', () => {
    const c = salvarCliente({ nome: 'Rui', aniversario: '07-21' });
    assert.equal(salvarCliente({ ...c, nome: 'Rui Souza' }).aniversario, '07-21');
  });

  it('cadastra só com nome e WhatsApp; novidades começam desligadas', () => {
    const c = salvarCliente({ nome: '  Ana  ', whatsapp: '(71) 98888-7777' });
    assert.equal(c.nome, 'Ana');
    assert.equal(c.whatsapp, '5571988887777');
    assert.equal(c.aceitaNovidades, false);
    assert.equal(c.arquivado, false);
    for (const campo of ['instagram', 'cidade', 'bairro', 'endereco', 'aniversario', 'comoConheceu', 'observacoes'] as const) assert.equal(c[campo], undefined, campo);
    assert.deepEqual(db.get('clientes', c.id), c);
  });
});
