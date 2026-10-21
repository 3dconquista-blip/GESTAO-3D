// "Mais": Venda rápida, Vendas, Clientes, Relatórios, Configurações.
import type { TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { ItemLista, Lista, Pagina } from '../../ui/index.ts';

export function Mais(_props: TelaProps) {
  useDb();
  return (
    <Pagina titulo="Mais" largura="estreita">
      <Lista>
        <ItemLista icone="carrinho" titulo="Venda rápida" subtitulo="Vender direto, sai do estoque de Casa" href="/venda" />
        <ItemLista icone="dinheiro" titulo="Vendas" subtitulo="Histórico das vendas diretas" href="/vendas" />
        <ItemLista icone="usuario" titulo="Clientes" subtitulo="Contatos, pedidos e compras" href="/clientes" />
        <ItemLista icone="grafico" titulo="Relatórios" subtitulo="Vendas, lucro, parceiros e materiais" href="/relatorios" />
        <ItemLista icone="config" titulo="Configurações" subtitulo="Empresa, custos, impressoras, mensagens e backup" href="/config" />
      </Lista>
    </Pagina>
  );
}
