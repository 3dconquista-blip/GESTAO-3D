// Termo de consignação (seção 8.12): modelo simples para imprimir ou enviar pelo WhatsApp. Funções puras.
// Contém: partes, endereço, itens com quantidade e preço de etiqueta, código do expositor, divisão,
// periodicidade do acerto, forma de pagamento, livre acesso do dono, guarda dos itens pelo parceiro
// (faltas sem explicação contam como vendidas), avarias/furto/perda, propriedade do expositor,
// aviso prévio de 15 dias, local, data e assinaturas, e o rodapé fixo.
import type { Cents, Config, Expositor, ISODate, Parceiro, QuemRecebe } from '../data/types.ts';
import { roundTo } from '../lib/money.ts';
import { formatBRL, formatData, formatQtd } from '../lib/format.ts';

/** Rodapé fixo do termo (seção 8.12). */
export const RODAPE_TERMO =
  'Modelo simples baseado no contrato estimatório (Código Civil, arts. 534 a 537). Não substitui orientação jurídica nem contábil.';

/** Dias de aviso prévio para encerrar a parceria. */
export const AVISO_PREVIO_DIAS = 15;

/** Rótulos literais de "quem recebe dos clientes" (seção 8.1). */
export const ROTULO_QUEM_RECEBE: Record<QuemRecebe, string> = {
  parceiro: 'O parceiro',
  pix_dono: 'Meu PIX no expositor',
  ambos: 'Ambos',
};

/** Percentual para texto: 30 -> '30%', 22.5 -> '22,5%'. */
function pct(valor: number): string {
  return `${formatQtd(roundTo(valor, 2), 2)}%`;
}

/** Divisão no padrão da tela: 30 -> 'Você 70% / Parceiro 30%'. */
export function rotuloDivisao(pctParceiro: number): string {
  return `Você ${pct(100 - pctParceiro)} / Parceiro ${pct(pctParceiro)}`;
}

/** Frequência do acerto: 15 -> 'A cada 15 dias'. */
export function rotuloFrequencia(dias: number): string {
  return `A cada ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

const MESES_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** '2026-10-16' -> '16 de outubro de 2026' ('1º' no primeiro dia do mês). */
export function dataPorExtenso(iso: ISODate): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return formatData(iso);
  return `${d === 1 ? '1º' : d} de ${MESES_EXTENSO[m - 1]} de ${y}`;
}

/** Número do WhatsApp guardado só com dígitos -> '(71) 99999-8888' (Brasil) ou '+1 4155552671'. */
export function formatarTelefone(digitos: string | null | undefined): string {
  const d = String(digitos ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    return `(${ddd}) ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
  }
  return `+${d}`;
}

export interface ItemTermo {
  nome: string;
  quantidade: number;
  /** Preço de etiqueta neste parceiro (centavos). */
  precoCentavos: Cents;
}

export interface EntradaTermo {
  /** config.empresa */
  empresa: Pick<Config['empresa'], 'nome'> & Partial<Pick<Config['empresa'], 'whatsapp' | 'chavePix' | 'nomePix' | 'cidade'>>;
  parceiro: Pick<Parceiro, 'nome' | 'pctParceiro' | 'frequenciaDias' | 'quemRecebe'> &
    Partial<Pick<Parceiro, 'responsavel' | 'whatsapp' | 'endereco' | 'bairro' | 'dataInicio' | 'notaRemessa'>>;
  expositores: (Pick<Expositor, 'codigo'> & Partial<Pick<Expositor, 'modelo' | 'capacidade'>>)[];
  itens: ItemTermo[];
  /** Data do termo (normalmente a da instalação). */
  data: ISODate;
  /** Cidade para "local e data" (padrão: cidade da empresa). */
  cidade?: string;
}

export type ChaveSecaoTermo =
  | 'partes'
  | 'endereco'
  | 'itens'
  | 'expositor'
  | 'divisao'
  | 'acerto'
  | 'pagamento'
  | 'acesso'
  | 'guarda'
  | 'avarias'
  | 'propriedade'
  | 'encerramento'
  | 'assinaturas';

export interface SecaoTermo {
  /** Identifica a seção (a tela pode trocar 'itens' por uma tabela com `Termo.itens`). */
  chave: ChaveSecaoTermo;
  titulo: string;
  paragrafos: string[];
}

export interface AssinaturaTermo {
  parte: 'DONO' | 'PARCEIRO';
  /** Nome da empresa ou do estabelecimento. */
  nome: string;
  /** Pessoa que assina (pode ser vazio: a linha fica para preencher à mão). */
  responsavel: string;
}

export interface Termo {
  titulo: string;
  secoes: SecaoTermo[];
  itens: (ItemTermo & { valorCentavos: Cents })[];
  totalPecas: number;
  totalCentavos: Cents;
  /** 'Salvador, 16 de outubro de 2026' */
  localData: string;
  assinaturas: AssinaturaTermo[];
  rodape: string;
  /** Texto corrido para copiar ou enviar pelo WhatsApp. */
  textoPlano: string;
}

