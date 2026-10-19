// "Carregar dados de exemplo" (seção 16): cria os registros dos exemplos da seção 15, todos marcados
// com `exemplo: true`, usando os próprios serviços do app. "Apagar dados de exemplo" remove só esses
// registros e devolve os parâmetros de custo que existiam antes.
// Etapa 1: parâmetros do Exemplo A, impressoras, filamentos, insumos e produtos.
// Etapa 2: a produção do Exemplo G.
// Etapa 3: produção de setembro, expositores EXP-01 e EXP-02, Academia Alfa (instalada em 16/09, acerto
//   anterior em 01/10 que deixou 10, 8 e 6) e Loja Beta (instalada em 16/09 com 12 e 3) — prontos para a
//   visita de 16/10/2026 dos Exemplos B e C.
// Etapa 4: a cliente Marina e o pedido #0001 do Exemplo D (em "Orçamento", total R$ 117,90, sinal R$ 58,95).
import { db } from '../data/db.ts';
import type { Config, ID, NomeColecao, ParametrosCusto } from '../data/types.ts';
import { COLECOES } from '../data/types.ts';
import { comprarMaterial, salvarMaterial } from './materiais.ts';
import { salvarImpressora } from './impressoras.ts';
import { salvarProduto } from './produtos.ts';
import { registrarProducao } from './producao.ts';
import { salvarExpositor } from './expositores.ts';
import { instalar, salvarParceiro } from './parceiros.ts';
import { concluirAcerto, montarRascunho, sugerir } from './acertos.ts';
import { salvarCliente } from './clientes.ts';
import { criarPedido } from './pedidos.ts';
import { ErroNegocio } from './estoque.ts';

/** Parâmetros do Exemplo A (os demais ficam como estão). */
export const PARAMETROS_EXEMPLO: Partial<ParametrosCusto> = {
  tarifaKwh: 1,
  valorHora: 25,
  taxaFalhaPct: 10,
  margemDesejadaPct: 50,
  arredondamento: 'noventa',
  taxaCartaoPct: 4,
};

const DATA_COMPRA = '2026-09-01';
export const DATA_PRODUCAO_G = '2026-10-15';
/** Data do acerto anterior da Academia Alfa (Exemplo B) e da visita dos Exemplos B e C. */
export const DATA_ACERTO_ANTERIOR_B = '2026-10-01';
export const DATA_VISITA_BC = '2026-10-16';
/** Data do orçamento #0001 (Exemplo D). */
export const DATA_PEDIDO_D = '2026-10-16';

/** Quantos registros de exemplo existem. */
export function contagemExemplo(): number {
  let n = 0;
  for (const c of COLECOES) n += db.all(c).filter((r) => r.exemplo).length;
  return n;
}

/**
 * Cadastros do dono (não exemplo) que usam impressoras ou materiais de exemplo na ficha técnica.
 * Ao apagar o exemplo, esses produtos ficam sem custo até trocar a impressora ou o material.
 */
export function produtosQueUsamExemplo(): string[] {
  const exemplo = new Set([...db.all('impressoras'), ...db.all('materiais')].filter((r) => r.exemplo).map((r) => r.id));
  return db
    .all('produtos')
    .filter((p) => !p.exemplo)
    .filter((p) => p.mesas.some((m) => exemplo.has(m.impressoraId) || m.filamentos.some((f) => exemplo.has(f.materialId))) || p.componentes.some((c) => exemplo.has(c.materialId)))
    .map((p) => p.nome);
}

export interface ResumoExemplo {
  impressoras: number;
  materiais: number;
  produtos: number;
}

function sincronizarCartao(config: Config, custos: ParametrosCusto): Config {
  return { ...config, custos, canais: config.canais.map((c) => (c.tipo === 'cartao' ? { ...c, comissaoPct: custos.taxaCartaoPct } : c)) };
}

/**
 * Carrega os dados de exemplo. Guarda os parâmetros de custo atuais em `custosAntesDoExemplo`
 * e aplica os do Exemplo A. Recusa carregar duas vezes.
 */
