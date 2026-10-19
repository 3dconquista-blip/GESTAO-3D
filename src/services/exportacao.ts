// "Exportar CSV" de Configurações > Dados (seção 12): uma planilha por cadastro ou lançamento, para abrir no
// Excel ou mandar ao contador. Somente leitura. Itens de vendas e acertos saem uma linha por item.
import { db } from '../data/db.ts';
import { ROTULO_CANAL_VENDA, ROTULO_ETAPA, ROTULO_FORMA, ROTULO_MOTIVO_PERDA, ROTULO_TIPO_MOV, ROTULO_TIPO_PARCEIRO } from '../data/defaults.ts';
import { custoProduto, nomeCliente, nomeMaterial, nomeProduto, saldoCasa, saldoMaterial } from '../data/selectors.ts';
import type { Acerto, AcertoItem, Cliente, LocalId, Material, MovEstoque, MovMaterial, Pagamento, Parceiro, Pedido, Produto, Venda, VendaItem } from '../data/types.ts';
import { CASA, parceiroDoLocal } from '../data/types.ts';
import { paraCSV, type ColunaCSV } from '../domain/csv.ts';
import { numeroPedido, situacaoFinanceira } from '../domain/pedidos.ts';
import { ROTULO_QUEM_RECEBE } from '../domain/termo.ts';

export type PlanilhaCSV =
  | 'vendas'
  | 'acertos'
  | 'pedidos'
  | 'pagamentos'
  | 'produtos'
  | 'materiais'
  | 'movEstoque'
  | 'movMateriais'
  | 'parceiros'
  | 'clientes';

export interface OpcaoPlanilha {
  id: PlanilhaCSV;
  rotulo: string;
  descricao: string;
}

export const PLANILHAS: OpcaoPlanilha[] = [
  { id: 'vendas', rotulo: 'Vendas diretas', descricao: 'Uma linha por item vendido' },
  { id: 'acertos', rotulo: 'Acertos', descricao: 'Uma linha por produto contado' },
  { id: 'pedidos', rotulo: 'Pedidos', descricao: 'Etapa, valores, pago e saldo' },
  { id: 'pagamentos', rotulo: 'Pagamentos', descricao: 'Recebidos, repasses, devoluções e estornos' },
  { id: 'produtos', rotulo: 'Produtos', descricao: 'Preço, custo e estoque em Casa' },
  { id: 'materiais', rotulo: 'Materiais', descricao: 'Custo médio e saldo' },
  { id: 'movEstoque', rotulo: 'Movimentações de estoque', descricao: 'Entradas, saídas e transferências' },
  { id: 'movMateriais', rotulo: 'Movimentações de material', descricao: 'Compras, consumo, ajustes e perdas' },
  { id: 'parceiros', rotulo: 'Parceiros', descricao: 'Contato, divisão e frequência' },
  { id: 'clientes', rotulo: 'Clientes', descricao: 'Contato e origem' },
];

const porData = <T extends { data: string; criadoEm: string }>(a: T, b: T) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm);
const nomeParceiro = (id: string | null | undefined) => (id ? db.get('parceiros', id)?.nome ?? '' : '');

function nomeLocal(local: LocalId | null): string {
  if (local == null) return '';
  if (local === CASA) return 'Casa';
  const pid = parceiroDoLocal(local);
  return pid ? nomeParceiro(pid) : local;
}

