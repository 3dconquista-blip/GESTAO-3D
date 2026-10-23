// Tabela de rotas. Cada tela vive em src/features/<area>/<Tela>.tsx e recebe TelaProps.
import type { ComponentType } from 'preact';
import type { TelaProps } from './router.ts';
import { casar } from './router.ts';

import { Inicio } from '../features/inicio/Inicio.tsx';
import { ProdutosLista } from '../features/estoque/ProdutosLista.tsx';
import { ProdutoForm } from '../features/estoque/ProdutoForm.tsx';
import { ProdutoDetalhe } from '../features/estoque/ProdutoDetalhe.tsx';
import { MateriaisLista } from '../features/estoque/MateriaisLista.tsx';
import { MaterialForm } from '../features/estoque/MaterialForm.tsx';
import { MaterialDetalhe } from '../features/estoque/MaterialDetalhe.tsx';
import { OQueImprimir } from '../features/estoque/OQueImprimir.tsx';
import { Movimentacoes } from '../features/estoque/Movimentacoes.tsx';
import { RegistrarProducao } from '../features/estoque/RegistrarProducao.tsx';
import { CompraMaterial } from '../features/estoque/CompraMaterial.tsx';
import { LancarGasto } from '../features/gastos/LancarGasto.tsx';
import { Calculadora } from '../features/precos/Calculadora.tsx';
import { AjusteEstoque } from '../features/estoque/AjusteEstoque.tsx';
import { TelaParceiros } from '../features/parceiros/Parceiros.tsx';
import { ParceiroForm } from '../features/parceiros/ParceiroForm.tsx';
import { ParceiroDetalhe } from '../features/parceiros/ParceiroDetalhe.tsx';
import { MixParceiro } from '../features/parceiros/MixParceiro.tsx';
import { LevarPecas, Recolher } from '../features/parceiros/Remessas.tsx';
import { EncerrarParceria } from '../features/parceiros/Encerrar.tsx';
import { VisitaAcerto } from '../features/parceiros/Acerto.tsx';
import { Comprovante } from '../features/parceiros/Comprovante.tsx';
import { Termo } from '../features/parceiros/Termo.tsx';
import { ExpositoresLista } from '../features/parceiros/ExpositoresLista.tsx';
import { ExpositorForm } from '../features/parceiros/ExpositorForm.tsx';
import { Pedidos } from '../features/pedidos/Pedidos.tsx';
import { PedidoForm } from '../features/pedidos/PedidoForm.tsx';
import { PedidoDetalhe } from '../features/pedidos/PedidoDetalhe.tsx';
import { ClientesLista } from '../features/clientes/ClientesLista.tsx';
import { ClienteForm } from '../features/clientes/ClienteForm.tsx';
import { ClienteDetalhe } from '../features/clientes/ClienteDetalhe.tsx';
import { VendaRapida } from '../features/vendas/VendaRapida.tsx';
import { VendasLista } from '../features/vendas/VendasLista.tsx';
import { VendaDetalhe } from '../features/vendas/VendaDetalhe.tsx';
import { Relatorios } from '../features/relatorios/Relatorios.tsx';
import { Configuracoes } from '../features/config/Configuracoes.tsx';
import { Mais } from '../features/mais/Mais.tsx';

export type Secao = 'inicio' | 'estoque' | 'parceiros' | 'pedidos' | 'mais';

export interface Rota {
  padrao: string;
  tela: ComponentType<TelaProps>;
  secao: Secao;
}

