// Valores padrão (seção 6.1, 8, 9 e 12 da especificação).
import type { Canal, ChaveMensagem, Config, Impressora, Novo } from './types.ts';

export const CANAIS_PADRAO: Canal[] = [
  { id: 'direto_pix', nome: 'Direto PIX/dinheiro', tipo: 'direto', comissaoPct: 0, tarifaFixaCentavos: 0, ativo: true },
  { id: 'direto_cartao', nome: 'Direto cartão', tipo: 'cartao', comissaoPct: 0, tarifaFixaCentavos: 0, ativo: true },
  { id: 'parceiro_80_20', nome: 'Parceiro 80/20', tipo: 'parceiro', comissaoPct: 20, tarifaFixaCentavos: 0, ativo: true },
  { id: 'parceiro_70_30', nome: 'Parceiro 70/30', tipo: 'parceiro', comissaoPct: 30, tarifaFixaCentavos: 0, ativo: true },
  { id: 'marketplace', nome: 'Marketplace', tipo: 'marketplace', comissaoPct: 0, tarifaFixaCentavos: 0, ativo: false },
];

export const CATEGORIAS_PADRAO = ['Chaveiro', 'Display', 'Decoração', 'Personalizado', 'Outro'];

export const POLITICA_CANCELAMENTO_PADRAO =
  'Cancelamento: o sinal garante a reserva da produção. Se o pedido for cancelado antes do início da modelagem ou impressão, devolvemos o sinal. Depois disso, o sinal fica retido para cobrir o material e o trabalho já feitos.';

export const MENSAGENS_PADRAO: Record<ChaveMensagem, string> = {
  orcamento: [
    'Olá, {cliente}! Segue o orçamento do pedido #{numero} — {titulo}:',
    '{itens}',
    'Total: R$ {total}',
    'Frete: R$ {frete}',
    'Sinal para começar ({sinal_pct}%): R$ {sinal}',
    'Prazo: {prazo}',
    'Orçamento válido até {validade}.',
    'PIX: {chave_pix} ({nome_pix})',
    '{politica_cancelamento}',
  ].join('\n'),
  sinal_recebido:
    'Olá, {cliente}! Recebemos o sinal de R$ {valor} do pedido #{numero} — {titulo}. Já vamos começar! Previsão de entrega: {prazo}. Obrigado!',
  // Cada informação opcional fica na sua linha: linha com variável vazia some (ex.: sem chave PIX).
  pedido_pronto: [
    'Olá, {cliente}! Seu pedido #{numero} — {titulo} está pronto! 🎉',
    'Saldo a pagar: R$ {saldo}',
    'PIX: {chave_pix} ({nome_pix})',
    '{entrega}',
  ].join('\n'),
  lembrete_saldo: [
    'Olá, {cliente}! Passando para lembrar do saldo de R$ {saldo} do pedido #{numero} — {titulo}.',
    'PIX: {chave_pix} ({nome_pix})',
    'Qualquer dúvida, estou à disposição!',
  ].join('\n'),
  pos_venda:
    'Olá, {cliente}! Tudo certo com o pedido #{numero}? Se puder, mande uma foto ou marque a gente no Instagram. Obrigado pela preferência! — {empresa}',
  comprovante_acerto: [
    'Olá, {responsavel}! Segue o acerto da parceria {empresa} × {parceiro}, de {data_inicio} a {data_fim}:',
    '{linhas}',
    'Total vendido: R$ {bruto}',
    'Parte de vocês ({pct_parceiro}%): R$ {parte_parceiro}',
    'Parte {empresa} ({pct_dono}%): R$ {sua_parte}',
    'Já recebido no PIX do expositor: R$ {pix_direto}',
    'Pendência anterior: R$ {pendencia}',
    'Total a acertar: R$ {total} — PIX {chave_pix} ({nome_pix})',
    'Reposição de hoje: {itens_repostos}. Ficaram {total_pecas} peças no expositor.',
    'Próximo acerto: {data_proximo}. Obrigado pela parceria!',
  ].join('\n'),
  promocao: 'Olá, {cliente}! Novidade da {empresa}: {texto}',
  aniversario: 'Feliz aniversário, {cliente}! 🎉 A {empresa} deseja um dia incrível para você.',
};