function csvVendas(): string {
  type L = { v: Venda; it: VendaItem };
  const linhas: L[] = [];
  for (const v of db.all('vendas').slice().sort(porData)) for (const it of v.itens) linhas.push({ v, it });
  const colunas: ColunaCSV<L>[] = [
    { titulo: 'Data', valor: (l) => l.v.data, tipo: 'data' },
    { titulo: 'Canal', valor: (l) => ROTULO_CANAL_VENDA[l.v.canal] ?? l.v.canal, tipo: 'texto' },
    { titulo: 'Forma', valor: (l) => ROTULO_FORMA[l.v.formaPagamento] ?? l.v.formaPagamento, tipo: 'texto' },
    { titulo: 'Cliente', valor: (l) => (l.v.clienteId ? nomeCliente(l.v.clienteId) : 'Cliente avulso'), tipo: 'texto' },
    { titulo: 'Produto', valor: (l) => nomeProduto(l.it.produtoId), tipo: 'texto' },
    { titulo: 'Quantidade', valor: (l) => l.it.quantidade },
    { titulo: 'Preço unitário (R$)', valor: (l) => l.it.precoUnitCentavos, tipo: 'centavos' },
    { titulo: 'Custo unitário (R$)', valor: (l) => l.it.custoUnit, decimais: 4 },
    { titulo: 'Desconto da venda (R$)', valor: (l) => l.v.descontoCentavos, tipo: 'centavos' },
    { titulo: 'Total da venda (R$)', valor: (l) => l.v.totalCentavos, tipo: 'centavos' },
    { titulo: 'Taxa de cartão da venda (R$)', valor: (l) => l.v.taxaCentavos, tipo: 'centavos' },
    { titulo: 'Cancelada', valor: (l) => !!l.v.cancelada },
    { titulo: 'Código da venda', valor: (l) => l.v.id, tipo: 'texto' },
  ];
  return paraCSV(linhas, colunas);
}

function csvAcertos(): string {
  type L = { a: Acerto; it: AcertoItem };
  const linhas: L[] = [];
  for (const a of db.all('acertos').slice().sort(porData)) for (const it of a.itens) linhas.push({ a, it });
  const colunas: ColunaCSV<L>[] = [
    { titulo: 'Data', valor: (l) => l.a.data, tipo: 'data' },
    { titulo: 'Parceiro', valor: (l) => nomeParceiro(l.a.parceiroId), tipo: 'texto' },
    { titulo: 'Situação', valor: (l) => (l.a.situacao === 'concluido' ? 'Concluído' : 'Estornado'), tipo: 'texto' },
    { titulo: '% do parceiro', valor: (l) => l.a.pctParceiro },
    { titulo: 'Produto', valor: (l) => nomeProduto(l.it.produtoId), tipo: 'texto' },
    { titulo: 'Esperado', valor: (l) => l.it.esperado },
    { titulo: 'Contei', valor: (l) => l.it.contei },
    { titulo: 'Avariados', valor: (l) => l.it.avariados },
    { titulo: 'Recolhidos', valor: (l) => l.it.recolhidos },
    { titulo: 'Vendidos', valor: (l) => l.it.vendidos },
    { titulo: 'Preço (R$)', valor: (l) => l.it.precoUnitCentavos, tipo: 'centavos' },
    { titulo: 'Valor vendido (R$)', valor: (l) => l.it.valorCentavos, tipo: 'centavos' },
    { titulo: 'Repostos', valor: (l) => l.it.repostos },
    { titulo: 'Estoque final', valor: (l) => l.it.estoqueFinal },
    { titulo: 'Bruto do acerto (R$)', valor: (l) => l.a.brutoCentavos, tipo: 'centavos' },
    { titulo: 'Parte do parceiro (R$)', valor: (l) => l.a.parteParceiroCentavos, tipo: 'centavos' },
    { titulo: 'Sua parte (R$)', valor: (l) => l.a.suaParteCentavos, tipo: 'centavos' },
    { titulo: 'PIX no expositor (R$)', valor: (l) => l.a.pixDiretoCentavos, tipo: 'centavos' },
    { titulo: 'Valor do acerto (R$)', valor: (l) => l.a.valorAcertoCentavos, tipo: 'centavos' },
    { titulo: 'Pagamento', valor: (l) => ({ pago: 'Pago', parcial: 'Parcial', pendente: 'Pendente' })[l.a.statusPagamento], tipo: 'texto' },
    { titulo: 'Código do acerto', valor: (l) => l.a.id, tipo: 'texto' },
  ];
  return paraCSV(linhas, colunas);
}