export function carregarExemplo(): ResumoExemplo {
  if (db.config.exemploCarregado || contagemExemplo() > 0) {
    throw new ErroNegocio('Os dados de exemplo já estão carregados. Apague-os antes de carregar de novo.');
  }

  db.tx((t) =>
    t.config((c) => ({
      ...sincronizarCartao(c, { ...c.custos, ...PARAMETROS_EXEMPLO } as ParametrosCusto),
      custosAntesDoExemplo: c.custos,
      exemploCarregado: true,
      onboardingConcluido: true,
    })),
  );

  db.modoExemplo = true;
  try {
    // Impressoras do exemplo
    const a1mini = salvarImpressora({ nome: 'A1 mini (exemplo)', modelo: 'A1 mini', valorPago: 2000, vidaUtilH: 4000, manutencaoH: 0.1, potenciaW: 80 });
    const a1 = salvarImpressora({ nome: 'A1 (exemplo)', modelo: 'A1', valorPago: 3500, vidaUtilH: 5000, manutencaoH: 0.1, potenciaW: 100 });

    // Filamentos: R$ 100,00/kg com 1.000 g cada (compra de 1 kg por R$ 100,00)
    const cores: [string, string][] = [
      ['Preto', '#1F1F1F'],
      ['Rosa', '#E86FA6'],
      ['Vermelho', '#C62828'],
      ['Cinza', '#8A8F95'],
      ['Branco', '#F4F4F4'],
    ];
    const pla: Record<string, ID> = {};
    for (const [cor, hex] of cores) {
      const m = salvarMaterial({ tipo: 'filamento', material: 'PLA', corNome: cor, corHex: hex, marca: 'Exemplo', custoMedio: 100, minimo: 250 });
      comprarMaterial({ materialId: m.id, quantidade: 1, valorTotalCentavos: 10000, data: DATA_COMPRA });
      pla[cor] = m.id;
    }

    // Insumos: 100 argolas (R$ 0,30) e 100 saquinhos (R$ 0,10)
    const argola = salvarMaterial({ tipo: 'insumo', nome: 'Argola', unidade: 'un', custoMedio: 0.3, minimo: 20 });
    comprarMaterial({ materialId: argola.id, quantidade: 100, valorTotalCentavos: 3000, data: DATA_COMPRA });
    const saquinho = salvarMaterial({ tipo: 'insumo', nome: 'Saquinho', unidade: 'un', custoMedio: 0.1, minimo: 20 });
    comprarMaterial({ materialId: saquinho.id, quantidade: 100, valorTotalCentavos: 1000, data: DATA_COMPRA });
    // Reforço de insumos (mesmo preço) para a produção de setembro que abastece os expositores.
    comprarMaterial({ materialId: argola.id, quantidade: 100, valorTotalCentavos: 3000, data: '2026-09-08' });
    comprarMaterial({ materialId: saquinho.id, quantidade: 100, valorTotalCentavos: 1000, data: '2026-09-08' });

    // Chaveiros: ficha do Exemplo A (1 mesa, 8 peças, 4 h, 64 g, 1 argola + 1 saquinho, 2 min)
    const chaveiro = (nome: string, modelo: string, cor: string, filamento: ID, precoCentavos: number) =>
      salvarProduto({
        nome,
        modelo,
        cor,
        categoria: 'Chaveiro',
        precoEtiquetaCentavos: precoCentavos,
        estoqueMinimo: 10,
        maoDeObraMin: 2,
        mesas: [{ pecasPorMesa: 8, tempoMin: 240, impressoraId: a1mini.id, filamentos: [{ materialId: filamento, gramas: 64 }] }],
        componentes: [
          { materialId: argola.id, quantidade: 1 },
          { materialId: saquinho.id, quantidade: 1 },
        ],
      });
    const kbPreto = chaveiro('Chaveiro Kettlebell Preto', 'Chaveiro Kettlebell', 'Preto', pla.Preto, 1500);
    const kbRosa = chaveiro('Chaveiro Kettlebell Rosa', 'Chaveiro Kettlebell', 'Rosa', pla.Rosa, 1500);
    const anilha = chaveiro('Chaveiro Anilha Vermelha', 'Chaveiro Anilha', 'Vermelha', pla.Vermelho, 1200);
    const halter = chaveiro('Chaveiro Halter Cinza', 'Chaveiro Halter', 'Cinza', pla.Cinza, 1200);

    // Display PIX com 2 mesas: placa (1 por mesa) e suporte (2 por mesa)
    const display = salvarProduto({
      nome: 'Display PIX',
      modelo: 'Display PIX',
      cor: 'Preto e branco',
      categoria: 'Display',
      precoEtiquetaCentavos: 3500,
      estoqueMinimo: 2,
      maoDeObraMin: 5,
      mesas: [
        { pecasPorMesa: 1, tempoMin: 120, impressoraId: a1.id, filamentos: [{ materialId: pla.Preto, gramas: 45 }] },
        { pecasPorMesa: 2, tempoMin: 90, impressoraId: a1.id, filamentos: [{ materialId: pla.Branco, gramas: 30 }] },
      ],
      componentes: [{ materialId: saquinho.id, quantidade: 1 }],
    });

    // Produção de setembro para abastecer os expositores.
    registrarProducao({ produtoId: kbPreto.id, qtdBoa: 16, data: '2026-09-10' });
    registrarProducao({ produtoId: anilha.id, qtdBoa: 16, data: '2026-09-10' });
    registrarProducao({ produtoId: halter.id, qtdBoa: 8, data: '2026-09-10' });
    registrarProducao({ produtoId: kbRosa.id, qtdBoa: 24, data: '2026-09-12' });
    registrarProducao({ produtoId: display.id, qtdBoa: 4, data: '2026-09-12' });

    // Expositores
    const exp1 = salvarExpositor({ codigo: 'EXP-01', modelo: 'Painel de ganchos', capacidade: 30, custoCentavos: 6000 }, '2026-09-05');
    const exp2 = salvarExpositor({ codigo: 'EXP-02', modelo: 'Prateleira de balcão', capacidade: 20, custoCentavos: 8000 }, '2026-09-05');

    // Exemplo B — Academia Alfa: 70/30, a cada 15 dias, quem recebe: o parceiro.
    const alfa = salvarParceiro(
      {
        nome: 'Academia Alfa',
        tipo: 'academia',
        responsavel: 'Carlos',
        whatsapp: '(71) 98888-7777',
        endereco: 'Rua das Academias, 100',
        bairro: 'Pituba',
        pctParceiro: 30,
        frequenciaDias: 15,
        quemRecebe: 'parceiro',
        dataInicio: '2026-09-16',
        termoAssinado: true,
        termoData: '2026-09-16',
        mix: [
          { produtoId: kbPreto.id, nivelIdeal: 10, precoEtiquetaCentavos: 1500 },
          { produtoId: anilha.id, nivelIdeal: 8, precoEtiquetaCentavos: 1200 },
          { produtoId: halter.id, nivelIdeal: 6, precoEtiquetaCentavos: 1200 },
        ],
      },
      '2026-09-16',
    );
    instalar({ parceiroId: alfa.id, expositorIds: [exp1.id], itens: [
      { produtoId: kbPreto.id, quantidade: 10 },
      { produtoId: anilha.id, quantidade: 8 },
      { produtoId: halter.id, quantidade: 6 },
    ], data: '2026-09-16' });
    // Acerto anterior, em 01/10/2026: vendeu 4 Kettlebell e 2 Anilhas, nenhum Halter; repôs e deixou 10, 8 e 6.
    let r = montarRascunho(alfa.id, DATA_ACERTO_ANTERIOR_B);
    r = sugerir({
      ...r,
      linhas: r.linhas.map((l) => ({ ...l, contei: l.produtoId === kbPreto.id ? 6 : l.produtoId === anilha.id ? 6 : l.contei })),
    });
    concluirAcerto({ ...r, pagamento: { valorCentavos: 5880, forma: 'pix', data: DATA_ACERTO_ANTERIOR_B } });

    // Exemplo C — Loja Beta: 80/20, a cada 30 dias, quem recebe: ambos.
    const beta = salvarParceiro(
      {
        nome: 'Loja Beta',
        tipo: 'loja',
        responsavel: 'Fernanda',
        whatsapp: '(71) 97777-6666',
        endereco: 'Av. do Comércio, 250',
        bairro: 'Barra',
        pctParceiro: 20,
        frequenciaDias: 30,
        quemRecebe: 'ambos',
        dataInicio: '2026-09-16',
        termoAssinado: true,
        termoData: '2026-09-16',
        mix: [
          { produtoId: kbRosa.id, nivelIdeal: 12, precoEtiquetaCentavos: 1500 },
          { produtoId: display.id, nivelIdeal: 3, precoEtiquetaCentavos: 3500 },
        ],
      },
      '2026-09-16',
    );
    instalar({ parceiroId: beta.id, expositorIds: [exp2.id], itens: [
      { produtoId: kbRosa.id, quantidade: 12 },
      { produtoId: display.id, quantidade: 3 },
    ], data: '2026-09-16' });

    // Exemplo G: "2 mesas de 8" Kettlebell Preto com 1 peça perdida → 15 boas em Casa,
    // baixa de 128 g de PLA Preto, 15 argolas e 15 saquinhos.
    registrarProducao({ produtoId: kbPreto.id, qtdBoa: 15, qtdPerdida: 1, data: DATA_PRODUCAO_G });

    // Exemplo D — cliente Marina e o pedido #0001: 20 chaveiros com nome (peça personalizada na A1,
    // 1 mesa com 20 peças, 120 g de PLA Branco, 3 h, 1 argola e 2 min por peça, 1 h de modelagem).
    const marina = salvarCliente({ nome: 'Marina', whatsapp: '(71) 99999-8888', cidade: 'Salvador', comoConheceu: 'instagram', aceitaNovidades: false });
    criarPedido({
      clienteId: marina.id,
      titulo: '20 chaveiros com nome',
      descricao: 'Chaveiros personalizados com o nome de cada aluna da turma.',
      itens: [
        {
          tipo: 'personalizada',
          descricao: 'Chaveiro com nome',
          quantidade: 20,
          mesas: [{ pecasPorMesa: 20, tempoMin: 180, impressoraId: a1.id, filamentos: [{ materialId: pla.Branco, gramas: 120 }] }],
          componentes: [{ materialId: argola.id, quantidade: 1 }],
          maoDeObraMin: 2,
        },
      ],
      horasModelagem: 1,
      canalOrigem: 'whatsapp',
      prazo: '2026-10-30',
      data: DATA_PEDIDO_D,
    });
  } catch (e) {
    db.modoExemplo = false;
    apagarExemplo();
    throw e;
  } finally {
    db.modoExemplo = false;
  }

  return {
    impressoras: db.all('impressoras').filter((r) => r.exemplo).length,
    materiais: db.all('materiais').filter((r) => r.exemplo).length,
    produtos: db.all('produtos').filter((r) => r.exemplo).length,
  };
}

/**
 * Apaga todos os registros marcados como exemplo (única remoção física permitida) e
 * devolve os parâmetros de custo de antes. Retorna quantos registros saíram.
 */
export function apagarExemplo(): { removidos: number } {
  return db.tx((t) => {
    let removidos = 0;
    for (const c of COLECOES as NomeColecao[]) {
      for (const r of t.all(c)) {
        if (r.exemplo) {
          t.remove(c, r.id);
          removidos++;
        }
      }
    }
    t.config((c) => {
      const custos = c.custosAntesDoExemplo ?? c.custos;
      const { custosAntesDoExemplo: _a, ...resto } = sincronizarCartao(c, custos);
      return { ...resto, exemploCarregado: false };
    });
    return { removidos };
  });
}
