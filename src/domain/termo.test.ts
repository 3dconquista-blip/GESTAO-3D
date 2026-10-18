// Termo de consignação (seção 8.12), com os dados do Exemplo B (Academia Alfa, 70/30, quinzenal).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configPadrao } from '../data/defaults.ts';
import {
  dataPorExtenso,
  formatarTelefone,
  montarTermo,
  RODAPE_TERMO,
  rotuloDivisao,
  rotuloFrequencia,
  ROTULO_QUEM_RECEBE,
  type EntradaTermo,
} from './termo.ts';

const empresa = { ...configPadrao().empresa, nome: 'OCTA', nomePix: 'Osmar Souza', chavePix: 'pix@octa.com', whatsapp: '5571988887777', cidade: 'Salvador' };

const entrada: EntradaTermo = {
  empresa,
  parceiro: {
    nome: 'Academia Alfa',
    responsavel: 'João',
    whatsapp: '5571999998888',
    endereco: 'Rua das Flores, 100',
    bairro: 'Pituba',
    pctParceiro: 30,
    frequenciaDias: 15,
    quemRecebe: 'parceiro',
    dataInicio: '2026-09-16',
  },
  expositores: [{ codigo: 'EXP-01', modelo: 'Gancheira de balcão', capacidade: 24 }],
  itens: [
    { nome: 'Kettlebell Preto', quantidade: 10, precoCentavos: 1500 },
    { nome: 'Anilha Vermelha', quantidade: 8, precoCentavos: 1200 },
    { nome: 'Halter Cinza', quantidade: 6, precoCentavos: 1200 },
  ],
  data: '2026-10-01',
};

function secao(t: ReturnType<typeof montarTermo>, chave: string): string {
  const s = t.secoes.find((x) => x.chave === chave);
  assert.ok(s, `seção ${chave}`);
  return s.paragrafos.join('\n');
}

describe('rótulos', () => {
  it('divisão no padrão "Você 70% / Parceiro 30%"', () => {
    assert.equal(rotuloDivisao(30), 'Você 70% / Parceiro 30%');
    assert.equal(rotuloDivisao(20), 'Você 80% / Parceiro 20%');
    assert.equal(rotuloDivisao(22.5), 'Você 77,5% / Parceiro 22,5%');
  });
  it('frequência, quem recebe, data por extenso e telefone', () => {
    assert.equal(rotuloFrequencia(15), 'A cada 15 dias');
    assert.equal(ROTULO_QUEM_RECEBE.pix_dono, 'Meu PIX no expositor');
    assert.equal(dataPorExtenso('2026-10-16'), '16 de outubro de 2026');
    assert.equal(dataPorExtenso('2026-03-01'), '1º de março de 2026');
    assert.equal(formatarTelefone('5571999998888'), '(71) 99999-8888');
    assert.equal(formatarTelefone('557133334444'), '(71) 3333-4444');
    assert.equal(formatarTelefone('14155552671'), '+14155552671');
    assert.equal(formatarTelefone(''), '');
  });
});

