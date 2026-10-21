// Detalhe da venda direta, com "Cancelar venda" (gera estorno do estoque e do pagamento).
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA, ROTULO_FORMA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeCliente, nomeProduto } from '../../data/selectors.ts';
import type { VendaItem } from '../../data/types.ts';
import { formatBRL, formatData, formatReais } from '../../lib/format.ts';
import { cancelarVenda } from '../../services/vendas.ts';
import { Aviso, Botao, Cartao, Grade, Pagina, Resumo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { ModalMotivo, executar } from '../estoque/comum.tsx';

export function VendaDetalhe({ params }: TelaProps) {
  useDb();
  const [cancelando, setCancelando] = useState(false);
  const v = db.get('vendas', params.id);
  if (!v) {
    return (
      <Pagina titulo="Venda" voltarPara="/vendas">
        <Vazio titulo="Venda não encontrada" acao={{ rotulo: 'Ver vendas', href: '/vendas' }} />
      </Pagina>
    );
  }
  const colunas: Coluna<VendaItem>[] = [
    { id: 'produto', rotulo: 'Produto', principal: true, render: (i) => nomeProduto(i.produtoId) },
    { id: 'qtd', rotulo: 'Qtd.', alinhar: 'dir', render: (i) => String(i.quantidade) },
    { id: 'preco', rotulo: 'Preço', alinhar: 'dir', render: (i) => formatBRL(i.precoUnitCentavos) },
    { id: 'valor', rotulo: 'Valor', alinhar: 'dir', render: (i) => formatBRL(i.quantidade * i.precoUnitCentavos) },
    { id: 'custo', rotulo: 'Custo (momento)', alinhar: 'dir', render: (i) => formatReais(i.quantidade * i.custoUnit), esconderNoCelular: true },
  ];
  return (
    <Pagina titulo={`Venda de ${formatData(v.data)}`} subtitulo={`${ROTULO_CANAL_VENDA[v.canal]} · ${nomeCliente(v.clienteId)}`} voltarPara="/vendas">
      {v.cancelada && (
        <Aviso tom="ruim" titulo={`Venda cancelada em ${formatData(v.canceladaEm)}`}>
          {v.motivoCancelamento}. Os itens voltaram para Casa e o pagamento foi estornado.
        </Aviso>
      )}
      <Cartao titulo="Itens">
        <Tabela colunas={colunas} linhas={v.itens} chave={(i) => i.produtoId} />
      </Cartao>
      <Grade colunas={2}>
        <Cartao titulo="Valores">
          <Resumo
            linhas={[
              { rotulo: 'Subtotal', valor: formatBRL(v.subtotalCentavos) },
              v.descontoCentavos ? { rotulo: 'Desconto', valor: `− ${formatBRL(v.descontoCentavos)}` } : null,
              { rotulo: 'Total', valor: formatBRL(v.totalCentavos), destaque: true },
              v.taxaCentavos ? { rotulo: 'Taxa do cartão', valor: `− ${formatBRL(v.taxaCentavos)}` } : null,
              { rotulo: 'Custo dos produtos', valor: `− ${formatReais(v.custoTotal)}` },
              { rotulo: 'Lucro estimado', valor: formatBRL(v.lucroCentavos), tom: v.lucroCentavos < 0 ? 'ruim' : 'ok' },
            ]}
          />
        </Cartao>
        <Cartao titulo="Dados">
          <Resumo
            linhas={[
              { rotulo: 'Data', valor: formatData(v.data) },
              { rotulo: 'Forma de pagamento', valor: ROTULO_FORMA[v.formaPagamento] },
              { rotulo: 'Canal', valor: ROTULO_CANAL_VENDA[v.canal] },
              { rotulo: 'Cliente', valor: nomeCliente(v.clienteId) },
            ]}
          />
        </Cartao>
      </Grade>
      {!v.cancelada && (
        <div>
          <Botao variante="perigo" icone="fechar" onClick={() => setCancelando(true)}>
            Cancelar venda
          </Botao>
        </div>
      )}
      {cancelando && (
        <ModalMotivo
          aberto
          titulo="Cancelar esta venda?"
          rotuloConfirmar="Cancelar venda"
          rotuloMotivo="Motivo do cancelamento"
          perigo
          onFechar={() => setCancelando(false)}
          onConfirmar={(motivo) => executar(() => cancelarVenda(v.id, motivo), 'Venda cancelada')}
        >
          <ul class="confirmacao-itens">
            <li>Os itens voltam para o estoque de Casa (estorno).</li>
            <li>O pagamento de {formatBRL(v.totalCentavos)} é estornado.</li>
            <li>A venda continua no histórico, marcada como cancelada.</li>
          </ul>
        </ModalMotivo>
      )}
    </Pagina>
  );
}
