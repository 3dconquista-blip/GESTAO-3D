// Modelo de dados do 3D gestão (seção 13 da especificação, adaptado).
// Convenções:
// - Campos *Centavos / Cents: dinheiro de transação em centavos inteiros.
// - Custos (custoMedio, custoUnit, valorPago...) são números em reais (até 4 casas).
// - Percentuais (*Pct) vão de 0 a 100 (50 = 50%).
// - Datas civis: 'YYYY-MM-DD'. Carimbos: ISO completo.
// - Tabelas filhas da especificação (produto_mesas, mesa_filamentos, produto_componentes,
//   mix_parceiro, parceiro_percentuais, acerto_itens, pedido_itens, pedido_historico,
//   venda_itens) ficam embutidas no registro pai. Ver DECISOES.md.
// - Nada com histórico é apagado: cadastros têm `arquivado`, lançamentos são estornados.
import type { Cents, ModoArredondamento } from '../lib/money.ts';
import type { ISODate, ISODateTime } from '../lib/dates.ts';

export type { Cents, ISODate, ISODateTime, ModoArredondamento };
export type ID = string;

export interface Base {
  id: ID;
  criadoEm: ISODateTime;
  atualizadoEm: ISODateTime;
  /** Registro criado por "Carregar dados de exemplo". */
  exemplo?: boolean;
}

// ---------------------------------------------------------------- Configurações

export type TipoCanal = 'direto' | 'cartao' | 'parceiro' | 'marketplace' | 'outro';

export interface Canal {
  id: string;
  nome: string;
  tipo: TipoCanal;
  /** Comissão % sobre o preço de etiqueta. Para tipo 'cartao' vale a taxa do cartão da configuração. */
  comissaoPct: number;
  /** Tarifa fixa por item (marketplace). */
  tarifaFixaCentavos: Cents;
  ativo: boolean;
}

export type ChaveMensagem =
  | 'orcamento'
  | 'sinal_recebido'
  | 'pedido_pronto'
  | 'lembrete_saldo'
  | 'pos_venda'
  | 'comprovante_acerto'
  | 'promocao'
  | 'aniversario';

export interface ParametrosCusto {
  tarifaKwh: number; // R$/kWh
  valorHora: number; // R$/h do trabalho do dono
  valorHoraModelagem: number; // R$/h
  taxaFalhaPct: number;
  margemDesejadaPct: number;
  margemMinimaPct: number;
  arredondamento: ModoArredondamento;
  taxaCartaoPct: number;
  custosFixosMensaisCentavos: Cents;
}

export interface Config extends Base {
  empresa: {
    nome: string;
    logoDataUrl?: string;
    corPrincipal: string;
    whatsapp: string;
    chavePix: string;
    nomePix: string;
    cidade: string;
    politicaCancelamento: string;
  };
  custos: ParametrosCusto;
  canais: Canal[];
  pedidos: {
    pedidoMinimoCentavos: Cents;
    validadeDias: number;
    urgenciaPct: number;
    descontoQtdPct: number;
    descontoQtdAPartir: number;
    sinalPct: number;
    proximoNumero: number;
  };
  parcerias: {
    /** Opções de % do parceiro (ex.: [30, 20]). */
    divisoes: number[];
    frequenciaPadraoDias: number;
    diasAviso: number;
    limiteBaixoDesempenhoCentavos: Cents;
  };
  estoque: {
    diasSemVendaAlerta: number;
    minimoFilamentoPadraoG: number;
  };
  categorias: string[];
  mensagens: Record<ChaveMensagem, string>;
  onboardingConcluido: boolean;
  /** Próximo número para código automático de produto (P-0001). */
  proximoCodigoProduto: number;
  /** Parâmetros de custo antes de carregar os dados de exemplo (restaurados ao apagá-los). */
  custosAntesDoExemplo?: ParametrosCusto;
  /** Dados de exemplo carregados. */
  exemploCarregado?: boolean;
}

// ---------------------------------------------------------------- Impressoras

export interface Impressora extends Base {
  nome: string;
  modelo: string; // 'A1', 'A1 mini', ...
  valorPago: number; // R$
  vidaUtilH: number;
  potenciaW: number;
  manutencaoH: number; // R$/h
  ativa: boolean;
}

// ---------------------------------------------------------------- Materiais e insumos

