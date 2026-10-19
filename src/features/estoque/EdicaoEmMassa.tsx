// Edição em massa dos produtos selecionados no Estoque: categoria, estoque mínimo, margem, preço de etiqueta e
// situação (arquivar/reativar). Mostra a prévia dos preços antes de aplicar; tudo ou nada.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { contextoCusto, margemDoProduto } from '../../data/selectors.ts';
import type { Cents, Produto } from '../../data/types.ts';
import { formatBRL, formatPct, formatQtd } from '../../lib/format.ts';
import { editarProdutosEmMassa, precoEmMassa, type AjustePreco, type EdicaoEmMassa } from '../../services/produtos.ts';
import { Aviso, Botao, Campo, Dinheiro, Escolha, Modal, Numero, Segmentado, avisar, confirmar } from '../../ui/index.ts';

type ModoMargem = 'manter' | 'definir' | 'padrao';
type ModoPreco = 'manter' | 'definir' | 'percentual' | 'sugerido';
type ModoSituacao = 'manter' | 'arquivar' | 'reativar';

/** Quantas linhas da prévia de preços mostrar. */
const PREVIA = 8;

export function EdicaoEmMassaModal({ produtos, onFechar, onAplicado }: { produtos: Produto[]; onFechar: () => void; onAplicado: () => void }) {
  const [categoria, setCategoria] = useState('');
  const [minimo, setMinimo] = useState<number | null>(null);
  const [modoMargem, setModoMargem] = useState<ModoMargem>('manter');
  const [margem, setMargem] = useState<number | null>(null);
  const [modoPreco, setModoPreco] = useState<ModoPreco>('manter');
  const [preco, setPreco] = useState<Cents | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [situacao, setSituacao] = useState<ModoSituacao>('manter');
  const padrao = db.config.custos.margemDesejadaPct;

  const margemFinal = (p: Produto): number | null => (modoMargem === 'definir' ? margem : modoMargem === 'padrao' ? null : (p.margemPct ?? null));
  const ajuste: AjustePreco | undefined =
    modoPreco === 'definir' && preco != null
      ? { modo: 'definir', centavos: preco }
      : modoPreco === 'percentual' && pct != null
        ? { modo: 'percentual', pct }
        : modoPreco === 'sugerido'
          ? { modo: 'sugerido' }
          : undefined;

  const edicao: EdicaoEmMassa = {};
  if (categoria) edicao.categoria = categoria;
  if (minimo != null) edicao.estoqueMinimo = minimo;
  if (modoMargem === 'definir' && margem != null) edicao.margemPct = margem;
  if (modoMargem === 'padrao') edicao.margemPct = null;
  if (ajuste) edicao.preco = ajuste;
  if (situacao !== 'manter') edicao.arquivado = situacao === 'arquivar';
  const vazio = Object.keys(edicao).length === 0;

  const ctx = contextoCusto();
  const previa = ajuste ? produtos.map((p) => ({ p, novo: precoEmMassa(p, ajuste, margemFinal(p), ctx) })) : [];

  const aplicar = async () => {
    const itens: string[] = [];
    if (edicao.categoria) itens.push(`Categoria: ${edicao.categoria}`);
    if (edicao.estoqueMinimo != null) itens.push(`Estoque mínimo em Casa: ${formatQtd(edicao.estoqueMinimo)}`);
    if (edicao.margemPct !== undefined) itens.push(edicao.margemPct == null ? `Margem: volta à padrão (${formatPct(padrao, 0)})` : `Margem de lucro: ${formatPct(edicao.margemPct)}`);
    if (ajuste) {
      itens.push(
        ajuste.modo === 'definir'
          ? `Preço de etiqueta: ${formatBRL(ajuste.centavos)}`
          : ajuste.modo === 'percentual'
            ? `Preço de etiqueta: ${ajuste.pct > 0 ? '+' : ''}${formatPct(ajuste.pct)} (arredondado)`
            : 'Preço de etiqueta: o sugerido de cada produto',
      );
    }
    if (edicao.arquivado != null) itens.push(edicao.arquivado ? 'Arquivar' : 'Reativar');
    itens.push('Vendas e acertos já feitos não mudam.');
    const ok = await confirmar({ titulo: `Alterar ${produtos.length} produto(s)?`, itens, confirmar: 'Aplicar' });
    if (!ok) return;
    try {
      editarProdutosEmMassa(
        produtos.map((p) => p.id),
        edicao,
      );
      avisar(`${produtos.length} produto(s) alterado(s)`);
      onAplicado();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Modal
      aberto
      largura="larga"
      titulo={`Editar ${produtos.length} produto(s)`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" icone="check" onClick={aplicar} disabled={vazio}>
            Aplicar
          </Botao>
        </>
      }
    >
      <div class="formulario">
        <p class="muted">Só muda o que você preencher. O resto de cada produto continua como está.</p>
        <div class="campos-2">
          <Campo rotulo="Categoria">
            <Escolha value={categoria} onChange={setCategoria} opcoes={[{ valor: '', rotulo: 'Não mudar' }, ...db.config.categorias.map((c) => ({ valor: c, rotulo: c }))]} />
          </Campo>
          <Campo rotulo="Estoque mínimo em Casa" dica="Vazio = não mudar">
            <Numero value={minimo} onChange={(v) => setMinimo(v == null ? null : Math.max(0, Math.round(v)))} decimais={0} min={0} placeholder="Não mudar" />
          </Campo>
        </div>

        <Campo rotulo="Margem de lucro">
          <Segmentado
            value={modoMargem}
            onChange={setModoMargem}
            opcoes={[
              { valor: 'manter', rotulo: 'Não mudar' },
              { valor: 'definir', rotulo: 'Definir' },
              { valor: 'padrao', rotulo: `Usar a padrão (${formatPct(padrao, 0)})` },
            ]}
          />
        </Campo>
        {modoMargem === 'definir' && (
          <Campo rotulo="Nova margem de lucro">
            <Numero value={margem} onChange={setMargem} min={0} max={99} decimais={1} sufixo="%" autoFocus />
          </Campo>
        )}

        <Campo rotulo="Preço de etiqueta">
          <Segmentado
            value={modoPreco}
            onChange={setModoPreco}
            opcoes={[
              { valor: 'manter', rotulo: 'Não mudar' },
              { valor: 'definir', rotulo: 'Mesmo valor' },
              { valor: 'percentual', rotulo: 'Reajustar %' },
              { valor: 'sugerido', rotulo: 'Usar o sugerido' },
            ]}
          />
        </Campo>
        {modoPreco === 'definir' && (
          <Campo rotulo="Novo preço para todos">
            <Dinheiro value={preco} onChange={setPreco} />
          </Campo>
        )}
        {modoPreco === 'percentual' && (
          <Campo rotulo="Reajuste" dica="Ex.: 10 sobe 10%; −5 desce 5%. Arredonda como os preços sugeridos">
            <Numero value={pct} onChange={setPct} min={-99} max={500} decimais={1} sufixo="%" autoFocus />
          </Campo>
        )}
        {modoPreco === 'sugerido' && <p class="muted">Cada produto recebe a etiqueta sugerida pelo custo atual e pela margem dele.</p>}

        <Campo rotulo="Situação">
          <Segmentado
            value={situacao}
            onChange={setSituacao}
            opcoes={[
              { valor: 'manter', rotulo: 'Não mudar' },
              { valor: 'arquivar', rotulo: 'Arquivar' },
              { valor: 'reativar', rotulo: 'Reativar' },
            ]}
          />
        </Campo>

        {previa.length > 0 && (
          <div class="est-massa-previa">
            <strong>Prévia do preço</strong>
            <ul>
              {previa.slice(0, PREVIA).map(({ p, novo }) => (
                <li key={p.id}>
                  <span>{p.nome}</span>
                  <span>
                    {formatBRL(p.precoEtiquetaCentavos)} → <strong class={novo == null ? 'txt-ruim' : ''}>{novo == null ? 'sem sugestão' : formatBRL(novo)}</strong>
                    {modoPreco === 'sugerido' && <small class="muted"> · margem {formatPct(margemFinal(p) ?? margemDoProduto(null), 0)}</small>}
                  </span>
                </li>
              ))}
            </ul>
            {previa.length > PREVIA && <small class="muted">e mais {previa.length - PREVIA} produto(s)</small>}
          </div>
        )}
        {vazio && <Aviso tom="info">Escolha pelo menos uma alteração.</Aviso>}
      </div>
    </Modal>
  );
}
