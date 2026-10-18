// "Clientes" (9.1): lista com busca.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Cliente } from '../../data/types.ts';
import { formatarTelefone } from '../../domain/termo.ts';
import { combinaBusca, formatBRL, formatData } from '../../lib/format.ts';
import { estatisticasCliente } from '../../services/clientes.ts';
import { Botao, Busca, Cartao, Chave, Pagina, Tabela, Vazio, type Coluna } from '../../ui/index.ts';

export function ClientesLista(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [arquivados, setArquivados] = useState(false);
  const todos = db.all('clientes');
  const lista = todos
    .filter((c) => (arquivados ? c.arquivado : !c.arquivado))
    .filter((c) => combinaBusca(busca, c.nome, c.whatsapp, c.instagram, c.cidade, c.bairro))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const colunas: Coluna<Cliente>[] = [
    {
      id: 'nome',
      rotulo: 'Cliente',
      principal: true,
      render: (c) => (
        <span class="est-nome-textos">
          <strong>{c.nome}</strong>
          <small>{[c.cidade, c.bairro].filter(Boolean).join(' · ') || (c.instagram ? `@${c.instagram.replace(/^@/, '')}` : '')}</small>
        </span>
      ),
    },
    { id: 'whats', rotulo: 'WhatsApp', render: (c) => formatarTelefone(c.whatsapp) || '—' },
    { id: 'pedidos', rotulo: 'Pedidos', alinhar: 'dir', render: (c) => String(estatisticasCliente(c.id).pedidos) },
    { id: 'total', rotulo: 'Total gasto', alinhar: 'dir', render: (c) => formatBRL(estatisticasCliente(c.id).totalGastoCentavos) },
    { id: 'ultima', rotulo: 'Última compra', render: (c) => formatData(estatisticasCliente(c.id).ultimaCompra), esconderNoCelular: true },
  ];

  return (
    <Pagina
      titulo="Clientes"
      voltarPara="/mais"
      acoes={
        <Botao variante="primario" icone="plus" href="/clientes/novo">
          Novo cliente
        </Botao>
      }
    >
      <div class="est-filtros">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar por nome, WhatsApp, cidade..." />
        <span />
        <span />
        <Chave checked={arquivados} onChange={setArquivados}>
          Arquivados
        </Chave>
      </div>
      {lista.length === 0 ? (
        todos.length === 0 ? (
          <Vazio icone="usuario" titulo="Nenhum cliente cadastrado" texto="Só o nome é obrigatório. Na venda rápida dá para vender sem cadastro (cliente avulso)." acao={{ rotulo: 'Cadastrar cliente', href: '/clientes/novo' }} />
        ) : (
          <Vazio icone="busca" titulo="Nenhum cliente encontrado" />
        )
      ) : (
        <Cartao>
          <Tabela colunas={colunas} linhas={lista} chave={(c) => c.id} onClickLinha={(c) => navegar(`/clientes/${c.id}`)} />
        </Cartao>
      )}
    </Pagina>
  );
}