export type TipoFilamento = 'PLA' | 'PETG' | 'TPU' | 'ABS' | 'ASA' | 'Outro';

export interface Material extends Base {
  tipo: 'filamento' | 'insumo';
  nome: string; // 'PLA Preto', 'Argola'
  material?: TipoFilamento;
  corNome?: string;
  corHex?: string;
  marca?: string;
  /** 'g' para filamento, 'un' (ou outra unidade) para insumo. */
  unidade: string;
  /** Filamento: R$ por kg. Insumo: R$ por unidade. */
  custoMedio: number;
  /** Mínimo em gramas (filamento) ou unidades (insumo). */
  minimo: number;
  /** Obsoleto (versões antigas): o app usa sempre 170 g de carretel vazio (TARA_CARRETEL_G). */
  taraCarretelG?: number;
  arquivado: boolean;
}

export type TipoMovMaterial = 'compra' | 'producao' | 'pedido' | 'ajuste' | 'perda' | 'estorno';

export interface MovMaterial extends Base {
  materialId: ID;
  data: ISODate;
  tipo: TipoMovMaterial;
  /** +entrada / −saída, em gramas (filamento) ou unidades (insumo). */
  quantidade: number;
  /** Valor pago (compras). */
  valorTotalCentavos?: Cents;
  /** Custo médio (R$/kg ou R$/un) no momento do movimento. */
  custoUnitSnapshot?: number;
  motivo?: string;
  refTipo?: 'producao' | 'pedido' | 'compra' | 'pesagem' | 'ajuste';
  refId?: ID;
  /** Este movimento anula o movimento indicado. */
  estornoDe?: ID;
}

// ---------------------------------------------------------------- Produtos

export interface MesaFilamento {
  /** Tipo de filamento (PLA, PETG...). A cor é escolhida na produção (produto) ou em "Pronto" (peça de pedido). */
  tipo?: TipoFilamento;
  /** Carretel (cor) específico: em fichas e itens de pedido antigos (custo e baixa por ele); no produto, só a cor sugerida. */
  materialId?: ID;
  /** Gramas da mesa inteira (total do fatiador, com purga e suportes). */
  gramas: number;
}

export interface Mesa {
  id: ID;
  /** Quantas unidades do produto esta mesa produz (N). */
  pecasPorMesa: number;
  tempoMin: number;
  impressoraId: ID;
  filamentos: MesaFilamento[];
}

export interface Componente {
  materialId: ID;
  /** Quantidade por peça. */
  quantidade: number;
}

export type LicencaVenda = 'sim' | 'nao' | 'nao_sei';

export interface Produto extends Base {
  nome: string;
  /** Obsoleto (produtos por cor, antes da decisão 85): só leitura em dados antigos. */
  modelo?: string;
  /** Obsoleto: o produto não tem cor; a cor é escolhida em cada produção. */
  cor?: string;
  categoria: string;
  fotoDataUrl?: string;
  codigo: string; // automático: P-0001
  precoEtiquetaCentavos: Cents;
  estoqueMinimo: number; // em Casa
  maoDeObraMin: number; // por peça
  mesas: Mesa[];
  componentes: Componente[];
  origemModelo: 'proprio' | 'terceiro';
  linkModelo?: string;
  licencaVenda?: LicencaVenda;
  /** Margem de lucro própria deste produto (%). Sem ela, vale a margem desejada da configuração. */
  margemPct?: number;
  arquivado: boolean;
  /** Excluído pelo dono: some do app, mas as movimentações e vendas antigas continuam apontando para ele. */
  excluido?: boolean;
  excluidoEm?: ISODate;
}

// ---------------------------------------------------------------- Estoque

/** 'casa' ou 'p:<parceiroId>' (local automático de cada parceiro). */
export type LocalId = string;
export const CASA: LocalId = 'casa';
export const localParceiro = (parceiroId: ID): LocalId => `p:${parceiroId}`;
export const parceiroDoLocal = (local: LocalId): ID | null => (local.startsWith('p:') ? local.slice(2) : null);

export type TipoMovEstoque =
  | 'producao' // entra em Casa
  | 'venda_direta' // sai de Casa (venda rápida ou entrega de pedido)
  | 'remessa' // Casa -> Parceiro
  | 'venda_parceiro' // sai do Parceiro (gerada no acerto)
  | 'recolhimento' // Parceiro -> Casa
  | 'perda' // sai do local
  | 'ajuste' // entra ou sai, motivo obrigatório
  | 'estorno'; // anula um movimento anterior