describe('Termo de consignação — Exemplo B', () => {
  const t = montarTermo(entrada);

  it('título, itens e totais', () => {
    assert.equal(t.titulo, 'Termo de consignação');
    assert.equal(t.totalPecas, 24);
    assert.equal(t.totalCentavos, 31800);
    assert.deepEqual(
      t.itens.map((i) => i.valorCentavos),
      [15000, 9600, 7200],
    );
  });

  it('partes e endereço', () => {
    const partes = secao(t, 'partes');
    assert.match(partes, /DONO: OCTA \(responsável: Osmar Souza\), WhatsApp \(71\) 98888-7777/);
    assert.match(partes, /PARCEIRO: Academia Alfa \(responsável: João\), WhatsApp \(71\) 99999-8888/);
    assert.match(partes, /16\/09\/2026/);
    assert.match(secao(t, 'endereco'), /Rua das Flores, 100 — Pituba, Salvador/);
  });

  it('lista de itens com quantidade e preço de etiqueta', () => {
    const itens = secao(t, 'itens');
    assert.match(itens, /Kettlebell Preto: 10 unidades × R\$ 15,00 = R\$ 150,00/);
    assert.match(itens, /Anilha Vermelha: 8 unidades × R\$ 12,00 = R\$ 96,00/);
    assert.match(itens, /Halter Cinza: 6 unidades × R\$ 12,00 = R\$ 72,00/);
    assert.match(itens, /Total: 24 peças, que somam R\$ 318,00 pelo preço de etiqueta/);
  });

  it('código do expositor e propriedade', () => {
    assert.match(secao(t, 'expositor'), /Expositor: EXP-01 \(Gancheira de balcão, 24 vagas\)/);
    assert.match(secao(t, 'propriedade'), /O expositor é do DONO/);
  });

  it('divisão para os dois lados, periodicidade e forma de pagamento', () => {
    const div = secao(t, 'divisao');
    assert.match(div, /OCTA \(DONO\) 70% \/ Academia Alfa \(PARCEIRO\) 30%/);
    assert.match(div, /o DONO fica com 70% e o PARCEIRO fica com 30%/);
    assert.match(secao(t, 'acerto'), /a cada 15 dias/);
    const pag = secao(t, 'pagamento');
    assert.match(pag, /Os clientes pagam ao PARCEIRO/);
    assert.match(pag, /repassa ao DONO a parte dele \(70% do total vendido\)/);
    assert.match(pag, /PIX \(chave PIX pix@octa\.com, em nome de Osmar Souza\) ou em dinheiro/);
  });

  it('livre acesso, guarda, avarias/furto/perda e aviso prévio de 15 dias', () => {
    assert.match(secao(t, 'acesso'), /livre acesso/);
    const guarda = secao(t, 'guarda');
    assert.match(guarda, /até que sejam vendidos ou devolvidos/);
    assert.match(guarda, /faltarem na contagem sem explicação contam como vendidos/);
    const av = secao(t, 'avarias');
    assert.match(av, /estragado/);
    assert.match(av, /furtado ou perdido conta como vendido/);
    assert.match(av, /expositor for danificado, furtado ou perdido/);
    assert.match(secao(t, 'encerramento'), /15 dias de antecedência/);
  });

  it('local, data e assinaturas', () => {
    assert.equal(t.localData, 'Salvador, 1º de outubro de 2026');
    assert.deepEqual(t.assinaturas, [
      { parte: 'DONO', nome: 'OCTA', responsavel: 'Osmar Souza' },
      { parte: 'PARCEIRO', nome: 'Academia Alfa', responsavel: 'João' },
    ]);
    const ass = secao(t, 'assinaturas');
    assert.match(ass, /Salvador, 1º de outubro de 2026\./);
    assert.match(ass, /_+\nDONO: OCTA — Osmar Souza/);
    assert.match(ass, /_+\nPARCEIRO: Academia Alfa — João/);
  });

  it('rodapé exato', () => {
    assert.equal(
      t.rodape,
      'Modelo simples baseado no contrato estimatório (Código Civil, arts. 534 a 537). Não substitui orientação jurídica nem contábil.',
    );
    assert.equal(t.rodape, RODAPE_TERMO);
  });

  it('texto plano com todas as seções numeradas e o rodapé no fim', () => {
    assert.ok(t.textoPlano.startsWith('TERMO DE CONSIGNAÇÃO\n\n1. Partes\n'));
    t.secoes.forEach((s, i) => assert.ok(t.textoPlano.includes(`${i + 1}. ${s.titulo}`), s.titulo));
    assert.ok(t.textoPlano.includes('Kettlebell Preto: 10 unidades'));
    assert.ok(t.textoPlano.endsWith(RODAPE_TERMO));
    assert.equal(t.secoes.length, 13);
  });
});

describe('variações do termo', () => {
  it('"Meu PIX no expositor": clientes pagam no PIX do dono, que repassa a parte do parceiro', () => {
    const t = montarTermo({ ...entrada, parceiro: { ...entrada.parceiro, quemRecebe: 'pix_dono', pctParceiro: 20 } });
    const pag = secao(t, 'pagamento');
    assert.match(pag, /pagam direto no PIX do DONO, indicado no expositor \(chave PIX pix@octa\.com/);
    assert.match(pag, /o DONO repassa ao PARCEIRO a parte dele \(20% do total vendido\)/);
    assert.match(secao(t, 'divisao'), /OCTA \(DONO\) 80% \/ Academia Alfa \(PARCEIRO\) 20%/);
  });
  it('"Ambos": desconta o que entrou no PIX do dono', () => {
    const t = montarTermo({ ...entrada, parceiro: { ...entrada.parceiro, quemRecebe: 'ambos' } });
    assert.match(secao(t, 'pagamento'), /podem pagar ao PARCEIRO ou no PIX do DONO.*descontado/);
  });
  it('sem endereço, cidade, expositor e itens: deixa espaços para preencher', () => {
    const t = montarTermo({
      empresa: { nome: 'OCTA' },
      parceiro: { nome: 'Loja Beta', pctParceiro: 20, frequenciaDias: 30, quemRecebe: 'parceiro', notaRemessa: '123' },
      expositores: [{ codigo: 'EXP-02' }, { codigo: 'EXP-03' }],
      itens: [{ nome: 'Display PIX', quantidade: 0, precoCentavos: 3500 }],
      data: '2026-10-16',
    });
    assert.match(secao(t, 'endereco'), /PARCEIRO: _{10,}/);
    assert.match(secao(t, 'itens'), /Nenhum item nesta remessa/);
    assert.match(secao(t, 'itens'), /Nota de remessa nº 123/);
    assert.match(secao(t, 'expositor'), /Expositores: EXP-02; EXP-03\./);
    assert.match(secao(t, 'acerto'), /a cada 30 dias/);
    assert.match(t.localData, /^_+, 16 de outubro de 2026$/);
    assert.match(secao(t, 'pagamento'), /pagos por PIX ou em dinheiro/);
    assert.equal(t.totalPecas, 0);
  });
});
