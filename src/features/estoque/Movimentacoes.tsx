// Estoque > Movimentações (7.2): todas as entradas e saídas, com filtros e estorno dos lançamentos manuais.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_TIPO_MOV } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto, produtosAtivos } from '../../data/selectors.ts';
import type { MovEstoque, TipoMovEstoque } from '../../data/types.ts';
import { CASA, localParceiro } from '../../data/types.ts';
import { idsEstornados } from '../../domain/stock.ts';
import { entre, hojeISO, periodoPorChave } from '../../lib/dates.ts';
import { combinaBusca, formatBRL, formatData, formatQtd, formatReais } from '../../lib/format.ts';
import { bloqueioEstornoManual, estornarMovimentoManual } from '../../services/ajustes.ts';
import { Botao, Busca, Cartao, Escolha, Pagina, Segmentado, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { ModalMotivo, executar } from './comum.tsx';
import { EstoqueAbas } from './EstoqueAbas.tsx';
import { nomeLocal } from './ProdutoDetalhe.tsx';

type Periodo = 'mes' | 'mes_anterior' | 'tudo';

const REFERENCIA: Record<string, string> = {
  venda: 'Venda',
  acerto: 'Acerto',
  pedido: 'Pedido',
  producao: 'Produção',
  instalacao: 'Instalação',
  reposicao: 'Reposição',
  recolhimento: 'Recolhimento',
  encerramento: 'Encerramento',
};

/** Link para a origem do lançamento (venda, pedido, acerto). */
function linkReferencia(m: MovEstoque): string | null {
  if (!m.refId) return null;
  if (m.refTipo === 'venda') return `/vendas/${m.refId}`;
  if (m.refTipo === 'pedido') return `/pedidos/${m.refId}`;
  if (m.refTipo === 'acerto') return `/acertos/${m.refId}`;
  return null;
}

export function Movimentacoes({ query }: TelaProps) {
  useDb();
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [tipo, setTipo] = useState<string>('');
  const [produtoId, setProdutoId] = useState<string>(query.get('produto') ?? '');
  const [local, setLocal] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [estornando, setEstornando] = useState<MovEstoque | null>(null);

  const hoje = hojeISO();
  const per = periodo === 'tudo' ? null : periodoPorChave(periodo, hoje);
  const movs = db.all('movEstoque');
  const estornados = idsEstornados(movs);
  const parceiros = db.all('parceiros').filter((p) => !p.arquivado);
  const lista = movs
    .filter((m) => !per || entre(m.data, per.de, per.ate))
    .filter((m) => !tipo || m.tipo === tipo)
    .filter((m) => !produtoId || m.produtoId === produtoId)
    .filter((m) => !local || m.origem === local || m.destino === local)
    .filter((m) => combinaBusca(busca, nomeProduto(m.produtoId), m.motivo, ROTULO_TIPO_MOV[m.tipo]))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));

  const colunas: Coluna<MovEstoque>[] = [
    { id: 'data', rotulo: 'Data', principal: true, render: (m) => `${formatData(m.data)} · ${nomeProduto(m.produtoId)}` },
    {
      id: 'tipo',
      rotulo: 'Tipo',
      render: (m) => (
        <span>
          {ROTULO_TIPO_MOV[m.tipo] ?? m.tipo} {estornados.has(m.id) && <Selo tom="neutro">estornado</Selo>}
        </span>
      ),
    },
    { id: 'de', rotulo: 'De → Para', render: (m) => `${nomeLocal(m.origem)} → ${nomeLocal(m.destino)}` },
    { id: 'qtd', rotulo: 'Qtd.', alinhar: 'dir', render: (m) => <strong>{formatQtd(m.quantidade)}</strong> },
    { id: 'custo', rotulo: 'Custo', alinhar: 'dir', render: (m) => formatReais(m.custoUnit), esconderNoCelular: true },
    { id: 'preco', rotulo: 'Preço', alinhar: 'dir', render: (m) => (m.precoUnitCentavos != null ? formatBRL(m.precoUnitCentavos) : ''), esconderNoCelular: true },
    {
      id: 'motivo',
      rotulo: 'Motivo / origem',
      render: (m) => {
        const link = linkReferencia(m);
        const ref = m.refTipo && REFERENCIA[m.refTipo];
        return (
          <span>
            {m.motivo}
            {m.motivo && ref ? ' · ' : ''}
            {ref && (link ? <a href={`#${link}`}>{ref}</a> : ref)}
          </span>
        );
      },
    },
    {
      id: 'acao',
      rotulo: '',
      alinhar: 'dir',
      render: (m) =>
        bloqueioEstornoManual(m.id) ? null : (
          <Botao pequeno variante="fantasma" onClick={() => setEstornando(m)}>
            Estornar
          </Botao>
        ),
    },
  ];

  const tipos = Object.entries(ROTULO_TIPO_MOV) as [TipoMovEstoque, string][];

  return (
    <Pagina
      titulo="Estoque"
      acoes={
        <Botao variante="primario" icone="editar" href="/estoque/ajuste">
          Ajuste ou perda
        </Botao>
      }
    >
      <EstoqueAbas ativa="movimentacoes" />
      <div class="est-filtros">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar produto ou motivo..." />
        <Escolha value={tipo} onChange={setTipo} opcoes={[{ valor: '', rotulo: 'Todos os tipos' }, ...tipos.map(([v, r]) => ({ valor: v, rotulo: r }))]} />
        <Escolha value={produtoId} onChange={setProdutoId} opcoes={[{ valor: '', rotulo: 'Todos os produtos' }, ...produtosAtivos().map((p) => ({ valor: p.id, rotulo: p.nome }))]} />
        <Escolha value={local} onChange={setLocal} opcoes={[{ valor: '', rotulo: 'Todos os locais' }, { valor: CASA, rotulo: 'Casa' }, ...parceiros.map((p) => ({ valor: localParceiro(p.id), rotulo: p.nome }))]} />
      </div>
      <Segmentado
        value={periodo}
        onChange={setPeriodo}
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'mes_anterior', rotulo: 'Mês anterior' },
          { valor: 'tudo', rotulo: 'Tudo' },
        ]}
      />
      {lista.length === 0 ? (
        movs.length === 0 ? (
          <Vazio icone="repor" titulo="Nenhuma movimentação ainda" texto="Produção, vendas, remessas aos parceiros e ajustes aparecem aqui. O saldo de cada local é a soma destas movimentações." acao={{ rotulo: 'Registrar produção', href: '/producao/nova' }} />
        ) : (
          <Vazio icone="busca" titulo="Nada neste filtro" />
        )
      ) : (
        <Cartao>
          <Tabela colunas={colunas} linhas={lista} chave={(m) => m.id} />
        </Cartao>
      )}
      {estornando && (
        <ModalMotivo
          aberto
          titulo="Estornar esta movimentação?"
          rotuloConfirmar="Estornar"
          perigo
          onFechar={() => setEstornando(null)}
          onConfirmar={(motivo) => executar(() => estornarMovimentoManual(estornando.id, motivo), 'Movimentação estornada')}
        >
          <p>
            {ROTULO_TIPO_MOV[estornando.tipo]} de {formatQtd(estornando.quantidade)} {nomeProduto(estornando.produtoId)} em {formatData(estornando.data)} (
            {nomeLocal(estornando.origem)} → {nomeLocal(estornando.destino)}). Será lançado o movimento inverso; o original continua no histórico.
          </p>
        </ModalMotivo>
      )}
    </Pagina>
  );
}