export type MotivoPerda = 'avaria' | 'falta_abonada' | 'defeito' | 'brinde' | 'uso_proprio' | 'expositor_perdido' | 'outro';

export interface MovEstoque extends Base {
  data: ISODate;
  produtoId: ID;
  /** Sempre positiva; a direção vem de origem/destino. */
  quantidade: number;
  /** null = fora do estoque (produção, compra). */
  origem: LocalId | null;
  /** null = sai do estoque (venda, perda). */
  destino: LocalId | null;
  tipo: TipoMovEstoque;
  motivo?: string;
  refTipo?: 'venda' | 'acerto' | 'pedido' | 'producao' | 'instalacao' | 'reposicao' | 'recolhimento' | 'ajuste' | 'perda' | 'encerramento' | 'exclusao';
  refId?: ID;
  /** Custo unitário do produto no momento (reais, 4 casas). */
  custoUnit: number;
  /** Preço unitário do momento (centavos), quando houver. */
  precoUnitCentavos?: Cents;
  estornoDe?: ID;
}

export interface Producao extends Base {
  data: ISODate;
  produtoId: ID;
  qtdBoa: number;
  qtdPerdida: number;
  /** Quando informado, substitui o cálculo do filamento. */
  gramasReais?: MesaFilamento[];
  /** Cor (carretel) usada em cada posição de filamento da ficha: 'mesaId:indice' -> materialId. */
  cores?: Record<string, ID>;
  custoUnit: number;
  estornada?: boolean;
}

// ---------------------------------------------------------------- Parceiros e expositores

export type TipoParceiro = 'academia' | 'loja' | 'salao' | 'cafe' | 'escritorio' | 'outro';
export type QuemRecebe = 'parceiro' | 'pix_dono' | 'ambos';
export type SituacaoParceiro = 'ativo' | 'pausado' | 'encerrado';

export interface ItemMix {
  produtoId: ID;
  /** Quanto deve ficar no expositor após cada reposição. */
  nivelIdeal: number;
  /** Preço próprio deste parceiro (opcional; padrão = etiqueta do produto). */
  precoEtiquetaCentavos?: Cents;
}

export interface Parceiro extends Base {
  nome: string; // nome do estabelecimento
  tipo: TipoParceiro;
  responsavel: string;
  whatsapp: string;
  endereco: string;
  bairro: string;
  linkMapa: string;
  /** % atual do parceiro (30 = "Você 70% / Parceiro 30%"). */
  pctParceiro: number;
  /** Histórico de percentuais; o acerto usa o vigente no início do ciclo. */
  percentuais: { pct: number; vigenteDesde: ISODate }[];
  frequenciaDias: number;
  quemRecebe: QuemRecebe;
  dataInicio: ISODate;
  situacao: SituacaoParceiro;
  termoAssinado: boolean;
  termoData?: ISODate;
  termoFotoDataUrl?: string;
  notaRemessa?: string;
  observacoes?: string;
  mix: ItemMix[];
  /** Data da instalação (primeira remessa). */
  instaladoEm?: ISODate;
  /** Lembrete para reimprimir o termo após mudar a divisão. */
  lembrarReimprimirTermo?: boolean;
  arquivado: boolean;
}

export type EstadoExpositor = 'ok' | 'danificado' | 'perdido';

export interface Expositor extends Base {
  codigo: string; // EXP-01
  modelo: string;
  capacidade: number;
  custoCentavos: Cents;
  dataInstalacao?: ISODate;
  /** null = em Casa. */
  parceiroId: ID | null;
  estado: EstadoExpositor;
  /** Data em que foi marcado como perdido (vira perda pelo custo nos relatórios). */
  perdidoEm?: ISODate;
  fotoDataUrl?: string;
  arquivado: boolean;
}

export interface AcertoItem {
  produtoId: ID;
  esperado: number;
  contei: number;
  avariados: number;
  recolhidos: number;
  faltasAbonadas: number;
  motivoFalta?: string;
  /** Unidades a mais encontradas (contei > esperado, confirmado): vira ajuste de entrada. */
  ajusteEntrada: number;
  vendidos: number;
  precoUnitCentavos: Cents;
  valorCentavos: Cents;
  repostos: number;
  estoqueFinal: number;
  /** Custo do produto no momento (para perdas). */
  custoUnit: number;
  /** Item encontrado que não estava no sistema. */
  encontrado?: boolean;
}

