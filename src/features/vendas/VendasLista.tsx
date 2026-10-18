// "Vendas": histórico das vendas diretas (venda rápida).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA, ROTULO_FORMA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeCliente, nomeProduto } from '../../data/selectors.ts';
import type { Venda } from '../../data/types.ts';
import { entre, hojeISO, periodoPorChave } from '../../lib/dates.ts';
import { combinaBusca, formatBRL, formatData } from '../../lib/format.ts';
import { Botao, Busca, Cartao, Indicador, Pagina, Segmentado, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import './vendas.css';

type Filtro = 'mes' | 'mes_anterior' | 'tudo';

export function resumoItens(v: Venda): string {
  return v.itens.map((i) => `${i.quantidade}× ${nomeProduto(i.produtoId)}`).join(', ');
}

export function VendasLista(_props: TelaProps) {
  useDb();
  const [filtro, setFiltro] = useState<Filtro>('mes');
  const [busca, setBusca] = useState('');
  const hoje = hojeISO();
  const periodo = filtro === 'tudo' ? null : periodoPorChave(filtro, hoje);
  const todas = db.all('vendas');
  const lista = todas
    .filter((v) => !periodo || entre(v.data, periodo.de, periodo.ate))
    .filter((v) => combinaBusca(busca, resumoItens(v), nomeCliente(v.clienteId)))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const validas = lista.filter((v) => !v.cancelada);
  const total = validas.reduce((s, v) => s + v.totalCentavos, 0);
  const lucro = validas.reduce((s, v) => s + v.lucroCentavos, 0);

  const colunas: Coluna<Venda>[] = [
    { id: 'data', rotulo: 'Data', principal: true, render: (v) => <span class={v.cancelada ? 'venda-cancelada' : ''}>{formatData(v.data)}</span> },
    { id: 'itens', rotulo: 'Itens', render: (v) => resumoItens(v) },
    { id: 'cliente', rotulo: 'Cliente', render: (v) => nomeCliente(v.clienteId), esconderNoCelular: true },
    { id: 'forma', rotulo: 'Pagamento', render: (v) => `${ROTULO_FORMA[v.formaPagamento]} · ${ROTULO_CANAL_VENDA[v.canal]}` },
    { id: 'total', rotulo: 'Total', alinhar: 'dir', render: (v) => (v.cancelada ? <Selo tom="ruim">Cancelada</Selo> : <strong>{formatBRL(v.totalCentavos)}</strong>) },
    { id: 'lucro', rotulo: 'Lucro', alinhar: 'dir', render: (v) => (v.cancelada ? '—' : formatBRL(v.lucroCentavos)) },
  ];

  return (
    <Pagina
      titulo="Vendas"
      voltarPara="/mais"
      acoes={
        <Botao variante="primario" icone="carrinho" href="/venda">
          Venda rápida
        </Botao>
      }
    >
      <Segmentado
        value={filtro}
        onChange={setFiltro}
        opcoes={[
          { valor: 'mes', rotulo: 'Este mês' },
          { valor: 'mes_anterior', rotulo: 'Mês anterior' },
          { valor: 'tudo', rotulo: 'Tudo' },
        ]}
      />
      <div class="indicadores">
        <Indicador rotulo="Vendas" valor={String(validas.length)} />
        <Indicador rotulo="Total vendido" valor={formatBRL(total)} />
        <Indicador rotulo="Lucro estimado" valor={formatBRL(lucro)} tom={lucro < 0 ? 'ruim' : undefined} />
      </div>
      <Busca value={busca} onInput={setBusca} placeholder="Buscar por produto ou cliente..." />
      {lista.length === 0 ? (
        todas.length === 0 ? (
          <Vazio icone="carrinho" titulo="Nenhuma venda ainda" texto="As vendas diretas (WhatsApp, Instagram, presencial e feiras) aparecem aqui." acao={{ rotulo: 'Fazer uma venda rápida', href: '/venda' }} />
        ) : (
          <Vazio icone="busca" titulo="Nenhuma venda neste filtro" />
        )
      ) : (
        <Cartao>
          <Tabela colunas={colunas} linhas={lista} chave={(v) => v.id} onClickLinha={(v) => navegar(`/vendas/${v.id}`)} />
        </Cartao>
      )}
    </Pagina>
  );
}