function csvPedidos(): string {
  const pags = db.all('pagamentos');
  const colunas: ColunaCSV<Pedido>[] = [
    { titulo: 'Número', valor: (p) => numeroPedido(p.numero), tipo: 'texto' },
    { titulo: 'Título', valor: (p) => p.titulo, tipo: 'texto' },
    { titulo: 'Cliente', valor: (p) => nomeCliente(p.clienteId), tipo: 'texto' },
    { titulo: 'Etapa', valor: (p) => ROTULO_ETAPA[p.etapa] ?? p.etapa, tipo: 'texto' },
    { titulo: 'Criado em', valor: (p) => p.criadoEm, tipo: 'data' },
    { titulo: 'Prazo', valor: (p) => p.prazo ?? '', tipo: 'data' },
    { titulo: 'Entregue em', valor: (p) => p.entregueEm ?? '', tipo: 'data' },
    { titulo: 'Cancelado em', valor: (p) => p.canceladoEm ?? '', tipo: 'data' },
    { titulo: 'Peças', valor: (p) => p.itens.reduce((s, i) => s + i.quantidade, 0) },
    { titulo: 'Custo de produção (R$)', valor: (p) => p.custoProducao, decimais: 4 },
    { titulo: 'Modelagem (R$)', valor: (p) => p.modelagemValor, decimais: 2 },
    { titulo: 'Frete (R$)', valor: (p) => p.entrega.freteCentavos, tipo: 'centavos' },
    { titulo: 'Total (R$)', valor: (p) => p.totalCentavos, tipo: 'centavos' },
    { titulo: 'Pago (R$)', valor: (p) => situacaoFinanceira(p, pags).pagoCentavos, tipo: 'centavos' },
    { titulo: 'Saldo (R$)', valor: (p) => situacaoFinanceira(p, pags).saldoCentavos, tipo: 'centavos' },
    { titulo: 'Motivo do cancelamento', valor: (p) => p.motivoCancelamento ?? '', tipo: 'texto' },
  ];
  return paraCSV(db.all('pedidos').slice().sort((a, b) => a.numero - b.numero), colunas);
}

function referencia(p: Pagamento): string {
  if (p.origem === 'pedido') {
    const pd = db.get('pedidos', p.refId);
    return pd ? numeroPedido(pd.numero) : '';
  }
  if (p.origem === 'acerto') return nomeParceiro(p.parceiroId ?? db.get('acertos', p.refId)?.parceiroId);
  return 'Venda rápida';
}

function csvPagamentos(): string {
  const colunas: ColunaCSV<Pagamento>[] = [
    { titulo: 'Data', valor: (p) => p.data, tipo: 'data' },
    { titulo: 'Origem', valor: (p) => ({ venda: 'Venda direta', acerto: 'Acerto', pedido: 'Pedido' })[p.origem], tipo: 'texto' },
    { titulo: 'Referência', valor: referencia, tipo: 'texto' },
    { titulo: 'Direção', valor: (p) => (p.direcao === 'recebido' ? 'Recebido' : 'Pago'), tipo: 'texto' },
    { titulo: 'Tipo', valor: (p) => p.tipo ?? '', tipo: 'texto' },
    { titulo: 'Forma', valor: (p) => ROTULO_FORMA[p.forma] ?? p.forma, tipo: 'texto' },
    { titulo: 'Valor (R$)', valor: (p) => p.valorCentavos, tipo: 'centavos' },
    { titulo: 'Taxa de cartão (R$)', valor: (p) => p.taxaCentavos ?? 0, tipo: 'centavos' },
    { titulo: 'Estorno', valor: (p) => !!p.estornoDe },
    { titulo: 'Observação', valor: (p) => p.observacao ?? '', tipo: 'texto' },
  ];
  return paraCSV(db.all('pagamentos').slice().sort(porData), colunas);
}