export const ROTAS: Rota[] = [
  { padrao: '/', tela: Inicio, secao: 'inicio' },

  // Estoque
  { padrao: '/estoque', tela: ProdutosLista, secao: 'estoque' },
  { padrao: '/estoque/produtos', tela: ProdutosLista, secao: 'estoque' },
  { padrao: '/estoque/produtos/novo', tela: ProdutoForm, secao: 'estoque' },
  { padrao: '/estoque/produtos/:id', tela: ProdutoDetalhe, secao: 'estoque' },
  { padrao: '/estoque/produtos/:id/editar', tela: ProdutoForm, secao: 'estoque' },
  { padrao: '/estoque/materiais', tela: MateriaisLista, secao: 'estoque' },
  { padrao: '/estoque/materiais/novo', tela: MaterialForm, secao: 'estoque' },
  { padrao: '/estoque/materiais/:id', tela: MaterialDetalhe, secao: 'estoque' },
  { padrao: '/estoque/materiais/:id/editar', tela: MaterialForm, secao: 'estoque' },
  { padrao: '/estoque/imprimir', tela: OQueImprimir, secao: 'estoque' },
  { padrao: '/estoque/movimentacoes', tela: Movimentacoes, secao: 'estoque' },
  { padrao: '/estoque/ajuste', tela: AjusteEstoque, secao: 'estoque' },
  { padrao: '/producao/nova', tela: RegistrarProducao, secao: 'estoque' },
  { padrao: '/compra', tela: CompraMaterial, secao: 'estoque' },
  { padrao: '/calculadora', tela: Calculadora, secao: 'estoque' },
  { padrao: '/gastos/novo', tela: LancarGasto, secao: 'mais' },

  // Parceiros
  { padrao: '/parceiros', tela: TelaParceiros, secao: 'parceiros' },
  // Endereços antigos das abas "Agenda" e "Parceiros" levam à tela única.
  { padrao: '/parceiros/agenda', tela: TelaParceiros, secao: 'parceiros' },
  { padrao: '/parceiros/lista', tela: TelaParceiros, secao: 'parceiros' },
  { padrao: '/parceiros/novo', tela: ParceiroForm, secao: 'parceiros' },
  { padrao: '/parceiros/expositores', tela: ExpositoresLista, secao: 'parceiros' },
  { padrao: '/parceiros/expositores/novo', tela: ExpositorForm, secao: 'parceiros' },
  { padrao: '/parceiros/expositores/:id', tela: ExpositorForm, secao: 'parceiros' },
  { padrao: '/parceiros/:id', tela: ParceiroDetalhe, secao: 'parceiros' },
  { padrao: '/parceiros/:id/editar', tela: ParceiroForm, secao: 'parceiros' },
  { padrao: '/parceiros/:id/mix', tela: MixParceiro, secao: 'parceiros' },
  { padrao: '/parceiros/:id/levar', tela: LevarPecas, secao: 'parceiros' },
  { padrao: '/parceiros/:id/instalacao', tela: LevarPecas, secao: 'parceiros' },
  { padrao: '/parceiros/:id/reposicao', tela: LevarPecas, secao: 'parceiros' },
  { padrao: '/parceiros/:id/recolher', tela: Recolher, secao: 'parceiros' },
  { padrao: '/parceiros/:id/encerrar', tela: EncerrarParceria, secao: 'parceiros' },
  { padrao: '/parceiros/:id/acerto', tela: VisitaAcerto, secao: 'parceiros' },
  { padrao: '/parceiros/:id/termo', tela: Termo, secao: 'parceiros' },
  { padrao: '/acertos/:id', tela: Comprovante, secao: 'parceiros' },

  // Pedidos
  { padrao: '/pedidos', tela: Pedidos, secao: 'pedidos' },
  { padrao: '/pedidos/novo', tela: PedidoForm, secao: 'pedidos' },
  { padrao: '/pedidos/:id', tela: PedidoDetalhe, secao: 'pedidos' },
  { padrao: '/pedidos/:id/editar', tela: PedidoForm, secao: 'pedidos' },

  // Mais
  { padrao: '/mais', tela: Mais, secao: 'mais' },
  { padrao: '/venda', tela: VendaRapida, secao: 'mais' },
  { padrao: '/vendas', tela: VendasLista, secao: 'mais' },
  { padrao: '/vendas/:id', tela: VendaDetalhe, secao: 'mais' },
  { padrao: '/clientes', tela: ClientesLista, secao: 'mais' },
  { padrao: '/clientes/novo', tela: ClienteForm, secao: 'mais' },
  { padrao: '/clientes/:id', tela: ClienteDetalhe, secao: 'mais' },
  { padrao: '/clientes/:id/editar', tela: ClienteForm, secao: 'mais' },
  { padrao: '/relatorios', tela: Relatorios, secao: 'mais' },
  { padrao: '/config', tela: Configuracoes, secao: 'mais' },
  { padrao: '/config/:secao', tela: Configuracoes, secao: 'mais' },
  { padrao: '/config/:secao/:id', tela: Configuracoes, secao: 'mais' },
];

export function resolverRota(caminho: string): { rota: Rota; params: Record<string, string> } | null {
  for (const rota of ROTAS) {
    const params = casar(rota.padrao, caminho);
    if (params) return { rota, params };
  }
  return null;
}

/** Ações rápidas do botão flutuante "+". */
export const ACOES_RAPIDAS = [
  { rotulo: 'Venda rápida', icone: 'carrinho', href: '/venda' },
  { rotulo: 'Registrar produção', icone: 'impressora', href: '/producao/nova' },
  { rotulo: 'Fazer acerto', icone: 'parceiros', href: '/parceiros' },
  { rotulo: 'Novo pedido', icone: 'pedidos', href: '/pedidos/novo' },
  { rotulo: 'Compra de material', icone: 'rolo', href: '/compra' },
  { rotulo: 'Lançar gasto', icone: 'dinheiro', href: '/gastos/novo' },
];

export const MENU: { secao: Secao; rotulo: string; icone: string; href: string }[] = [
  { secao: 'inicio', rotulo: 'Início', icone: 'inicio', href: '/' },
  { secao: 'estoque', rotulo: 'Estoque', icone: 'estoque', href: '/estoque/produtos' },
  { secao: 'parceiros', rotulo: 'Parceiros', icone: 'parceiros', href: '/parceiros' },
  { secao: 'pedidos', rotulo: 'Pedidos', icone: 'pedidos', href: '/pedidos' },
  { secao: 'mais', rotulo: 'Mais', icone: 'mais', href: '/mais' },
];
