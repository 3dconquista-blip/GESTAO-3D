// Mensagens de WhatsApp dos pedidos e clientes (seção 9.4). Funções puras.
// Os textos vêm dos modelos editáveis em config.mensagens e são preenchidos com preencherModelo
// (linhas com variável vazia somem — "se houver"). Valores sem 'R$ ' (o modelo já traz 'R$ {valor}').
// Número do pedido na variável {numero} sem '#': os modelos já trazem '#{numero}' -> '#0001'.
// Para abrir o WhatsApp: linkWhatsApp(cliente.whatsapp, texto) de domain/whatsapp.ts.
import type { Cents } from '../lib/money.ts';
import { formatData, formatQtd } from '../lib/format.ts';
import type { Cliente, Config, Pagamento, Pedido } from '../data/types.ts';
import { preencherModelo, valorMensagem } from './whatsapp.ts';
import { situacaoFinanceira } from './pedidos.ts';

type Vars = Record<string, string | number | null | undefined>;

/** Primeiro nome do cliente, para a saudação ("Olá, Marina!"). */
export function primeiroNome(cliente: Pick<Cliente, 'nome'> | null | undefined): string {
  return (cliente?.nome || '').trim().split(/\s+/)[0] || '';
}

/** Variáveis comuns a todas as mensagens de pedido. */
function varsPedido(pedido: Pedido, cliente: Pick<Cliente, 'nome'> | null | undefined, config: Config): Vars {
  return {
    cliente: primeiroNome(cliente),
    numero: String(pedido.numero).padStart(4, '0'),
    titulo: pedido.titulo,
    empresa: config.empresa.nome,
    chave_pix: config.empresa.chavePix,
    nome_pix: config.empresa.nomePix || config.empresa.nome,
    prazo: pedido.prazo ? formatData(pedido.prazo) : 'a combinar',
    total: valorMensagem(pedido.totalCentavos),
  };
}

/** Linhas dos itens: "• 20 × Chaveiro com nome". */
export function linhasItens(pedido: Pedido): string {
  return pedido.itens.map((i) => `• ${formatQtd(i.quantidade)} × ${i.descricao}`).join('\n');
}

/** Frase de entrega da mensagem "pedido pronto" (retirada, entrega própria ou Correios). */
export function textoEntrega(pedido: Pedido, cliente?: Pick<Cliente, 'endereco'> | null): string {
  const { tipo, rastreio } = pedido.entrega;
  if (tipo === 'retirada') return 'Pode retirar quando for melhor para você. É só me avisar o horário.';
  if (tipo === 'propria') {
    return cliente?.endereco ? `Vou entregar em ${cliente.endereco}. Qual o melhor horário?` : 'Vamos combinar a entrega? Me passe o endereço e o melhor horário.';
  }
  return rastreio
    ? `Vou enviar pelos Correios/transportadora. Código de rastreio: ${rastreio}`
    : 'Vou enviar pelos Correios/transportadora e te mando o código de rastreio.';
}

/**
 * Mensagem de orçamento: itens, total (já com o frete), frete (se houver), sinal, prazo,
 * validade, PIX e a política de cancelamento das Configurações.
 */
export function mensagemOrcamento(pedido: Pedido, cliente: Pick<Cliente, 'nome'> | null | undefined, config: Config): string {
  const frete = pedido.entrega.freteCentavos;
  return preencherModelo(config.mensagens.orcamento, {
    ...varsPedido(pedido, cliente, config),
    itens: linhasItens(pedido),
    frete: frete > 0 ? valorMensagem(frete) : '',
    total_sem_frete: valorMensagem(pedido.totalCentavos - frete),
    sinal_pct: formatQtd(pedido.sinalPct),
    sinal: pedido.sinalCentavos > 0 ? valorMensagem(pedido.sinalCentavos) : '',
    validade: formatData(pedido.validade),
    politica_cancelamento: config.empresa.politicaCancelamento,
  });
}

/**
 * Mensagem "sinal recebido". O valor padrão é o total já pago no pedido
 * (ou o sinal sugerido, se ainda não houver pagamento).
 */
export function mensagemSinalRecebido(
  pedido: Pedido,
  cliente: Pick<Cliente, 'nome'> | null | undefined,
  config: Config,
  pagamentos: Pagamento[],
  valorCentavos?: Cents,
): string {
  const pago = situacaoFinanceira(pedido, pagamentos).pagoCentavos;
  const valor = valorCentavos ?? (pago > 0 ? pago : pedido.sinalCentavos);
  return preencherModelo(config.mensagens.sinal_recebido, { ...varsPedido(pedido, cliente, config), valor: valorMensagem(valor) });
}

/** Mensagem "pedido pronto", com o saldo a pagar (se houver) e a forma de entrega. */
export function mensagemPedidoPronto(
  pedido: Pedido,
  cliente: Pick<Cliente, 'nome' | 'endereco'> | null | undefined,
  config: Config,
  pagamentos: Pagamento[],
): string {
  const saldo = situacaoFinanceira(pedido, pagamentos).saldoCentavos;
  return preencherModelo(config.mensagens.pedido_pronto, {
    ...varsPedido(pedido, cliente, config),
    saldo: saldo > 0 ? valorMensagem(saldo) : '',
    entrega: textoEntrega(pedido, cliente),
  });
}

/** Lembrete de saldo. null quando não há saldo a receber. */
export function mensagemLembreteSaldo(
  pedido: Pedido,
  cliente: Pick<Cliente, 'nome'> | null | undefined,
  config: Config,
  pagamentos: Pagamento[],
): string | null {
  const saldo = situacaoFinanceira(pedido, pagamentos).saldoCentavos;
  if (saldo <= 0) return null;
  return preencherModelo(config.mensagens.lembrete_saldo, { ...varsPedido(pedido, cliente, config), saldo: valorMensagem(saldo) });
}

/** Mensagem de pós-venda (sugerida ao entregar). */
export function mensagemPosVenda(pedido: Pedido, cliente: Pick<Cliente, 'nome'> | null | undefined, config: Config): string {
  return preencherModelo(config.mensagens.pos_venda, varsPedido(pedido, cliente, config));
}

/** Cliente pode receber promoções e felicitações? Só com "Aceita receber novidades". */
export function podeReceberNovidades(cliente: Pick<Cliente, 'aceitaNovidades' | 'anonimizado'> | null | undefined): boolean {
  return !!cliente && cliente.aceitaNovidades === true && !cliente.anonimizado;
}

/** Mensagem de promoção com o texto do dono. null se o cliente não aceita receber novidades. */
export function mensagemPromocao(cliente: Cliente, config: Config, texto: string): string | null {
  if (!podeReceberNovidades(cliente)) return null;
  return preencherModelo(config.mensagens.promocao, { cliente: primeiroNome(cliente), empresa: config.empresa.nome, texto: texto.trim() });
}

/** Mensagem de aniversário. null se o cliente não aceita receber novidades. */
export function mensagemAniversario(cliente: Cliente, config: Config): string | null {
  if (!podeReceberNovidades(cliente)) return null;
  return preencherModelo(config.mensagens.aniversario, { cliente: primeiroNome(cliente), empresa: config.empresa.nome });
}