const LINHA_ASSINATURA = '______________________________';

function texto(v: string | null | undefined): string {
  return String(v ?? '').trim();
}

/** Monta o "Termo de consignação" (seção 8.12) com todas as cláusulas, em linguagem simples. */
export function montarTermo(e: EntradaTermo): Termo {
  const empresa = texto(e.empresa.nome) || 'Dono';
  const parceiro = texto(e.parceiro.nome) || 'Parceiro';
  const responsavelParceiro = texto(e.parceiro.responsavel);
  const nomePix = texto(e.empresa.nomePix);
  const chavePix = texto(e.empresa.chavePix);
  const cidade = texto(e.cidade) || texto(e.empresa.cidade);
  const pp = e.parceiro.pctParceiro;
  const pd = roundTo(100 - pp, 2);

  const itens = e.itens
    .filter((i) => i.quantidade > 0)
    .map((i) => ({ ...i, valorCentavos: i.quantidade * i.precoCentavos }));
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const totalCentavos = itens.reduce((s, i) => s + i.valorCentavos, 0);

  const secoes: SecaoTermo[] = [];

  // Partes
  const waDono = formatarTelefone(e.empresa.whatsapp);
  const waParceiro = formatarTelefone(e.parceiro.whatsapp);
  const partes = [
    `DONO: ${empresa}${nomePix ? ` (responsável: ${nomePix})` : ''}${waDono ? `, WhatsApp ${waDono}` : ''}. É o dono dos produtos e do expositor.`,
    `PARCEIRO: ${parceiro}${responsavelParceiro ? ` (responsável: ${responsavelParceiro})` : ''}${waParceiro ? `, WhatsApp ${waParceiro}` : ''}.`,
    'O DONO deixa produtos com o PARCEIRO para expor e vender (consignação). O PARCEIRO não paga nada para receber os itens nem o expositor: os valores são acertados só sobre o que for vendido.',
  ];
  if (e.parceiro.dataInicio) partes.push(`Início da parceria: ${formatData(e.parceiro.dataInicio)}.`);
  secoes.push({ chave: 'partes', titulo: 'Partes', paragrafos: partes });

  // Endereço
  const endereco = [texto(e.parceiro.endereco), texto(e.parceiro.bairro)].filter(Boolean).join(' — ');
  secoes.push({
    chave: 'endereco',
    titulo: 'Endereço',
    paragrafos: [
      endereco
        ? `Os itens e o expositor ficam no endereço do PARCEIRO: ${endereco}${cidade ? `, ${cidade}` : ''}.`
        : `Os itens e o expositor ficam no endereço do PARCEIRO: ${LINHA_ASSINATURA}${LINHA_ASSINATURA}.`,
    ],
  });

  // Itens
  const linhasItens = itens.map(
    (i) => `• ${i.nome}: ${i.quantidade} ${i.quantidade === 1 ? 'unidade' : 'unidades'} × ${formatBRL(i.precoCentavos)} = ${formatBRL(i.valorCentavos)}`,
  );
  const parItens = linhasItens.length ? linhasItens : ['Nenhum item nesta remessa.'];
  parItens.push(
    `Total: ${totalPecas} ${totalPecas === 1 ? 'peça' : 'peças'}, que somam ${formatBRL(totalCentavos)} pelo preço de etiqueta.`,
    'Os valores acima são os preços de etiqueta para venda ao cliente. As próximas reposições seguem este mesmo termo e ficam registradas nos comprovantes de acerto.',
  );
  if (texto(e.parceiro.notaRemessa)) parItens.push(`Nota de remessa nº ${texto(e.parceiro.notaRemessa)}.`);
  secoes.push({ chave: 'itens', titulo: 'Itens deixados em consignação', paragrafos: parItens });

  // Expositor
  const exps = e.expositores.map((x) => {
    const det = [texto(x.modelo), x.capacidade ? `${x.capacidade} vagas` : ''].filter(Boolean).join(', ');
    return `${x.codigo}${det ? ` (${det})` : ''}`;
  });
  secoes.push({
    chave: 'expositor',
    titulo: 'Expositor',
    paragrafos: [
      exps.length === 0
        ? 'Expositor: nenhum informado.'
        : `${exps.length > 1 ? 'Expositores' : 'Expositor'}: ${exps.join('; ')}.`,
      `O expositor é do DONO e fica emprestado ao PARCEIRO, sem custo, enquanto durar a parceria.`,
    ],
  });

  // Divisão
  secoes.push({
    chave: 'divisao',
    titulo: 'Divisão do valor vendido',
    paragrafos: [
      `Divisão: ${empresa} (DONO) ${pct(pd)} / ${parceiro} (PARCEIRO) ${pct(pp)}.`,
      `Do total vendido no expositor, pelo preço de etiqueta, o DONO fica com ${pct(pd)} e o PARCEIRO fica com ${pct(pp)}.`,
    ],
  });

  // Acerto (periodicidade)
  const dias = e.parceiro.frequenciaDias;
  secoes.push({
    chave: 'acerto',
    titulo: 'Acerto',
    paragrafos: [
      `O acerto é feito a cada ${dias} ${dias === 1 ? 'dia' : 'dias'}.`,
      'Na visita, o DONO conta os itens, calcula o que foi vendido, acerta os valores com o PARCEIRO e repõe o expositor. Cada acerto tem um comprovante.',
    ],
  });

  // Forma de pagamento
  const pixTexto = chavePix ? ` (chave PIX ${chavePix}${nomePix ? `, em nome de ${nomePix}` : ''})` : '';
  const pagamento: string[] = [];
  if (e.parceiro.quemRecebe === 'pix_dono') {
    pagamento.push(
      `Os clientes pagam direto no PIX do DONO, indicado no expositor${pixTexto}. No acerto, o DONO repassa ao PARCEIRO a parte dele (${pct(pp)} do total vendido).`,
    );
  } else if (e.parceiro.quemRecebe === 'ambos') {
    pagamento.push(
      `Os clientes podem pagar ao PARCEIRO ou no PIX do DONO indicado no expositor${pixTexto}. No acerto, o que já entrou no PIX do DONO é descontado, e quem recebeu a mais repassa a diferença.`,
    );
  } else {
    pagamento.push(
      `Os clientes pagam ao PARCEIRO. No acerto, o PARCEIRO repassa ao DONO a parte dele (${pct(pd)} do total vendido).`,
    );
  }
  pagamento.push(`Os acertos são pagos por PIX${pixTexto} ou em dinheiro.`);
  secoes.push({ chave: 'pagamento', titulo: 'Forma de pagamento', paragrafos: pagamento });

  // Livre acesso
  secoes.push({
    chave: 'acesso',
    titulo: 'Livre acesso para conferir',
    paragrafos: [
      'O DONO tem livre acesso ao expositor, no horário de funcionamento do PARCEIRO, para conferir, contar, repor ou recolher os itens quando quiser.',
    ],
  });

  // Guarda dos itens
  secoes.push({
    chave: 'guarda',
    titulo: 'Guarda dos itens',
    paragrafos: [
      'O PARCEIRO guarda e cuida dos itens e do expositor até que sejam vendidos ou devolvidos ao DONO.',
      'Itens que faltarem na contagem sem explicação contam como vendidos e entram no acerto.',
    ],
  });

  // Avarias, furto e perda
  secoes.push({
    chave: 'avarias',
    titulo: 'Avarias, furto e perda',
    paragrafos: [
      'O PARCEIRO avisa o DONO assim que perceber um item estragado, furtado ou perdido.',
      'Item estragado que estiver no expositor volta para o DONO e não é cobrado do PARCEIRO.',
      'Item furtado ou perdido conta como vendido, a não ser que o DONO decida abonar a falta.',
      'Se o expositor for danificado, furtado ou perdido, o PARCEIRO avisa o DONO e os dois combinam o conserto ou a reposição.',
    ],
  });

  // Propriedade
  secoes.push({
    chave: 'propriedade',
    titulo: 'Propriedade do expositor e dos itens',
    paragrafos: [
      'O expositor é do DONO durante toda a parceria. Os itens também são do DONO até serem vendidos aos clientes.',
      'O PARCEIRO não pode vender, emprestar ou dar como garantia o expositor, nem dar os itens como garantia.',
    ],
  });

  // Encerramento
  secoes.push({
    chave: 'encerramento',
    titulo: 'Encerramento',
    paragrafos: [
      `Qualquer uma das partes pode encerrar a parceria avisando a outra com ${AVISO_PREVIO_DIAS} dias de antecedência.`,
      'No encerramento é feito um acerto final: os itens que sobraram e o expositor voltam para o DONO, e os valores ainda em aberto continuam devidos.',
    ],
  });

  // Local, data e assinaturas
  const localData = `${cidade || LINHA_ASSINATURA}, ${dataPorExtenso(e.data)}`;
  const assinaturas: AssinaturaTermo[] = [
    { parte: 'DONO', nome: empresa, responsavel: nomePix },
    { parte: 'PARCEIRO', nome: parceiro, responsavel: responsavelParceiro },
  ];
  secoes.push({
    chave: 'assinaturas',
    titulo: 'Local, data e assinaturas',
    paragrafos: [
      `${localData}.`,
      ...assinaturas.map(
        (a) => `${LINHA_ASSINATURA}\n${a.parte}: ${a.nome}${a.responsavel ? ` — ${a.responsavel}` : ''}`,
      ),
    ],
  });

  const titulo = 'Termo de consignação';
  const corpo = secoes.map((s, i) => [`${i + 1}. ${s.titulo}`, ...s.paragrafos].join('\n'));
  const textoPlano = [titulo.toUpperCase(), ...corpo, RODAPE_TERMO].join('\n\n');

  return { titulo, secoes, itens, totalPecas, totalCentavos, localData, assinaturas, rodape: RODAPE_TERMO, textoPlano };
}