export type SituacaoAcerto = 'concluido' | 'estornado';
export type StatusPagamento = 'pago' | 'parcial' | 'pendente';

export interface Acerto extends Base {
  parceiroId: ID;
  data: ISODate;
  /** Data do acerto anterior ou da instalação. */
  dataAnterior: ISODate;
  pctParceiro: number;
  brutoCentavos: Cents;
  parteParceiroCentavos: Cents;
  suaParteCentavos: Cents;
  pixDiretoCentavos: Cents;
  /** sua_parte − pix_direto. Positivo: parceiro paga ao dono. Negativo: dono paga ao parceiro. */
  valorAcertoCentavos: Cents;
  situacao: SituacaoAcerto;
  /** Derivado dos pagamentos; gravado na conclusão e atualizado a cada pagamento. */
  statusPagamento: StatusPagamento;
  itens: AcertoItem[];
  proximoAcerto: ISODate;
  /** Acerto final do encerramento da parceria. */
  final?: boolean;
  observacoes?: string;
  /** Precisa de acerto: preço mudou desde o último, etc. (informativo). */
  avisos?: string[];
}

// ---------------------------------------------------------------- Clientes e pedidos

export type ComoConheceu = 'instagram' | 'indicacao' | 'parceiro' | 'feira' | 'outro';

export interface Cliente extends Base {
  nome: string;
  whatsapp?: string;
  instagram?: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  aniversario?: string; // 'MM-DD' ou 'YYYY-MM-DD'
  comoConheceu?: ComoConheceu;
  aceitaNovidades: boolean;
  observacoes?: string;
  /** Dados pessoais excluídos (LGPD): nome e contatos anonimizados. */
  anonimizado?: boolean;
  arquivado: boolean;
}

/**
 * Etapa do pedido. 'aprovado' é obsoleto: "Aprovado" e "Em produção" viraram uma etapa só ('producao'); pedidos
 * antigos gravados como 'aprovado' são lidos como 'producao' (data/migracoes.ts).
 */
export type EtapaPedido = 'orcamento' | 'aprovado' | 'producao' | 'pronto' | 'entregue' | 'cancelado';
export type CanalOrigem = 'whatsapp' | 'instagram' | 'presencial' | 'feira' | 'expositor' | 'indicacao' | 'outro';
export type TipoEntrega = 'retirada' | 'propria' | 'correios';

export interface PedidoItem {
  id: ID;
  tipo: 'catalogo' | 'personalizada';
  produtoId?: ID;
  descricao: string;
  quantidade: number;
  /** Peça personalizada: mesas, componentes e mão de obra próprios. */
  mesas?: Mesa[];
  componentes?: Componente[];
  maoDeObraMin?: number;
  /** Peça personalizada: cor (carretel) usada em cada posição de filamento ('mesaId:indice' -> materialId), gravada em "Pronto". */
  cores?: Record<string, ID>;
  /** Custo por unidade calculado (reais, 4 casas). */
  custoUnit: number;
  /** custoUnit × quantidade (reais, 4 casas). */
  custoTotal: number;
  /** Custo total com precisão total (para o orçamento bater ao centavo: 38,83666… ÷ 0,5 = 77,6733). */
  custoExato?: number;
}

