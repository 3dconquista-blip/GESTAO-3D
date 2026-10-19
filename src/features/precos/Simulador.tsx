// "Simulador de preço" avulso: escolha um produto (ou digite um custo) e veja quanto sobra em cada canal.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { composicaoProduto, custoProduto, produtosAtivos } from '../../data/selectors.ts';
import { formatReais } from '../../lib/format.ts';
import { Campo, Cartao, Escolha, Numero, Pagina, Segmentado } from '../../ui/index.ts';
import { SimuladorPreco } from './componentes.tsx';

export function SimuladorAvulso({ query }: TelaProps) {
  useDb();
  const produtos = produtosAtivos();
  const [modo, setModo] = useState<'produto' | 'custo'>(produtos.length ? 'produto' : 'custo');
  const [produtoId, setProdutoId] = useState<string | null>(query.get('produto') ?? produtos[0]?.id ?? null);
  const [custoManual, setCustoManual] = useState<number | null>(null);

  const produto = produtos.find((p) => p.id === produtoId);
  // Custo com precisão total (o exato do preço sugerido bate com o Exemplo A: 4,9747).
  const custo = modo === 'produto' ? (produto ? (composicaoProduto(produto.id)?.total ?? null) : null) : custoManual;

  return (
    <Pagina titulo="Simulador de preço" subtitulo="A hora do dono já entra no custo. O lucro é o que sobra além dela." voltarPara="/mais">
      <Cartao>
        <div class="pilha pilha-m">
          <Segmentado
            value={modo}
            onChange={setModo}
            opcoes={[
              { valor: 'produto', rotulo: 'Produto cadastrado' },
              { valor: 'custo', rotulo: 'Digitar o custo' },
            ]}
          />
          {modo === 'produto' ? (
            <Campo rotulo="Produto" dica={produto ? `Custo por peça: ${formatReais(custoProduto(produto.id), 4)}` : undefined}>
              <Escolha value={produtoId} onChange={setProdutoId} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} placeholder="Escolha o produto" />
            </Campo>
          ) : (
            <Campo rotulo="Custo por peça">
              <Numero value={custoManual} onChange={setCustoManual} decimais={4} min={0} prefixo="R$" />
            </Campo>
          )}
        </div>
      </Cartao>
      {custo != null && custo > 0 && (
        <Cartao titulo="Preço por canal">
          <SimuladorPreco
            key={`${modo}-${produtoId}-${custo}`}
            custoUnit={custo}
            precoInicial={modo === 'produto' ? produto?.precoEtiquetaCentavos : null}
            margemPct={modo === 'produto' ? produto?.margemPct : null}
          />
        </Cartao>
      )}
    </Pagina>
  );
}
