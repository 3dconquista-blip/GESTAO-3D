// "O que imprimir" (7.5): do mais urgente ao menos urgente, com mesas, tempo e filamento necessário.
// necessidade = estoque mínimo em Casa + reposição prevista nos parceiros + reservado em pedidos − saldo em Casa.
import type { TelaProps } from '../../app/router.ts';
import { ROTULO_ETAPA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeCliente, nomeMaterial } from '../../data/selectors.ts';
import type { ItemImprimir } from '../../domain/oQueImprimir.ts';
import { formatData, formatDuracao, formatGramas, formatQtd } from '../../lib/format.ts';
import { diffDias, hojeISO } from '../../lib/dates.ts';
import { oQueImprimirAtual } from '../../services/consultas.ts';
import { Aviso, Botao, Cartao, ItemLista, Lista, Pagina, Selo, Vazio } from '../../ui/index.ts';
import { EstoqueAbas } from './EstoqueAbas.tsx';
import { FotoProduto } from './ProdutosLista.tsx';

const URGENCIA: Record<ItemImprimir['urgencia'], { texto: string; tom: 'ruim' | 'atencao' | 'info' }> = {
  pedidos: { texto: 'Falta para pedido', tom: 'ruim' },
  sem_estoque: { texto: 'Sem estoque em Casa', tom: 'ruim' },
  abaixo_minimo: { texto: 'Abaixo do mínimo', tom: 'atencao' },
  reposicao: { texto: 'Reposição dos parceiros', tom: 'info' },
};

function CartaoItem({ item }: { item: ItemImprimir }) {
  const u = URGENCIA[item.urgencia];
  const p = item.produto;
  return (
    <Cartao tom={u.tom === 'info' ? undefined : u.tom === 'ruim' ? 'ruim' : 'atencao'}>
      <div class="imp-item">
        <div class="imp-topo">
          <span class="est-nome">
            <FotoProduto p={p} tamanho={44} />
            <span class="est-nome-textos">
              <strong>{p.nome}</strong>
              <small>{item.motivo}</small>
            </span>
          </span>
          <div class="imp-necessidade">
            <span>Imprimir</span>
            <strong>{formatQtd(item.necessidade)}</strong>
          </div>
        </div>
        <div class="imp-detalhes">
          <Selo tom={u.tom}>{u.texto}</Selo>
          <span>
            Em Casa: <strong>{formatQtd(item.saldoCasa)}</strong> · mínimo {formatQtd(item.estoqueMinimo)}
          </span>
          {item.reposicaoPrevista > 0 && <span>Parceiros: {formatQtd(item.reposicaoPrevista, 1)}</span>}
          {item.reservado > 0 && <span>Pedidos: {formatQtd(item.reservado)}</span>}
        </div>
        <div class="imp-mesas">
          {item.mesas.map((m, i) => (
            <span key={m.mesaId}>
              {item.mesas.length > 1 ? `Mesa ${i + 1}: ` : ''}
              <strong>
                {m.mesas} mesa(s) de {m.pecasPorMesa}
              </strong>{' '}
              · {formatDuracao(m.tempoMin)}
            </span>
          ))}
          <span>
            Tempo total: <strong>{formatDuracao(item.tempoTotalMin)}</strong>
          </span>
        </div>
        <div class="imp-filamentos">
          {item.filamentoNecessario.map((f) => (
            <span key={f.tipo} class={f.suficiente ? '' : 'txt-ruim'}>
              {f.tipo}: {formatGramas(f.gramas)} {f.suficiente ? `(tem ${formatGramas(f.saldo)} somando as cores)` : `— falta filamento (tem ${formatGramas(f.saldo)} somando as cores)`}
            </span>
          ))}
        </div>
        <div>
          <Botao pequeno variante="secundario" icone="impressora" href={`/producao/nova?produto=${p.id}&mesas=${item.mesas[0]?.mesas ?? 1}`}>
            Registrar produção
          </Botao>
        </div>
      </div>
    </Cartao>
  );
}

export function OQueImprimir(_props: TelaProps) {
  useDb();
  const lista = oQueImprimirAtual();
  const faltas = lista.filamentos.filter((f) => f.faltaG > 0);
  const hoje = hojeISO();
  return (
    <Pagina
      titulo="Estoque"
      acoes={
        <Botao variante="primario" icone="impressora" href="/producao/nova">
          Registrar produção
        </Botao>
      }
    >
      <EstoqueAbas ativa="imprimir" />
      <p class="muted imp-explica">
        Imprimir = estoque mínimo em Casa + reposição prevista nos parceiros (média dos últimos 3 acertos) + pedidos aprovados − o que já está em Casa.
      </p>
      {faltas.length > 0 && (
        <Aviso tom="ruim" titulo="Filamento não dá para tudo">
          {faltas.map((f) => (
            <div key={f.tipo}>
              {f.nome}: precisa de {formatGramas(f.necessarioG)}, tem {formatGramas(f.saldoG)} (faltam {formatGramas(f.faltaG)}). <a href="#/compra">Compra de material</a>
            </div>
          ))}
        </Aviso>
      )}
      {lista.itens.length === 0 ? (
        <Vazio icone="check" titulo="Nada para imprimir agora" texto="O estoque em Casa cobre o mínimo, a reposição prevista dos parceiros e os pedidos aprovados. Ajuste o estoque mínimo de cada produto se quiser manter mais peças em Casa." />
      ) : (
        <div class="pilha pilha-m">
          {lista.itens.map((it) => (
            <CartaoItem key={it.produtoId} item={it} />
          ))}
        </div>
      )}
      <Cartao titulo="Pedidos personalizados para produzir">
        {lista.pedidos.length === 0 ? (
          <p class="muted">Nenhum pedido em produção.</p>
        ) : (
          <Lista>
            {lista.pedidos.map((p) => {
              const dias = p.prazo ? diffDias(hoje, p.prazo) : null;
              return (
                <ItemLista
                  key={p.id}
                  icone="pedidos"
                  titulo={`#${String(p.numero).padStart(4, '0')} — ${p.titulo}`}
                  subtitulo={`${nomeCliente(p.clienteId)} · ${ROTULO_ETAPA[p.etapa]}`}
                  direita={p.prazo ? <Selo tom={dias! < 0 ? 'ruim' : dias! <= 2 ? 'atencao' : 'ok'}>{formatData(p.prazo)}</Selo> : 'Sem prazo'}
                  href={`/pedidos/${p.id}`}
                />
              );
            })}
          </Lista>
        )}
      </Cartao>
    </Pagina>
  );
}
