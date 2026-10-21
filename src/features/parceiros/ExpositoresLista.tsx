// "Expositores" (8.2): patrimônio do dono, onde está, estado e retorno do investimento.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Expositor } from '../../data/types.ts';
import { retornoExpositor } from '../../domain/desempenho.ts';
import { combinaBusca, formatBRL, formatPct } from '../../lib/format.ts';
import { Botao, Busca, Cartao, Chave, Pagina, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';

const TOM_ESTADO = { ok: 'ok', danificado: 'atencao', perdido: 'ruim' } as const;
const ROTULO_ESTADO = { ok: 'Ok', danificado: 'Danificado', perdido: 'Perdido' } as const;

export function SeloEstado({ e }: { e: Expositor }) {
  return <Selo tom={TOM_ESTADO[e.estado]}>{ROTULO_ESTADO[e.estado]}</Selo>;
}

export function ExpositoresLista(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [arquivados, setArquivados] = useState(false);
  const todos = db.all('expositores');
  const lista = todos
    .filter((e) => (arquivados ? e.arquivado : !e.arquivado))
    .filter((e) => combinaBusca(busca, e.codigo, e.modelo, e.parceiroId ? db.get('parceiros', e.parceiroId)?.nome : 'Casa'))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));

  const colunas: Coluna<Expositor>[] = [
    { id: 'codigo', rotulo: 'Código', principal: true, render: (e) => `${e.codigo} · ${e.modelo || 'Expositor'}` },
    { id: 'onde', rotulo: 'Onde está', render: (e) => (e.parceiroId ? db.get('parceiros', e.parceiroId)?.nome ?? 'Parceiro' : 'Casa') },
    { id: 'cap', rotulo: 'Capacidade', alinhar: 'dir', render: (e) => (e.capacidade ? `${e.capacidade} vagas` : '—'), esconderNoCelular: true },
    { id: 'custo', rotulo: 'Custo', alinhar: 'dir', render: (e) => formatBRL(e.custoCentavos) },
    {
      id: 'retorno',
      rotulo: 'Retorno',
      alinhar: 'dir',
      render: (e) => {
        if (!e.parceiroId) return '—';
        const r = retornoExpositor(e.parceiroId, db.all('acertos'), [e]);
        return r.retorno != null ? formatPct(r.retorno * 100, 0) : '—';
      },
    },
    { id: 'estado', rotulo: 'Estado', render: (e) => <SeloEstado e={e} /> },
  ];

  return (
    <Pagina
      titulo="Expositores"
      voltarPara="/parceiros"
      acoes={
        <Botao variante="primario" icone="plus" href="/parceiros/expositores/novo">
          Novo expositor
        </Botao>
      }
    >
      <div class="est-filtros">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar expositor..." />
        <span />
        <span />
        <Chave checked={arquivados} onChange={setArquivados}>
          Arquivados
        </Chave>
      </div>
      {lista.length === 0 ? (
        todos.length === 0 ? (
          <Vazio icone="estoque" titulo="Nenhum expositor cadastrado" texto="O expositor é seu patrimônio: cadastre o custo para ver em quanto tempo ele se paga em cada parceiro." acao={{ rotulo: 'Cadastrar expositor', href: '/parceiros/expositores/novo' }} />
        ) : (
          <Vazio icone="busca" titulo="Nada encontrado" />
        )
      ) : (
        <Cartao>
          <Tabela colunas={colunas} linhas={lista} chave={(e) => e.id} onClickLinha={(e) => navegar(`/parceiros/expositores/${e.id}`)} />
        </Cartao>
      )}
      <p class="muted">Retorno = lucro acumulado no parceiro ÷ custo do expositor (100% = o expositor já se pagou).</p>
    </Pagina>
  );
}