function csvProdutos(): string {
  const colunas: ColunaCSV<Produto>[] = [
    { titulo: 'Código', valor: (p) => p.codigo, tipo: 'texto' },
    { titulo: 'Nome', valor: (p) => p.nome, tipo: 'texto' },
    { titulo: 'Modelo', valor: (p) => p.modelo, tipo: 'texto' },
    { titulo: 'Cor', valor: (p) => p.cor, tipo: 'texto' },
    { titulo: 'Categoria', valor: (p) => p.categoria, tipo: 'texto' },
    { titulo: 'Preço de etiqueta (R$)', valor: (p) => p.precoEtiquetaCentavos, tipo: 'centavos' },
    { titulo: 'Custo por peça (R$)', valor: (p) => custoProduto(p.id), decimais: 4 },
    { titulo: 'Estoque em Casa', valor: (p) => saldoCasa(p.id) },
    { titulo: 'Estoque mínimo', valor: (p) => p.estoqueMinimo },
    { titulo: 'Margem própria (%)', valor: (p) => p.margemPct ?? null, decimais: 1 },
    { titulo: 'Arquivado', valor: (p) => p.arquivado && !p.excluido },
    { titulo: 'Excluído em', valor: (p) => p.excluidoEm ?? '', tipo: 'data' },
  ];
  return paraCSV(db.all('produtos').slice().sort((a, b) => a.nome.localeCompare(b.nome)), colunas);
}

function csvMateriais(): string {
  const colunas: ColunaCSV<Material>[] = [
    { titulo: 'Tipo', valor: (m) => (m.tipo === 'filamento' ? 'Filamento' : 'Insumo'), tipo: 'texto' },
    { titulo: 'Nome', valor: (m) => m.nome, tipo: 'texto' },
    { titulo: 'Material', valor: (m) => m.material ?? '', tipo: 'texto' },
    { titulo: 'Marca', valor: (m) => m.marca ?? '', tipo: 'texto' },
    { titulo: 'Unidade', valor: (m) => m.unidade, tipo: 'texto' },
    { titulo: 'Custo médio (R$/kg ou R$/un)', valor: (m) => m.custoMedio, decimais: 4 },
    { titulo: 'Saldo', valor: (m) => saldoMaterial(m.id), decimais: 2 },
    { titulo: 'Mínimo', valor: (m) => m.minimo },
    { titulo: 'Arquivado', valor: (m) => m.arquivado },
  ];
  return paraCSV(db.all('materiais').slice().sort((a, b) => a.nome.localeCompare(b.nome)), colunas);
}

function csvMovEstoque(): string {
  const colunas: ColunaCSV<MovEstoque>[] = [
    { titulo: 'Data', valor: (m) => m.data, tipo: 'data' },
    { titulo: 'Tipo', valor: (m) => ROTULO_TIPO_MOV[m.tipo] ?? m.tipo, tipo: 'texto' },
    { titulo: 'Produto', valor: (m) => nomeProduto(m.produtoId), tipo: 'texto' },
    { titulo: 'Quantidade', valor: (m) => m.quantidade },
    { titulo: 'De', valor: (m) => nomeLocal(m.origem), tipo: 'texto' },
    { titulo: 'Para', valor: (m) => nomeLocal(m.destino), tipo: 'texto' },
    { titulo: 'Motivo', valor: (m) => (m.motivo && ROTULO_MOTIVO_PERDA[m.motivo]) || m.motivo || '', tipo: 'texto' },
    { titulo: 'Custo unitário (R$)', valor: (m) => m.custoUnit, decimais: 4 },
    { titulo: 'Preço unitário (R$)', valor: (m) => m.precoUnitCentavos ?? null, tipo: 'centavos' },
    { titulo: 'Estorno', valor: (m) => !!m.estornoDe },
  ];
  return paraCSV(db.all('movEstoque').slice().sort(porData), colunas);
}

