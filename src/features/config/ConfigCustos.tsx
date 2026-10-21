// Configurações > Custos e preços (seção 6.1) e padrões de estoque.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import type { ParametrosCusto } from '../../data/types.ts';
import { erroParametros, multiplicadorDireto } from '../../domain/pricing.ts';
import { formatNumero } from '../../lib/format.ts';
import { atualizarCustos, atualizarEstoqueConfig } from '../../services/config.ts';
import { Aviso, Botao, Campo, Cartao, Dinheiro, Numero, Pagina, Segmentado } from '../../ui/index.ts';
import { BarraSalvar, TambemNestaSecao, mostrarAvisos, tentar } from './comum.tsx';

export function ConfigCustos() {
  const [c, setC] = useState<ParametrosCusto>(() => ({ ...db.config.custos }));
  const [est, setEst] = useState(() => ({ ...db.config.estoque }));
  const mudar = (patch: Partial<ParametrosCusto>) => setC({ ...c, ...patch });
  const mult = multiplicadorDireto(c);
  const erro = erroParametros(c);

  const salvar = () =>
    tentar(() => {
      const r = atualizarCustos(c);
      atualizarEstoqueConfig(est);
      mostrarAvisos(r.avisos);
    });

  return (
    <Pagina titulo="Custos e preços" voltarPara="/config" largura="estreita">
      <Cartao titulo="Produção">
        <div class="campos-2">
          <Campo rotulo="Tarifa de energia" dica="Valor total da conta de luz ÷ kWh consumidos">
            <Numero value={c.tarifaKwh} onChange={(v) => mudar({ tarifaKwh: v ?? 0 })} decimais={4} min={0} prefixo="R$" sufixo="/kWh" />
          </Campo>
          <Campo rotulo="Valor da sua hora de trabalho" dica="Preparar a mesa, acabamento, montagem e embalagem">
            <Numero value={c.valorHora} onChange={(v) => mudar({ valorHora: v ?? 0 })} min={0} prefixo="R$" sufixo="/h" />
          </Campo>
          <Campo rotulo="Valor da hora de modelagem" dica="Pedidos personalizados">
            <Numero value={c.valorHoraModelagem} onChange={(v) => mudar({ valorHoraModelagem: v ?? 0 })} min={0} prefixo="R$" sufixo="/h" />
          </Campo>
          <Campo rotulo="Taxa de falha" dica="Aplicada só sobre o custo de impressão">
            <Numero value={c.taxaFalhaPct} onChange={(v) => mudar({ taxaFalhaPct: v ?? 0 })} min={0} max={100} sufixo="%" />
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Preço">
        <div class="pilha pilha-m">
          <div class="campos-2">
            <Campo
              rotulo="Margem desejada (padrão)"
              dica={
                mult != null
                  ? `Equivale a vender por ${formatNumero(mult, 1)}× o custo na venda direta. Cada produto pode ter a sua margem`
                  : 'Lucro como % do que você recebe. Cada produto pode ter a sua margem'
              }
            >
              <Numero value={c.margemDesejadaPct} onChange={(v) => mudar({ margemDesejadaPct: v ?? 0 })} min={0} max={100} sufixo="%" />
            </Campo>
            <Campo rotulo="Margem mínima de alerta" dica="Abaixo disso o preço fica vermelho">
              <Numero value={c.margemMinimaPct} onChange={(v) => mudar({ margemMinimaPct: v ?? 0 })} min={0} max={100} sufixo="%" />
            </Campo>
            <Campo rotulo="Taxa do cartão" dica="Crédito à vista na maquininha">
              <Numero value={c.taxaCartaoPct} onChange={(v) => mudar({ taxaCartaoPct: v ?? 0 })} min={0} max={99} sufixo="%" />
            </Campo>
          </div>
          {erro && <Aviso tom="ruim">{erro}</Aviso>}
          <Campo rotulo="Arredondamento do preço" dica="Sempre para cima">
            <Segmentado
              value={c.arredondamento}
              onChange={(v) => mudar({ arredondamento: v })}
              opcoes={[
                { valor: 'noventa', rotulo: 'Terminar em ,90' },
                { valor: 'inteiro', rotulo: 'Inteiro' },
                { valor: 'nenhum', rotulo: 'Nenhum' },
              ]}
            />
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Resultado do mês">
        <div class="campos-2">
          <Campo rotulo="Custos fixos mensais" dica="Internet, assinaturas, aluguel. Não entra no preço: só no resultado do mês">
            <Dinheiro value={c.custosFixosMensaisCentavos} onChange={(v) => mudar({ custosFixosMensaisCentavos: v ?? 0 })} />
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Estoque">
        <div class="campos-2">
          <Campo rotulo="Mínimo padrão de filamento" dica="Usado ao cadastrar um filamento novo">
            <Numero value={est.minimoFilamentoPadraoG} onChange={(v) => setEst({ ...est, minimoFilamentoPadraoG: v ?? 0 })} decimais={0} min={0} sufixo="g" />
          </Campo>
          <Campo rotulo="Alerta de produto sem venda" dica="Dias sem vender para aparecer nos alertas">
            <Numero value={est.diasSemVendaAlerta} onChange={(v) => setEst({ ...est, diasSemVendaAlerta: v ?? 60 })} decimais={0} min={1} sufixo="dias" />
          </Campo>
        </div>
      </Cartao>

      <p class="muted">Mudar os custos recalcula o custo dos produtos, mas o preço de etiqueta não muda sozinho: produtos com margem abaixo da mínima ganham um alerta.</p>

      <TambemNestaSecao
        itens={[
          { rotulo: 'Canais de venda', texto: 'Comissão de cada canal (PIX, cartão, parceiros, marketplace)', href: '/config/canais', icone: 'etiqueta' },
          { rotulo: 'Categorias', texto: 'Categorias dos produtos', href: '/config/categorias', icone: 'camadas' },
        ]}
      />

      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={salvar} disabled={!!erro}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}
