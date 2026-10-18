// "Pedidos" (9.3): no computador, Kanban com colunas por etapa (arrastar para avançar);
// no celular, lista agrupada por etapa com botão "Avançar".
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_ETAPA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeCliente } from '../../data/selectors.ts';
import type { EtapaPedido, Pedido } from '../../data/types.ts';
import { ETAPAS_FLUXO, alertasPedido, numeroPedido, pedidosPorEtapa, proximaEtapa, situacaoFinanceira } from '../../domain/pedidos.ts';
import { hojeISO } from '../../lib/dates.ts';
import { combinaBusca, formatBRL, formatData } from '../../lib/format.ts';
import { Botao, Busca, Chave, Pagina, Selo, Vazio, avisar } from '../../ui/index.ts';
import { ModalEtapa } from './comum.tsx';

/** Quantos pedidos entregues/cancelados mostrar (os mais recentes). */
const RECENTES = 8;

function CartaoPedido({ p, onAvancar, arrastavel }: { p: Pedido; onAvancar: (p: Pedido) => void; arrastavel?: boolean }) {
  const pags = db.all('pagamentos');
  const fin = situacaoFinanceira(p, pags);
  const alertas = alertasPedido(p, pags, hojeISO());
  const prox = proximaEtapa(p.etapa);
  return (
    <div
      class="ped-cartao"
      draggable={arrastavel && !!prox}
      onDragStart={(e) => e.dataTransfer?.setData('text/plain', p.id)}
    >
      <a href={`#/pedidos/${p.id}`}>
        <div class="ped-cartao-topo">
          <span class="ped-numero">{numeroPedido(p.numero)}</span>
          <strong>{formatBRL(p.totalCentavos)}</strong>
        </div>
        <div class="ped-titulo">{p.titulo}</div>
        <div class="ped-meta">
          <span>{nomeCliente(p.clienteId)}</span>
          {p.prazo && <span>prazo {formatData(p.prazo)}</span>}
          {fin.saldoCentavos > 0 && p.etapa !== 'orcamento' && <span class="txt-atencao">falta {formatBRL(fin.saldoCentavos)}</span>}
        </div>
      </a>
      {alertas.length > 0 && (
        <div class="ped-alertas">
          {alertas.map((a) => (
            <Selo key={a.tipo} tom={a.tom}>
              {a.texto}
            </Selo>
          ))}
        </div>
      )}
      {prox && (
        <Botao pequeno variante="secundario" icone="seta" onClick={() => onAvancar(p)}>
          Avançar: {ROTULO_ETAPA[prox]}
        </Botao>
      )}
    </div>
  );
}

export function Pedidos(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [verCancelados, setVerCancelados] = useState(false);
  const [mover, setMover] = useState<{ pedido: Pedido; destino: EtapaPedido } | null>(null);
  const [alvo, setAlvo] = useState<EtapaPedido | null>(null);

  const todos = db.all('pedidos').filter((p) => combinaBusca(busca, numeroPedido(p.numero), p.titulo, nomeCliente(p.clienteId)));
  const grupos = pedidosPorEtapa(todos);
  const recentes = (lista: Pedido[], campo: 'entregueEm' | 'canceladoEm') =>
    lista.slice().sort((a, b) => (b[campo] ?? '').localeCompare(a[campo] ?? '')).slice(0, RECENTES);
  const colunas: { etapa: EtapaPedido; pedidos: Pedido[] }[] = [
    ...ETAPAS_FLUXO.map((etapa) => ({ etapa, pedidos: etapa === 'entregue' ? recentes(grupos.entregue, 'entregueEm') : grupos[etapa] })),
  ];
  const avancar = (p: Pedido) => {
    const prox = proximaEtapa(p.etapa);
    if (prox) setMover({ pedido: p, destino: prox });
  };
  const soltar = (etapa: EtapaPedido, id: string) => {
    setAlvo(null);
    const p = db.get('pedidos', id);
    if (!p || p.etapa === etapa) return;
    if (ETAPAS_FLUXO.indexOf(etapa) < ETAPAS_FLUXO.indexOf(p.etapa)) return avisar('O pedido só avança. Para desistir, cancele o pedido.', 'atencao');
    setMover({ pedido: p, destino: etapa });
  };
  const vazio = db.all('pedidos').length === 0;

  return (
    <Pagina
      titulo="Pedidos"
      largura="larga"
      acoes={
        <Botao variante="primario" icone="plus" href="/pedidos/novo">
          Novo pedido
        </Botao>
      }
    >
      {vazio ? (
        <Vazio
          icone="pedidos"
          titulo="Nenhum pedido ainda"
          texto="Pedidos personalizados: o cliente pede algo sob medida, recebe o orçamento, paga o sinal e depois o saldo."
          acao={{ rotulo: 'Criar o primeiro pedido', href: '/pedidos/novo' }}
        />
      ) : (
        <>
          <div class="est-filtros">
            <Busca value={busca} onInput={setBusca} placeholder="Buscar por número, título ou cliente..." />
            <span />
            <span />
            <Chave checked={verCancelados} onChange={setVerCancelados}>
              Cancelados ({grupos.cancelado.length})
            </Chave>
          </div>

          <div class="kanban">
            {colunas.map((c) => (
              <div
                key={c.etapa}
                class={`kanban-coluna ${alvo === c.etapa ? 'alvo' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(c.etapa);
                }}
                onDragLeave={() => setAlvo(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer?.getData('text/plain');
                  if (id) soltar(c.etapa, id);
                }}
              >
                <div class="kanban-titulo">
                  <span>{ROTULO_ETAPA[c.etapa]}</span>
                  <Selo>{grupos[c.etapa].length}</Selo>
                </div>
                {c.pedidos.map((p) => (
                  <CartaoPedido key={p.id} p={p} onAvancar={avancar} arrastavel />
                ))}
                {c.etapa === 'entregue' && grupos.entregue.length > RECENTES && <small class="muted">e mais {grupos.entregue.length - RECENTES} entregues</small>}
              </div>
            ))}
          </div>

          <div class="ped-grupos">
            {colunas
              .filter((c) => c.pedidos.length)
              .map((c) => (
                <section key={c.etapa} class="secao">
                  <div class="secao-topo">
                    <h3 class="secao-titulo">
                      {ROTULO_ETAPA[c.etapa]} ({grupos[c.etapa].length})
                    </h3>
                  </div>
                  {c.pedidos.map((p) => (
                    <CartaoPedido key={p.id} p={p} onAvancar={avancar} />
                  ))}
                </section>
              ))}
          </div>

          {verCancelados && (
            <section class="secao">
              <h3 class="secao-titulo">Cancelados</h3>
              {recentes(grupos.cancelado, 'canceladoEm').map((p) => (
                <CartaoPedido key={p.id} p={p} onAvancar={avancar} />
              ))}
              {grupos.cancelado.length === 0 && <p class="muted">Nenhum pedido cancelado.</p>}
            </section>
          )}
        </>
      )}
      {mover && <ModalEtapa pedido={mover.pedido} destino={mover.destino} onFechar={() => setMover(null)} />}
    </Pagina>
  );
}
