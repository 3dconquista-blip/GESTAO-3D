// "Parceiros": lista com busca e filtro de situação.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Parceiro } from '../../data/types.ts';
import { rotuloDivisao } from '../../domain/termo.ts';
import { combinaBusca, formatBRL, formatQtd } from '../../lib/format.ts';
import { pendenciasDoParceiro } from '../../services/acertos.ts';
import { pecasNosExpositores } from '../../services/consultas.ts';
import { Botao, Busca, Cartao, Pagina, Segmentado, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { ParceirosAbas, SeloSituacao, descricaoParceiro } from './comum.tsx';

type Filtro = 'ativos' | 'pausados' | 'encerrados' | 'arquivados';

export function ParceirosLista(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativos');
  const todos = db.all('parceiros');
  const pecas = pecasNosExpositores();
  const lista = todos
    .filter((p) =>
      filtro === 'arquivados' ? p.arquivado : !p.arquivado && (filtro === 'ativos' ? p.situacao === 'ativo' : filtro === 'pausados' ? p.situacao === 'pausado' : p.situacao === 'encerrado'),
    )
    .filter((p) => combinaBusca(busca, p.nome, p.bairro, p.responsavel))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const colunas: Coluna<Parceiro>[] = [
    {
      id: 'nome',
      rotulo: 'Parceiro',
      principal: true,
      render: (p) => (
        <span class="est-nome-textos">
          <strong>{p.nome}</strong>
          <small>{descricaoParceiro(p)}</small>
        </span>
      ),
    },
    { id: 'divisao', rotulo: 'Divisão', render: (p) => rotuloDivisao(p.pctParceiro) },
    { id: 'freq', rotulo: 'Acerto', render: (p) => `${p.frequenciaDias} dias`, esconderNoCelular: true },
    { id: 'pecas', rotulo: 'No expositor', alinhar: 'dir', render: (p) => formatQtd(pecas[p.id] ?? 0) },
    {
      id: 'receber',
      rotulo: 'A receber',
      alinhar: 'dir',
      render: (p) => {
        const v = pendenciasDoParceiro(p.id).saldo?.aReceber ?? 0;
        return v ? <span class="txt-ruim negrito">{formatBRL(v)}</span> : '—';
      },
    },
    { id: 'situacao', rotulo: 'Situação', render: (p) => <SeloSituacao p={p} /> },
  ];

  return (
    <Pagina
      titulo="Parceiros"
      acoes={
        <Botao variante="primario" icone="plus" href="/parceiros/novo">
          Novo parceiro
        </Botao>
      }
    >
      <ParceirosAbas ativa="lista" />
      <Busca value={busca} onInput={setBusca} placeholder="Buscar parceiro, bairro ou responsável..." />
      <Segmentado
        value={filtro}
        onChange={setFiltro}
        opcoes={[
          { valor: 'ativos', rotulo: 'Ativos' },
          { valor: 'pausados', rotulo: 'Pausados' },
          { valor: 'encerrados', rotulo: 'Encerrados' },
          { valor: 'arquivados', rotulo: 'Arquivados' },
        ]}
      />
      {lista.length === 0 ? (
        todos.length === 0 ? (
          <Vazio
            icone="parceiros"
            titulo="Nenhum parceiro cadastrado"
            texto="Parceiros são academias, lojas e outros lugares onde você deixa um expositor com seus produtos e divide o que vender."
            acao={{ rotulo: 'Cadastrar o primeiro parceiro', href: '/parceiros/novo' }}
          />
        ) : (
          <Vazio icone="busca" titulo="Nenhum parceiro neste filtro" />
        )
      ) : (
        <Cartao>
          <Tabela colunas={colunas} linhas={lista} chave={(p) => p.id} onClickLinha={(p) => navegar(`/parceiros/${p.id}`)} />
        </Cartao>
      )}
    </Pagina>
  );
}
