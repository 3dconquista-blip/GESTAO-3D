// "Mix do parceiro" (8.3): produtos do expositor, nível ideal e preço próprio.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto, produtosAtivos, saldoNoParceiro } from '../../data/selectors.ts';
import type { ItemMix } from '../../data/types.ts';
import { nivelSugeridoDoProduto } from '../../domain/mix.ts';
import { formatBRL } from '../../lib/format.ts';
import { salvarMix } from '../../services/parceiros.ts';
import { Botao, Campo, Cartao, Dinheiro, Escolha, Linha, Numero, Pagina, Vazio, avisar } from '../../ui/index.ts';
import { ParceiroNaoEncontrado } from './comum.tsx';

export function MixParceiro({ params }: TelaProps) {
  useDb();
  const p = db.get('parceiros', params.id);
  const [mix, setMix] = useState<ItemMix[]>(() => (p ? p.mix.map((m) => ({ ...m })) : []));
  const [novo, setNovo] = useState<string | null>(null);
  if (!p) return <ParceiroNaoEncontrado />;
  const disponiveis = produtosAtivos().filter((x) => !mix.some((m) => m.produtoId === x.id));
  const mudar = (produtoId: string, patch: Partial<ItemMix>) => setMix(mix.map((m) => (m.produtoId === produtoId ? { ...m, ...patch } : m)));

  const salvar = () => {
    try {
      salvarMix(p.id, mix);
      avisar('Mix salvo');
      navegar(p.instaladoEm ? `/parceiros/${p.id}` : `/parceiros/${p.id}/levar`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo={`Mix — ${p.nome}`} subtitulo="O nível ideal é quanto deve ficar no expositor depois de cada reposição." voltarPara={`/parceiros/${p.id}`} largura="estreita">
      {mix.length === 0 && <Vazio icone="estoque" titulo="Nenhum produto no mix" texto="Escolha os produtos que vão para este expositor." />}
      {mix.map((m) => {
        const produto = db.get('produtos', m.produtoId);
        const sugestao = nivelSugeridoDoProduto(db.all('acertos'), p.id, m.produtoId);
        return (
          <Cartao key={m.produtoId} titulo={nomeProduto(m.produtoId)} acoes={<Botao pequeno variante="fantasma" icone="fechar" title="Tirar do mix" onClick={() => setMix(mix.filter((x) => x.produtoId !== m.produtoId))} />}>
            <div class="campos-2">
              <Campo rotulo="Nível ideal" dica={`Sugestão: ${sugestao} (venda média por ciclo + 30%, mínimo 2). No expositor agora: ${saldoNoParceiro(m.produtoId, p.id)}`}>
                <Numero value={m.nivelIdeal} onChange={(v) => mudar(m.produtoId, { nivelIdeal: Math.max(0, v ?? 0) })} decimais={0} min={0} stepper />
              </Campo>
              <Campo rotulo="Preço neste parceiro" dica={`Vazio = etiqueta do produto (${formatBRL(produto?.precoEtiquetaCentavos ?? 0)})`}>
                <Dinheiro value={m.precoEtiquetaCentavos ?? null} onChange={(v) => mudar(m.produtoId, { precoEtiquetaCentavos: v ?? undefined })} placeholder={((produto?.precoEtiquetaCentavos ?? 0) / 100).toFixed(2).replace('.', ',')} />
              </Campo>
            </div>
          </Cartao>
        );
      })}
      <Cartao titulo="Adicionar produto">
        <Linha quebra={false}>
          <Escolha value={novo} onChange={setNovo} opcoes={disponiveis.map((x) => ({ valor: x.id, rotulo: x.nome }))} placeholder={disponiveis.length ? 'Escolha o produto' : 'Todos os produtos já estão no mix'} />
          <Botao
            icone="plus"
            disabled={!novo}
            onClick={() => {
              if (!novo) return;
              setMix([...mix, { produtoId: novo, nivelIdeal: nivelSugeridoDoProduto(db.all('acertos'), p.id, novo) }]);
              setNovo(null);
            }}
          >
            Adicionar
          </Botao>
        </Linha>
      </Cartao>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          {p.instaladoEm ? 'Salvar mix' : 'Salvar e levar peças'}
        </Botao>
      </div>
    </Pagina>
  );
}
