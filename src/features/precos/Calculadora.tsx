// "Calculadora de custo" (decisão 107): onde se faz a conta detalhada de uma peça (mesas, peças por mesa, tempo,
// impressora, gramas, tipo de filamento, insumos e mão de obra; ou "Importar do fatiador"). O resultado (custo,
// gramas e tempo por peça) vai para um produto novo ou existente com um toque. A conta fica guardada neste aparelho.
import { useEffect, useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { apagarLocal, lerLocal, salvarLocal } from '../../data/local.ts';
import { produtosAtivos } from '../../data/selectors.ts';
import type { TipoFilamento } from '../../data/types.ts';
import { tipoDoSlot } from '../../domain/filamento.ts';
import { gramasPorPeca, tempoPorPeca, type FichaTecnica } from '../../domain/pricing.ts';
import { formatDuracao, formatGramas, formatReais } from '../../lib/format.ts';
import { round4 } from '../../lib/money.ts';
import { Aviso, Botao, Campo, Cartao, Escolha, Linha, MaisDetalhes, Pagina, Texto } from '../../ui/index.ts';
import { EstoqueAbas } from '../estoque/EstoqueAbas.tsx';
import { ComponentesEditor, ComposicaoCustoView, FichaTecnicaEditor, PrecosSugeridos, fichaVazia, useComposicao } from './componentes.tsx';
import { ImportarFatiador, fichaDaImportacao } from './ImportarFatiador.tsx';

const CHAVE = 'calculadora:conta';

interface Conta {
  nome: string;
  ficha: FichaTecnica;
}

/** Tipo de filamento com mais gramas por peça (o que vai para o produto). */
function tipoPrincipal(ficha: FichaTecnica): TipoFilamento {
  const porTipo = new Map<TipoFilamento, number>();
  const material = (id: string) => db.get('materiais', id);
  for (const m of ficha.mesas) {
    for (const f of m.filamentos) {
      const t = tipoDoSlot(f, material);
      porTipo.set(t, (porTipo.get(t) || 0) + (f.gramas || 0) / (m.pecasPorMesa > 0 ? m.pecasPorMesa : 1));
    }
  }
  return Array.from(porTipo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'PLA';
}

export function Calculadora(_props: TelaProps) {
  useDb();
  const [conta, setConta] = useState<Conta>(() => lerLocal<Conta>(CHAVE) ?? { nome: '', ficha: fichaVazia() });
  const [produtoId, setProdutoId] = useState<string | null>(null);
  useEffect(() => salvarLocal(CHAVE, conta), [conta]);
  const { ficha } = conta;
  const comp = useComposicao(ficha);
  const custo = round4(comp.total);
  const gramas = gramasPorPeca(ficha);
  const tempo = tempoPorPeca(ficha);
  const tipo = tipoPrincipal(ficha);
  const pronto = custo > 0 && gramas > 0;
  const mudarFicha = (f: FichaTecnica) => setConta({ ...conta, ficha: f });

  const parametros = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ custo: String(custo), gramas: String(round4(gramas)), tipo, ...(tempo ? { tempo: String(tempo) } : {}), ...extra }).toString();

  return (
    <Pagina titulo="Estoque" largura="estreita">
      <EstoqueAbas ativa="calculadora" />
      <Cartao titulo="Calcular o custo de uma peça">
        <div class="formulario">
          <Campo rotulo="Nome da peça (opcional)">
            <Texto value={conta.nome} onInput={(v) => setConta({ ...conta, nome: v })} placeholder="Ex.: Chaveiro Kettlebell" />
          </Campo>
          <ImportarFatiador
            onImportar={(imp) =>
              setConta({ nome: conta.nome.trim() || imp.nome || '', ficha: fichaDaImportacao(imp, ficha) })
            }
          />
          <FichaTecnicaEditor valor={ficha} onChange={mudarFicha} modo="produto" mostrarExtras />
        </div>
      </Cartao>
      <MaisDetalhes titulo="Insumos e mão de obra" resumo={`${ficha.componentes.length} insumo(s) · ${ficha.maoDeObraMin} min de mão de obra por peça`}>
        <ComponentesEditor valor={ficha} onChange={mudarFicha} />
      </MaisDetalhes>

      <Cartao titulo="Resultado">
        <div class="calc-resultado">
          <div>
            <span>Custo por peça</span>
            <strong>{custo > 0 ? formatReais(custo) : '—'}</strong>
          </div>
          <div>
            <span>Filamento por peça</span>
            <strong>{gramas > 0 ? `${formatGramas(gramas)} de ${tipo}` : '—'}</strong>
          </div>
          <div>
            <span>Tempo por peça</span>
            <strong>{tempo > 0 ? formatDuracao(tempo) : '—'}</strong>
          </div>
        </div>
        {comp.avisos.map((a) => (
          <Aviso key={a} tom="atencao">
            {a}
          </Aviso>
        ))}
        {custo > 0 && (
          <MaisDetalhes titulo="Como chegamos no custo e preço por canal">
            <ComposicaoCustoView composicao={comp} />
            <PrecosSugeridos custoUnit={comp.total} />
          </MaisDetalhes>
        )}
      </Cartao>

      <Cartao titulo="Usar no produto">
        <div class="pilha pilha-m">
          <Botao variante="primario" icone="plus" disabled={!pronto} onClick={() => navegar(`/estoque/produtos/novo?${parametros(conta.nome.trim() ? { nome: conta.nome.trim() } : {})}`)}>
            Criar produto com este custo
          </Botao>
          <Linha quebra={false}>
            <Escolha value={produtoId} onChange={setProdutoId} opcoes={produtosAtivos().map((p) => ({ valor: p.id, rotulo: p.nome }))} placeholder="Ou escolha um produto já cadastrado" />
            <Botao disabled={!pronto || !produtoId} onClick={() => produtoId && navegar(`/estoque/produtos/${produtoId}/editar?${parametros()}`)}>
              Usar
            </Botao>
          </Linha>
          {!pronto && <small class="muted">Preencha o tempo, as peças por mesa e as gramas (ou importe do fatiador) para ver o custo.</small>}
          <div>
            <Botao
              pequeno
              variante="fantasma"
              icone="atualizar"
              onClick={() => {
                apagarLocal(CHAVE);
                setConta({ nome: '', ficha: fichaVazia() });
              }}
            >
              Começar outra conta
            </Botao>
          </div>
        </div>
      </Cartao>
    </Pagina>
  );
}
