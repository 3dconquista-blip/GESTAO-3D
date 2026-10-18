// Mensagem do comprovante de acerto (seção 8.11), a partir do modelo editável
// (config.mensagens.comprovante_acerto). Função pura.
import type { Cents } from '../lib/money.ts';
import { roundTo } from '../lib/money.ts';
import { formatData, formatQtd } from '../lib/format.ts';
import type { Acerto, ID, Parceiro } from '../data/types.ts';
import { preencherModelo, valorMensagem } from './whatsapp.ts';

export interface DadosComprovante {
  /** Modelo com variáveis entre chaves (config.mensagens.comprovante_acerto). */
  modelo: string;
  /** Nome da empresa (config.empresa.nome). */
  empresa: string;
  chavePix: string;
  nomePix: string;
  parceiro: Pick<Parceiro, 'nome' | 'responsavel'>;
  acerto: Pick<
    Acerto,
    | 'data'
    | 'dataAnterior'
    | 'pctParceiro'
    | 'brutoCentavos'
    | 'parteParceiroCentavos'
    | 'suaParteCentavos'
    | 'pixDiretoCentavos'
    | 'valorAcertoCentavos'
    | 'itens'
    | 'proximoAcerto'
    | 'final'
  >;
  /** Nome de cada produto (id → nome). */
  nomesProdutos: Record<ID, string>;
  /** Pendência de acertos anteriores (com sinal; ver domain/pendencias.ts). */
  pendenciaAnteriorCentavos: Cents;
  /** Peças que ficaram no expositor (padrão: soma do estoque final dos itens). */
  totalPecasNoExpositor?: number;
}

/** Troca a linha inteira que contém `{variavel}` por `nova`. */
function trocarLinha(modelo: string, variavel: string, nova: string): string {
  const marca = `{${variavel}}`;
  return modelo
    .split('\n')
    .map((l) => (l.includes(marca) ? nova : l))
    .join('\n');
}

function pctTexto(pct: number): string {
  return formatQtd(roundTo(pct, 2), 2);
}

/**
 * Texto do comprovante. Linhas opcionais (PIX do expositor, pendência) somem quando zeradas.
 * {total} = valor do acerto + pendência anterior; se negativo, a linha vira
 * "Valor que vamos repassar a vocês: R$ {valor}".
 */
export function mensagemComprovante(d: DadosComprovante): string {
  const a = d.acerto;
  const nome = (id: ID) => d.nomesProdutos[id] || 'Produto';
  const vendidos = a.itens.filter((i) => i.vendidos > 0);
  const linhas = vendidos.length
    ? vendidos
        .map((i) => `• ${nome(i.produtoId)}: ${i.vendidos} × R$ ${valorMensagem(i.precoUnitCentavos)} = R$ ${valorMensagem(i.valorCentavos)}`)
        .join('\n')
    : '• Nenhuma venda no período';
  const repostos = a.itens.filter((i) => i.repostos > 0).map((i) => `${i.repostos} ${nome(i.produtoId)}`);
  const totalPecas = d.totalPecasNoExpositor ?? a.itens.reduce((s, i) => s + i.estoqueFinal, 0);
  const pendencia = d.pendenciaAnteriorCentavos || 0;
  const total = a.valorAcertoCentavos + pendencia;

  let modelo = d.modelo;
  if (pendencia < 0) {
    modelo = trocarLinha(modelo, 'pendencia', `Valor anterior a repassar a vocês: R$ ${valorMensagem(-pendencia)}`);
  }
  if (total < 0) {
    modelo = trocarLinha(modelo, 'total', `Valor que vamos repassar a vocês: R$ ${valorMensagem(-total)}`);
  } else {
    // Sem chave PIX cadastrada, tira só o trecho do PIX (a linha do total continua).
    if (!d.chavePix.trim()) modelo = modelo.replace(/\s*[—–-]?\s*PIX\s*\{chave_pix\}\s*(\(\{nome_pix\}\))?/gi, '');
    else if (!d.nomePix.trim()) modelo = modelo.replace(/\s*\(\{nome_pix\}\)/g, '');
  }
  if (a.final) modelo = trocarLinha(modelo, 'data_proximo', 'Obrigado pela parceria!');

  return preencherModelo(modelo, {
    responsavel: d.parceiro.responsavel?.trim() || d.parceiro.nome,
    empresa: d.empresa,
    parceiro: d.parceiro.nome,
    data_inicio: formatData(a.dataAnterior),
    data_fim: formatData(a.data),
    linhas,
    bruto: valorMensagem(a.brutoCentavos),
    pct_parceiro: pctTexto(a.pctParceiro),
    parte_parceiro: valorMensagem(a.parteParceiroCentavos),
    pct_dono: pctTexto(100 - a.pctParceiro),
    sua_parte: valorMensagem(a.suaParteCentavos),
    pix_direto: a.pixDiretoCentavos > 0 ? valorMensagem(a.pixDiretoCentavos) : '',
    pendencia: pendencia > 0 ? valorMensagem(pendencia) : '',
    total: valorMensagem(total),
    chave_pix: d.chavePix,
    nome_pix: d.nomePix,
    itens_repostos: repostos.length ? repostos.join(', ') : 'nenhuma',
    total_pecas: totalPecas,
    data_proximo: formatData(a.proximoAcerto),
  });
}
