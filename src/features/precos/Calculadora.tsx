// "Calculadora de preço" (6.5): a mesma conta da ficha técnica com campos livres, para cotar algo
// sem cadastrar produto. "Criar pedido com este cálculo" leva a ficha para um novo pedido.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { salvarLocal } from '../../data/local.ts';
import { round4 } from '../../lib/money.ts';
import { formatReais } from '../../lib/format.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { Botao, Campo, Cartao, Dinheiro, Grade, Numero, Pagina, Texto } from '../../ui/index.ts';
import { ComposicaoCustoView, FichaTecnicaEditor, PrecosSugeridos, TabelaSimulador, fichaVazia, useComposicao } from './componentes.tsx';

/** Chave do aparelho onde a calculadora deixa o cálculo para o formulário de pedido. */
export const CHAVE_CALCULO_PARA_PEDIDO = 'calculadora:para-pedido';

export interface CalculoParaPedido {
  descricao: string;
  quantidade: number;
  ficha: FichaTecnica;
}

export function Calculadora(_props: TelaProps) {
  useDb();
  const [ficha, setFicha] = useState<FichaTecnica>(fichaVazia);
  const [quantidade, setQuantidade] = useState<number | null>(1);
  const [descricao, setDescricao] = useState('');
  const [precoTeste, setPrecoTeste] = useState<number | null>(null);
  const comp = useComposicao(ficha);
  const qtd = Math.max(1, quantidade ?? 1);

  const criarPedido = () => {
    const calculo: CalculoParaPedido = { descricao: descricao.trim() || 'Peça personalizada', quantidade: qtd, ficha };
    salvarLocal(CHAVE_CALCULO_PARA_PEDIDO, calculo);
    navegar('/pedidos/novo?da=calculadora');
  };

  return (
    <Pagina
      titulo="Calculadora de preço"
      subtitulo="Cote uma peça sem cadastrar produto"
      voltarPara="/mais"
      acoes={
        <Botao variante="primario" icone="pedidos" onClick={criarPedido} disabled={comp.total <= 0}>
          Criar pedido com este cálculo
        </Botao>
      }
      largura="larga"
    >
      <Grade colunas={2}>
        <div class="pilha pilha-m">
          <Cartao titulo="O que vai imprimir">
            <div class="pilha pilha-m">
              <Campo rotulo="Descrição (opcional)">
                <Texto value={descricao} onInput={setDescricao} placeholder="Ex.: chaveiro com nome" />
              </Campo>
              <Campo rotulo="Quantidade de peças">
                <Numero value={quantidade} onChange={setQuantidade} decimais={0} min={1} stepper />
              </Campo>
            </div>
          </Cartao>
          <Cartao titulo="Ficha técnica">
            <FichaTecnicaEditor valor={ficha} onChange={setFicha} />
          </Cartao>
        </div>
        <div class="pilha pilha-m">
          <Cartao titulo="Custo por peça">
            <ComposicaoCustoView composicao={comp} quantidade={qtd} />
          </Cartao>
          {comp.total > 0 && (
            <>
              <Cartao titulo="Preço sugerido por peça">
                <PrecosSugeridos custoUnit={comp.total} onUsar={setPrecoTeste} />
                <p class="muted" style={{ marginTop: '8px' }}>
                  Custo total de {qtd} peça(s): <strong>{formatReais(round4(comp.total * qtd), 2)}</strong>
                </p>
              </Cartao>
              <Cartao titulo="Testar um preço por peça">
                <div class="pilha pilha-m">
                  <Campo rotulo="Preço de etiqueta">
                    <Dinheiro value={precoTeste} onChange={setPrecoTeste} />
                  </Campo>
                  {precoTeste != null && precoTeste > 0 && <TabelaSimulador custoUnit={comp.total} precoCentavos={precoTeste} />}
                </div>
              </Cartao>
            </>
          )}
        </div>
      </Grade>
    </Pagina>
  );
}