function csvMovMateriais(): string {
  const colunas: ColunaCSV<MovMaterial>[] = [
    { titulo: 'Data', valor: (m) => m.data, tipo: 'data' },
    { titulo: 'Tipo', valor: (m) => m.tipo, tipo: 'texto' },
    { titulo: 'Material', valor: (m) => nomeMaterial(m.materialId), tipo: 'texto' },
    { titulo: 'Quantidade (g ou un)', valor: (m) => m.quantidade, decimais: 2 },
    { titulo: 'Valor pago (R$)', valor: (m) => m.valorTotalCentavos ?? null, tipo: 'centavos' },
    { titulo: 'Custo médio no momento', valor: (m) => m.custoUnitSnapshot ?? null, decimais: 4 },
    { titulo: 'Motivo', valor: (m) => m.motivo ?? '', tipo: 'texto' },
    { titulo: 'Estorno', valor: (m) => !!m.estornoDe },
  ];
  return paraCSV(db.all('movMateriais').slice().sort(porData), colunas);
}

function csvParceiros(): string {
  const colunas: ColunaCSV<Parceiro>[] = [
    { titulo: 'Nome', valor: (p) => p.nome, tipo: 'texto' },
    { titulo: 'Tipo', valor: (p) => ROTULO_TIPO_PARCEIRO[p.tipo] ?? p.tipo, tipo: 'texto' },
    { titulo: 'Responsável', valor: (p) => p.responsavel, tipo: 'texto' },
    { titulo: 'WhatsApp', valor: (p) => p.whatsapp, tipo: 'texto' },
    { titulo: 'Endereço', valor: (p) => p.endereco, tipo: 'texto' },
    { titulo: 'Bairro', valor: (p) => p.bairro, tipo: 'texto' },
    { titulo: '% do parceiro', valor: (p) => p.pctParceiro },
    { titulo: 'Frequência (dias)', valor: (p) => p.frequenciaDias },
    { titulo: 'Quem recebe', valor: (p) => ROTULO_QUEM_RECEBE[p.quemRecebe], tipo: 'texto' },
    { titulo: 'Situação', valor: (p) => p.situacao, tipo: 'texto' },
    { titulo: 'Início', valor: (p) => p.dataInicio, tipo: 'data' },
    { titulo: 'Termo assinado', valor: (p) => p.termoAssinado },
    { titulo: 'Arquivado', valor: (p) => p.arquivado },
  ];
  return paraCSV(db.all('parceiros').slice().sort((a, b) => a.nome.localeCompare(b.nome)), colunas);
}

function csvClientes(): string {
  const colunas: ColunaCSV<Cliente>[] = [
    { titulo: 'Nome', valor: (c) => c.nome, tipo: 'texto' },
    { titulo: 'WhatsApp', valor: (c) => c.whatsapp ?? '', tipo: 'texto' },
    { titulo: 'Instagram', valor: (c) => c.instagram ?? '', tipo: 'texto' },
    { titulo: 'Cidade', valor: (c) => c.cidade ?? '', tipo: 'texto' },
    { titulo: 'Bairro', valor: (c) => c.bairro ?? '', tipo: 'texto' },
    { titulo: 'Como conheceu', valor: (c) => c.comoConheceu ?? '', tipo: 'texto' },
    { titulo: 'Aceita novidades', valor: (c) => c.aceitaNovidades },
    { titulo: 'Arquivado', valor: (c) => c.arquivado },
  ];
  return paraCSV(db.all('clientes').slice().sort((a, b) => a.nome.localeCompare(b.nome)), colunas);
}

const GERADORES: Record<PlanilhaCSV, () => string> = {
  vendas: csvVendas,
  acertos: csvAcertos,
  pedidos: csvPedidos,
  pagamentos: csvPagamentos,
  produtos: csvProdutos,
  materiais: csvMateriais,
  movEstoque: csvMovEstoque,
  movMateriais: csvMovMateriais,
  parceiros: csvParceiros,
  clientes: csvClientes,
};

/** Texto CSV (com BOM, ';' e CRLF) de uma planilha. */
export function csvPlanilha(id: PlanilhaCSV): string {
  return GERADORES[id]();
}

/** Quantos registros cada planilha tem (para mostrar ao lado do botão). */
export function contagemPlanilha(id: PlanilhaCSV): number {
  return db.all(id).length;
}
