// Configurações > Categorias dos produtos.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { adicionarCategoria, removerCategoria, renomearCategoria } from '../../services/config.ts';
import { normalizarBusca } from '../../lib/format.ts';
import { Botao, Cartao, Linha, Pagina, Texto, confirmar } from '../../ui/index.ts';
import { tentar } from './comum.tsx';

export function ConfigCategorias() {
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<{ atual: string; texto: string } | null>(null);
  const uso = (c: string) => db.all('produtos').filter((p) => !p.excluido && normalizarBusca(p.categoria) === normalizarBusca(c)).length;

  return (
    <Pagina titulo="Categorias" voltarPara="/config/custos" largura="estreita">
      <Cartao>
        <div class="pilha pilha-m">
          {db.config.categorias.map((c) =>
            editando?.atual === c ? (
              <Linha key={c}>
                <Texto value={editando.texto} onInput={(v) => setEditando({ atual: c, texto: v })} autoFocus />
                <Botao
                  variante="primario"
                  pequeno
                  onClick={() => {
                    if (tentar(() => renomearCategoria(c, editando.texto), 'Categoria renomeada')) setEditando(null);
                  }}
                >
                  Salvar
                </Botao>
                <Botao variante="fantasma" pequeno onClick={() => setEditando(null)}>
                  Cancelar
                </Botao>
              </Linha>
            ) : (
              <div key={c} class="cfg-categoria">
                <span>
                  {c} <small class="muted">· {uso(c)} produto(s)</small>
                </span>
                <span class="linha">
                  <Botao pequeno variante="fantasma" icone="editar" title="Renomear" onClick={() => setEditando({ atual: c, texto: c })} />
                  <Botao
                    pequeno
                    variante="fantasma"
                    icone="lixeira"
                    title="Remover"
                    onClick={async () => {
                      if (await confirmar({ titulo: `Remover a categoria "${c}"?`, confirmar: 'Remover', perigo: true })) tentar(() => removerCategoria(c), 'Categoria removida');
                    }}
                  />
                </span>
              </div>
            ),
          )}
        </div>
      </Cartao>
      <Cartao titulo="Nova categoria">
        <Linha quebra={false}>
          <Texto value={nova} onInput={setNova} placeholder="Ex.: Brinquedo" />
          <Botao
            icone="plus"
            disabled={!nova.trim()}
            onClick={() => {
              if (tentar(() => adicionarCategoria(nova), 'Categoria adicionada')) setNova('');
            }}
          >
            Adicionar
          </Botao>
        </Linha>
      </Cartao>
    </Pagina>
  );
}