export interface Pedido extends Base {
  numero: number; // #0001
  clienteId: ID;
  titulo: string;
  /** O dono deixou o título em branco: ele é montado pelos itens e refeito quando os itens mudam. */
  tituloAuto?: boolean;
  descricao?: string;
  referencias: { tipo: 'link' | 'arquivo' | 'foto'; valor: string; nome?: string }[];
  itens: PedidoItem[];
  prazo?: ISODate;
  entrega: { tipo: TipoEntrega; freteCentavos: Cents; rastreio?: string };
  canalOrigem: CanalOrigem;
  observacoes?: string;
  etapa: EtapaPedido;
  horasModelagem: number;
  urgente: boolean;
  urgenciaPct: number;
  descontoPct: number;
  sinalPct: number;
  pedidoMinimoCentavos: Cents;
  /** Parâmetros usados no orçamento (fotografia). */
  margemPct: number;
  valorHoraModelagem: number;
  arredondamento: ModoArredondamento;
  /** Soma do custo dos itens (reais). */
  custoProducao: number;
  /** horas × valor hora modelagem (reais). */
  modelagemValor: number;
  /** Total calculado pelo motor (centavos, com frete). */
  totalCalculadoCentavos: Cents;
  /** Total final (editável; com frete). */
  totalCentavos: Cents;
  /** Sinal sugerido (centavos). */
  sinalCentavos: Cents;
  validade: ISODate;
  /** Entrada em "Em produção" (aprovação). Hoje é gravada igual a producaoEm; em pedidos antigos podem diferir. */
  aprovadoEm?: ISODate;
  producaoEm?: ISODate;
  prontoEm?: ISODate;
  entregueEm?: ISODate;
  canceladoEm?: ISODate;
  motivoCancelamento?: string;
  destinoSinal?: 'reter' | 'devolver_tudo' | 'devolver_parte';
  sinalDispensadoMotivo?: string;
  /** Obsoleto: o checklist saiu do app. Continua gravado (sempre falso) porque versões antigas em outros aparelhos leem. */
  checklist: { modeloAprovado: boolean; impresso: boolean; acabamento: boolean };
  historico: { data: ISODateTime; evento: string }[];
  /** Materiais das peças personalizadas já baixados (ao entrar em Pronto). */
  materiaisBaixados?: boolean;
  /** Itens de catálogo já baixados de Casa (na entrega). */
  catalogoBaixado?: boolean;
}

// ---------------------------------------------------------------- Vendas e pagamentos

export type FormaPagamento = 'pix' | 'dinheiro' | 'cartao';
export type CanalVenda = 'presencial' | 'whatsapp' | 'instagram' | 'feira';

export interface VendaItem {
  produtoId: ID;
  quantidade: number;
  precoUnitCentavos: Cents;
  /** Custo unitário do momento (reais, 4 casas). */
  custoUnit: number;
}

export interface Venda extends Base {
  data: ISODate;
  canal: CanalVenda;
  formaPagamento: FormaPagamento;
  clienteId?: ID | null;
  itens: VendaItem[];
  /** Soma de quantidade × preço, antes do desconto. */
  subtotalCentavos: Cents;
  descontoCentavos: Cents;
  /** subtotal − desconto (o que o cliente paga). */
  totalCentavos: Cents;
  /** Taxa do cartão (centavos). */
  taxaCentavos: Cents;
  /** Soma de quantidade × custo (reais). */
  custoTotal: number;
  /** total − taxa − custo (centavos, estimado). */
  lucroCentavos: Cents;
  cancelada?: boolean;
  canceladaEm?: ISODate;
  motivoCancelamento?: string;
}

export interface Pagamento extends Base {
  origem: 'acerto' | 'pedido' | 'venda';
  /** Acerto, pedido ou venda de referência. */
  refId: ID;
  /** Para pagamentos de acerto: o parceiro (as pendências são abatidas da mais antiga). */
  parceiroId?: ID;
  clienteId?: ID | null;
  direcao: 'recebido' | 'pago';
  valorCentavos: Cents;
  forma: FormaPagamento;
  data: ISODate;
  /** Taxa do cartão descontada (centavos). */
  taxaCentavos?: Cents;
  tipo?: 'sinal' | 'parcela' | 'saldo' | 'acerto' | 'venda' | 'devolucao';
  observacao?: string;
  estornoDe?: ID;
}

// ---------------------------------------------------------------- Coleções

export interface Colecoes {
  impressoras: Impressora;
  materiais: Material;
  movMateriais: MovMaterial;
  produtos: Produto;
  movEstoque: MovEstoque;
  producoes: Producao;
  parceiros: Parceiro;
  expositores: Expositor;
  acertos: Acerto;
  clientes: Cliente;
  pedidos: Pedido;
  vendas: Venda;
  pagamentos: Pagamento;
}

export type NomeColecao = keyof Colecoes;

export const COLECOES: NomeColecao[] = [
  'impressoras',
  'materiais',
  'movMateriais',
  'produtos',
  'movEstoque',
  'producoes',
  'parceiros',
  'expositores',
  'acertos',
  'clientes',
  'pedidos',
  'vendas',
  'pagamentos',
];

/** Dados para inserir: o banco preenche id e carimbos. */
export type Novo<T extends Base> = Omit<T, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: ID };