export function configPadrao(): Config {
  const agora = new Date(0).toISOString();
  return {
    id: 'config',
    criadoEm: agora,
    atualizadoEm: agora,
    empresa: {
      nome: 'OCTA',
      corPrincipal: '#2B4A6B',
      whatsapp: '',
      chavePix: '',
      nomePix: '',
      cidade: '',
      politicaCancelamento: POLITICA_CANCELAMENTO_PADRAO,
    },
    custos: {
      tarifaKwh: 0.95,
      valorHora: 20,
      valorHoraModelagem: 40,
      taxaFalhaPct: 5,
      impostoPct: 0,
      margemDesejadaPct: 50,
      margemMinimaPct: 30,
      arredondamento: 'noventa',
      taxaCartaoPct: 3.5,
      custosFixosMensaisCentavos: 8205,
      limiteMeiCentavos: 8100000,
    },
    canais: CANAIS_PADRAO.map((c) => ({ ...c })),
    pedidos: {
      pedidoMinimoCentavos: 3000,
      validadeDias: 7,
      urgenciaPct: 20,
      descontoQtdPct: 10,
      descontoQtdAPartir: 10,
      sinalPct: 50,
      proximoNumero: 1,
    },
    parcerias: {
      divisoes: [30, 20],
      frequenciaPadraoDias: 15,
      diasAviso: 3,
      limiteBaixoDesempenhoCentavos: 5000,
    },
    estoque: {
      diasSemVendaAlerta: 60,
      minimoFilamentoPadraoG: 250,
    },
    categorias: [...CATEGORIAS_PADRAO],
    mensagens: { ...MENSAGENS_PADRAO },
    onboardingConcluido: false,
    proximoCodigoProduto: 1,
  };
}

/** Padrões ao cadastrar impressoras Bambu Lab (seção 6.2). */
export const MODELOS_IMPRESSORA: Record<string, Omit<Novo<Impressora>, 'nome'>> = {
  'A1 mini': { modelo: 'A1 mini', valorPago: 2179, vidaUtilH: 5000, potenciaW: 100, manutencaoH: 0.05, ativa: true },
  A1: { modelo: 'A1', valorPago: 2998, vidaUtilH: 5000, potenciaW: 95, manutencaoH: 0.05, ativa: true },
  Outra: { modelo: 'Outra', valorPago: 0, vidaUtilH: 5000, potenciaW: 100, manutencaoH: 0.05, ativa: true },
};

export const ROTULO_TIPO_PARCEIRO: Record<string, string> = {
  academia: 'Academia',
  loja: 'Loja',
  salao: 'Salão',
  cafe: 'Café',
  escritorio: 'Escritório',
  outro: 'Outro',
};

export const ROTULO_ETAPA: Record<string, string> = {
  orcamento: 'Orçamento',
  aprovado: 'Aprovado',
  producao: 'Em produção',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const ROTULO_FORMA: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
};

export const ROTULO_CANAL_VENDA: Record<string, string> = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  feira: 'Feira',
  expositor: 'Expositor de parceiro',
  indicacao: 'Indicação',
  outro: 'Outro',
};

export const ROTULO_TIPO_MOV: Record<string, string> = {
  producao: 'Produção',
  venda_direta: 'Venda direta',
  remessa: 'Remessa ao parceiro',
  venda_parceiro: 'Venda no parceiro',
  recolhimento: 'Recolhimento',
  perda: 'Perda',
  ajuste: 'Ajuste de inventário',
  estorno: 'Estorno',
};

export const ROTULO_MOTIVO_PERDA: Record<string, string> = {
  avaria: 'Avaria',
  falta_abonada: 'Falta abonada',
  defeito: 'Defeito',
  brinde: 'Brinde',
  uso_proprio: 'Uso próprio',
  expositor_perdido: 'Expositor perdido',
  outro: 'Outro',
};
