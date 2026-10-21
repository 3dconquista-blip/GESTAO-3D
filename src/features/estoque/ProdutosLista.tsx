// Estoque > Produtos (7.1): foto, nome, em Casa, nos parceiros, total, custo, preço e margem com cor de status.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { custoProduto, custosDoProduto, saldosDoProduto, statusMargemProduto } from '../../data/selectors.ts';
import type { ID, Produto } from '../../data/types.ts';
import { simular, type StatusMargem } from '../../domain/pricing.ts';
import { combinaBusca, formatBRL, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { valorParadoEmEstoque } from '../../services/ajustes.ts';
import { alertaLicenca, copiarProduto, excluirProdutos, previaExclusao } from '../../services/produtos.ts';
import { Botao, Busca, Cartao, Chave, Escolha, Icon, Pagina, Selo, Tabela, Vazio, avisar, confirmar, type Coluna } from '../../ui/index.ts';
import { alertasAtuais } from '../../services/consultas.ts';
import { ResumoAlertas } from './Alertas.tsx';
import { EdicaoEmMassaModal } from './EdicaoEmMassa.tsx';
import { EstoqueAbas } from './EstoqueAbas.tsx';

const TOM_MARGEM: Record<StatusMargem, 'ok' | 'atencao' | 'ruim' | 'neutro'> = { ok: 'ok', atencao: 'atencao', prejuizo: 'ruim', sem_preco: 'neutro' };

/** Selo da margem do produto: menor margem entre os canais ativos, com a cor do status. */
export function SeloMargem({ p }: { p: Produto }) {
  const st = statusMargemProduto(p);
  if (st === 'sem_preco') return <Selo tom="neutro">Sem preço</Selo>;
  const sim = simular(p.precoEtiquetaCentavos, custoProduto(p.id), db.config.canais, custosDoProduto(p));
  return <Selo tom={TOM_MARGEM[st]}>{Number.isFinite(sim.piorMargemPct) ? formatPct(sim.piorMargemPct) : '—'}</Selo>;
}

export function FotoProduto({ p, tamanho = 40 }: { p: Produto; tamanho?: number }) {
  return p.fotoDataUrl ? (
    <img class="est-foto" src={p.fotoDataUrl} alt="" style={{ width: `${tamanho}px`, height: `${tamanho}px` }} />
  ) : (
    <span class="est-foto" style={{ width: `${tamanho}px`, height: `${tamanho}px` }}>
      <Icon nome="estoque" tamanho={tamanho * 0.5} />
    </span>
  );
}

export function ProdutosLista(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [arquivados, setArquivados] = useState(false);
  // Edição em massa: modo de seleção, produtos marcados e o modal de alterações.
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<ID>>(new Set());
  const [editando, setEditando] = useState(false);

  // Produtos excluídos somem do app (o histórico deles continua nas movimentações).
  const todos = db.all('produtos').filter((p) => !p.excluido);
  const visiveis = todos.filter((p) => (arquivados ? p.arquivado : !p.arquivado));
  const lista = visiveis
    .filter((p) => !categoria || p.categoria === categoria)
    .filter((p) => combinaBusca(busca, p.nome, p.codigo, p.categoria))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const parado = valorParadoEmEstoque();

  const marcados = lista.filter((p) => sel.has(p.id));
  const todosMarcados = lista.length > 0 && marcados.length === lista.length;
  const alternar = (id: ID) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sairDaSelecao = () => {
    setSelecionando(false);
    setSel(new Set());
  };

  const copiar = (p: Produto) => {
    try {
      const novo = copiarProduto(p.id);
      avisar(`Cópia criada: ${novo.nome} (${novo.codigo})`);
      navegar(`/estoque/produtos/${novo.id}/editar`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const excluirMarcados = async () => {
    const previas = marcados.map((p) => previaExclusao(p.id));
    const bloqueados = previas.filter((x) => x.bloqueio);
    if (bloqueados.length) return avisar(bloqueados.map((x) => x.bloqueio).join(' '), 'ruim');
    const pecas = previas.reduce((s, x) => s + Math.max(0, x.emCasa), 0);
    const ok = await confirmar({
      titulo: `Excluir ${marcados.length} produto(s)?`,
      itens: [
        marcados.length <= 6 ? marcados.map((p) => p.nome).join(', ') : `${marcados.slice(0, 5).map((p) => p.nome).join(', ')} e mais ${marcados.length - 5}`,
        'Somem de vez das listas. Não dá para reativar.',
        pecas > 0 ? `${formatQtd(pecas)} peça(s) em Casa saem do estoque (ajuste "Produto excluído", não conta como perda).` : '',
        'O histórico continua guardado: movimentações, vendas e acertos antigos mostram "(excluído)".',
      ].filter(Boolean),
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      const n = excluirProdutos(marcados.map((p) => p.id));
      avisar(`${n} produto(s) excluído(s)`);
      sairDaSelecao();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const colunaSelecao: Coluna<Produto> = {
    id: 'sel',
    rotulo: (
      <input
        type="checkbox"
        class="est-check"
        aria-label="Selecionar todos"
        checked={todosMarcados}
        onChange={() => setSel(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)))}
      />
    ),
    largura: '40px',
    render: (p) => <input type="checkbox" class="est-check" aria-label={`Selecionar ${p.nome}`} checked={sel.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => alternar(p.id)} />,
  };

  const colunaCopiar: Coluna<Produto> = {
    id: 'copiar',
    rotulo: '',
    alinhar: 'dir',
    largura: '48px',
    render: (p) => (
      <button
        type="button"
        class="btn btn-fantasma btn-sm btn-icone"
        title="Copiar produto"
        aria-label={`Copiar ${p.nome}`}
        onClick={(e) => {
          e.stopPropagation();
          copiar(p);
        }}
      >
        <Icon nome="copiar" tamanho={18} />
      </button>
    ),
  };

  const colunas: Coluna<Produto>[] = [
    {
      id: 'nome',
      rotulo: 'Produto',
      principal: true,
      render: (p) => (
        <span class="est-nome">
          <FotoProduto p={p} />
          <span class="est-nome-textos">
            <strong>{p.nome}</strong>
            <small>
              {p.codigo} · {p.categoria}
              {alertaLicenca(p) && ' · licença a conferir'}
            </small>
          </span>
        </span>
      ),
    },
    {
      id: 'casa',
      rotulo: 'Em Casa',
      alinhar: 'dir',
      render: (p) => {
        const s = saldosDoProduto(p.id).casa;
        return <span class={s < 0 ? 'txt-ruim negrito' : s < p.estoqueMinimo ? 'txt-atencao negrito' : ''}>{formatQtd(s)}</span>;
      },
    },
    { id: 'parceiros', rotulo: 'Nos parceiros', alinhar: 'dir', render: (p) => formatQtd(saldosDoProduto(p.id).parceiros) },
    { id: 'preco', rotulo: 'Preço', alinhar: 'dir', render: (p) => formatBRL(p.precoEtiquetaCentavos) },
    { id: 'margem', rotulo: 'Margem', alinhar: 'dir', render: (p) => <SeloMargem p={p} /> },
  ];
  const colunasTela = selecionando ? [colunaSelecao, ...colunas] : [...colunas, colunaCopiar];

  return (
    <Pagina
      titulo="Estoque"
      acoes={
        <>
          <Botao variante="secundario" icone="impressora" href="/producao/nova">
            Produção
          </Botao>
          <Botao variante="primario" icone="plus" href="/estoque/produtos/novo">
            Novo produto
          </Botao>
        </>
      }
    >
      <EstoqueAbas ativa="produtos" />
      <ResumoAlertas alertas={alertasAtuais()} />
      {todos.length > 0 && (
        <div class="est-parado">
          <span>Valor parado em estoque (a custo):</span>
          <span>
            em Casa <strong>{formatReais(parado.casa)}</strong>
          </span>
          <span>
            nos parceiros <strong>{formatReais(parado.parceiros)}</strong>
          </span>
        </div>
      )}
      <div class="est-filtros est-filtros-3">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar produto ou código..." />
        <Escolha value={categoria} onChange={setCategoria} opcoes={[{ valor: '', rotulo: 'Todas as categorias' }, ...db.config.categorias.map((c) => ({ valor: c, rotulo: c }))]} />
        <Chave
          checked={arquivados}
          onChange={(v) => {
            setArquivados(v);
            setSel(new Set());
          }}
        >
          Arquivados
        </Chave>
      </div>
      {lista.length > 0 && (
        <div class="est-massa-topo">
          {selecionando ? (
            <>
              <span>
                <strong>{marcados.length}</strong> de {lista.length} selecionado(s)
              </span>
              <Botao pequeno variante="fantasma" onClick={() => setSel(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)))}>
                {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
              </Botao>
            </>
          ) : (
            <>
              <Botao pequeno variante="secundario" icone="editar" onClick={() => setSelecionando(true)}>
                Editar em massa
              </Botao>
              <Botao pequeno variante="fantasma" href="/estoque/movimentacoes">
                Ver movimentações
              </Botao>
            </>
          )}
        </div>
      )}
      {lista.length === 0 ? (
        todos.length === 0 ? (
          <Vazio
            icone="estoque"
            titulo="Nenhum produto cadastrado"
            texto="Cadastre um produto com a ficha técnica do fatiador e o app calcula o custo e o preço em cada canal."
            acao={{ rotulo: 'Cadastrar o primeiro produto', href: '/estoque/produtos/novo' }}
          />
        ) : (
          <Vazio icone="busca" titulo="Nenhum produto encontrado" texto="Mude a busca ou os filtros." />
        )
      ) : (
        <Cartao>
          <Tabela
            colunas={colunasTela}
            linhas={lista}
            chave={(p) => p.id}
            onClickLinha={(p) => (selecionando ? alternar(p.id) : navegar(`/estoque/produtos/${p.id}`))}
            tomLinha={(p) => (selecionando && sel.has(p.id) ? 'ok' : statusMargemProduto(p) === 'prejuizo' ? 'ruim' : undefined)}
          />
        </Cartao>
      )}
      {selecionando && (
        <div class="barra-acoes-fixa">
          <Botao variante="fantasma" onClick={sairDaSelecao}>
            Cancelar
          </Botao>
          <Botao variante="perigo" icone="lixeira" onClick={excluirMarcados} disabled={!marcados.length}>
            Excluir
          </Botao>
          <Botao variante="primario" icone="editar" onClick={() => setEditando(true)} disabled={!marcados.length}>
            Editar {marcados.length || ''}
          </Botao>
        </div>
      )}
      {editando && (
        <EdicaoEmMassaModal
          produtos={marcados}
          onFechar={() => setEditando(false)}
          onAplicado={() => {
            setEditando(false);
            sairDaSelecao();
          }}
        />
      )}
    </Pagina>
  );
}
