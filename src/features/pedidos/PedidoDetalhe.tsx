// Detalhe do pedido (9.2/9.3): itens, orçamento, pagamentos, checklist, mensagens e histórico.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA, ROTULO_ETAPA, ROTULO_FORMA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeCliente, saldoCasa } from '../../data/selectors.ts';
import type { EtapaPedido, Pagamento } from '../../data/types.ts';
import { mensagemLembreteSaldo, mensagemOrcamento, mensagemPedidoPronto, mensagemPosVenda, mensagemSinalRecebido } from '../../domain/mensagensPedido.ts';
import { ETAPAS_FLUXO, ROTULO_CHECKLIST, alertasPedido, faltasCatalogo, numeroPedido, orcamentoDoPedido, pagamentosDoPedido, proximaEtapa, resultadoPedido, situacaoFinanceira } from '../../domain/pedidos.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatDataHora, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { atualizarChecklist, duplicarOrcamento, estornarPagamentoPedido } from '../../services/pedidos.ts';
import { Aviso, Botao, Cartao, Grade, Indicador, Linha, Marcador, Pagina, Resumo, Tabela, Vazio, avisar, confirmar, copiarTexto, type Coluna } from '../../ui/index.ts';
import { ModalMotivo, executar } from '../estoque/comum.tsx';
import { BotaoWhatsApp } from '../parceiros/comum.tsx';
import { ModalEtapa, ModalPagamento, SeloEtapa } from './comum.tsx';

type ChaveMsg = 'orcamento' | 'sinal' | 'pronto' | 'lembrete' | 'posvenda';
const ROTULO_MSG: Record<ChaveMsg, string> = { orcamento: 'Orçamento', sinal: 'Sinal recebido', pronto: 'Pedido pronto', lembrete: 'Lembrete de saldo', posvenda: 'Pós-venda' };
const MSG_DA_ETAPA: Record<EtapaPedido, ChaveMsg> = { orcamento: 'orcamento', aprovado: 'sinal', producao: 'sinal', pronto: 'pronto', entregue: 'posvenda', cancelado: 'orcamento' };
const ROTULO_TIPO_PAG: Record<string, string> = { sinal: 'Sinal', parcela: 'Parcela', saldo: 'Saldo', devolucao: 'Devolução' };

export function PedidoDetalhe({ params }: TelaProps) {
  useDb();
  const [mover, setMover] = useState<EtapaPedido | null>(null);
  const [pagando, setPagando] = useState(false);
  const [estornando, setEstornando] = useState<Pagamento | null>(null);
  const p = db.get('pedidos', params.id);
  const [msg, setMsg] = useState<ChaveMsg>(() => (p ? MSG_DA_ETAPA[p.etapa] : 'orcamento'));
  if (!p) {
    return (
      <div class="pagina">
        <Vazio titulo="Pedido não encontrado" acao={{ rotulo: 'Ver pedidos', href: '/pedidos' }} />
      </div>
    );
  }
  const cliente = db.get('clientes', p.clienteId);
  const pags = db.all('pagamentos');
  const fin = situacaoFinanceira(p, pags);
  const orc = orcamentoDoPedido(p);
  const res = resultadoPedido(p, pags);
  const alertas = alertasPedido(p, pags, hojeISO());
  const prox = proximaEtapa(p.etapa);
  const final = p.etapa === 'entregue' || p.etapa === 'cancelado';
  const faltas = p.catalogoBaixado ? [] : faltasCatalogo(p, db.all('pedidos'), saldoCasa).filter((f) => f.faltam > 0);
  const pagamentos = db
    .all('pagamentos')
    .filter((x) => x.origem === 'pedido' && x.refId === p.id)
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
  const validos = new Set(pagamentosDoPedido(p.id, pags).map((x) => x.id));

  const textos: Record<ChaveMsg, string | null> = {
    orcamento: mensagemOrcamento(p, cliente, db.config),
    sinal: mensagemSinalRecebido(p, cliente, db.config, pags),
    pronto: mensagemPedidoPronto(p, cliente, db.config, pags),
    lembrete: mensagemLembreteSaldo(p, cliente, db.config, pags),
    posvenda: mensagemPosVenda(p, cliente, db.config),
  };
  const texto = textos[msg];

  const colPag: Coluna<Pagamento>[] = [
    { id: 'data', rotulo: 'Data', principal: true, render: (x) => formatData(x.data) },
    { id: 'tipo', rotulo: 'Tipo', render: (x) => (x.estornoDe ? 'Estorno' : ROTULO_TIPO_PAG[x.tipo ?? ''] ?? 'Pagamento') },
    { id: 'forma', rotulo: 'Forma', render: (x) => `${ROTULO_FORMA[x.forma]}${x.taxaCentavos && !x.estornoDe ? ` (taxa ${formatBRL(x.taxaCentavos)})` : ''}` },
    { id: 'valor', rotulo: 'Valor', alinhar: 'dir', render: (x) => <span class={x.direcao === 'pago' ? 'txt-ruim' : ''}>{x.direcao === 'pago' ? '−' : ''}{formatBRL(x.valorCentavos)}</span> },
    {
      id: 'acao',
      rotulo: '',
      alinhar: 'dir',
      render: (x) =>
        validos.has(x.id) && x.direcao === 'recebido' ? (
          <Botao pequeno variante="fantasma" onClick={() => setEstornando(x)}>
            Estornar
          </Botao>
        ) : !validos.has(x.id) && !x.estornoDe ? (
          <small class="muted">estornado</small>
        ) : null,
    },
  ];

  const duplicar = async () => {
    if (!(await confirmar({ titulo: 'Duplicar este orçamento?', itens: ['Cria um orçamento novo com os mesmos itens, recalculado com os custos atuais.'] }))) return;
    try {
      const novo = duplicarOrcamento(p.id);
      avisar(`Orçamento ${numeroPedido(novo.numero)} criado`);
      navegar(`/pedidos/${novo.id}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina
      titulo={`${numeroPedido(p.numero)} — ${p.titulo}`}
      subtitulo={`${nomeCliente(p.clienteId)} · ${ROTULO_CANAL_VENDA[p.canalOrigem] ?? p.canalOrigem}`}
      voltarPara="/pedidos"
      acoes={
        prox ? (
          <Botao variante="primario" icone="seta" onClick={() => setMover(prox)}>
            Avançar: {ROTULO_ETAPA[prox]}
          </Botao>
        ) : undefined
      }
    >
      <Linha>
        <SeloEtapa etapa={p.etapa} />
        {p.etapa === 'orcamento' && <small class="muted">Orçamento válido até {formatData(p.validade)}</small>}
      </Linha>
      {p.etapa === 'cancelado' ? (
        <Aviso tom="neutro" titulo={`Cancelado em ${formatData(p.canceladoEm)}`}>
          {p.motivoCancelamento}
        </Aviso>
      ) : (
        <div class="ped-etapas">
          {ETAPAS_FLUXO.map((e, i) => {
            const atual = ETAPAS_FLUXO.indexOf(p.etapa);
            return (
              <div key={e} class={`ped-etapa ${i < atual ? 'feita' : i === atual ? 'atual' : ''}`}>
                {ROTULO_ETAPA[e]}
              </div>
            );
          })}
        </div>
      )}
      {alertas.map((a) => (
        <Aviso key={a.tipo} tom={a.tom}>
          {a.texto}
        </Aviso>
      ))}
      {faltas.map((f) => (
        <Aviso key={f.produtoId} tom="atencao">
          {f.descricao}: faltam {f.faltam} unidade(s) em Casa. A diferença está em "O que imprimir".
        </Aviso>
      ))}

      <div class="indicadores">
        <Indicador rotulo="Total" valor={formatBRL(p.totalCentavos)} detalhe={p.totalCentavos !== p.totalCalculadoCentavos ? `calculado ${formatBRL(p.totalCalculadoCentavos)}` : undefined} />
        <Indicador rotulo="Pago" valor={formatBRL(fin.pagoCentavos)} detalhe={fin.creditoCentavos ? `crédito ${formatBRL(fin.creditoCentavos)}` : undefined} />
        <Indicador rotulo={p.etapa === 'entregue' ? 'A receber' : 'Falta pagar'} valor={formatBRL(fin.saldoCentavos)} tom={fin.saldoCentavos && p.etapa === 'entregue' ? 'ruim' : undefined} />
        <Indicador rotulo="Lucro" valor={formatBRL(res.lucroCentavos)} detalhe={Number.isFinite(res.margemPct) ? `${formatPct(res.margemPct)} do total` : undefined} tom={res.lucroCentavos < 0 ? 'ruim' : undefined} />
      </div>

      <Grade colunas={2}>
        <Cartao titulo="Itens">
          {p.itens.map((i) => (
            <div key={i.id} class="resumo-linha">
              <dt>
                {formatQtd(i.quantidade)} × {i.descricao} <small>({i.tipo === 'catalogo' ? 'catálogo' : 'personalizada'})</small>
              </dt>
              <dd>{formatReais(i.custoTotal)}</dd>
            </div>
          ))}
          <Resumo
            linhas={[
              { rotulo: 'Custo de produção', valor: formatReais(orc.custoProducao, 4) },
              { rotulo: `Preço de produção (margem ${formatQtd(p.margemPct)}%)`, valor: formatReais(orc.precoProducao, 4) },
              orc.modelagem ? { rotulo: `Modelagem (${formatQtd(p.horasModelagem, 2)} h)`, valor: formatReais(orc.modelagem, 4) } : null,
              { rotulo: 'Subtotal', valor: formatReais(orc.subtotal, 4) },
              p.urgente ? { rotulo: `Urgência`, valor: `+${formatQtd(p.urgenciaPct)}%` } : null,
              p.descontoPct ? { rotulo: 'Desconto', valor: `−${formatQtd(p.descontoPct)}%` } : null,
              p.entrega.freteCentavos ? { rotulo: 'Frete', valor: formatBRL(p.entrega.freteCentavos) } : null,
              { rotulo: 'Total', valor: formatBRL(p.totalCentavos), destaque: true },
              { rotulo: `Sinal (${formatQtd(p.sinalPct)}%)`, valor: formatBRL(p.sinalCentavos) },
            ]}
          />
        </Cartao>

        <Cartao titulo="Pagamentos" acoes={p.etapa !== 'cancelado' ? <Botao pequeno icone="plus" onClick={() => setPagando(true)}>Registrar</Botao> : undefined}>
          <Tabela colunas={colPag} linhas={pagamentos} chave={(x) => x.id} vazio={<p class="muted">Nenhum pagamento ainda.</p>} />
          {p.sinalDispensadoMotivo && <p class="muted">Sinal dispensado: {p.sinalDispensadoMotivo}</p>}
        </Cartao>
      </Grade>

      {(p.etapa === 'producao' || p.etapa === 'pronto' || p.etapa === 'entregue') && (
        <Cartao titulo="Checklist da produção">
          {(Object.keys(ROTULO_CHECKLIST) as (keyof typeof ROTULO_CHECKLIST)[]).map((k) => (
            <Marcador key={k} checked={p.checklist[k]} disabled={final} onChange={(v) => executar(() => atualizarChecklist(p.id, k, v))}>
              {ROTULO_CHECKLIST[k]}
            </Marcador>
          ))}
        </Cartao>
      )}

      <Cartao titulo="Mensagens">
        <div class="ped-mensagens">
          {(Object.keys(ROTULO_MSG) as ChaveMsg[]).map((k) => (
            <Botao key={k} pequeno variante={msg === k ? 'primario' : 'secundario'} onClick={() => setMsg(k)} disabled={!textos[k]}>
              {ROTULO_MSG[k]}
            </Botao>
          ))}
        </div>
        {texto ? (
          <>
            <pre class="acerto-msg" style={{ marginTop: '10px' }}>
              {texto}
            </pre>
            <Linha class="parc-dados-acoes">
              <BotaoWhatsApp numero={cliente?.whatsapp} texto={texto} primario>
                Enviar no WhatsApp
              </BotaoWhatsApp>
              <Botao icone="copiar" onClick={() => copiarTexto(texto)}>
                Copiar texto
              </Botao>
            </Linha>
            {!cliente?.whatsapp && <small class="muted">O cliente não tem WhatsApp cadastrado: o link abre o WhatsApp para você escolher o contato.</small>}
          </>
        ) : (
          <p class="muted">Sem saldo a cobrar.</p>
        )}
      </Cartao>

      <Grade colunas={2}>
        <Cartao titulo="Entrega e prazos">
          <Resumo
            linhas={[
              { rotulo: 'Entrega', valor: p.entrega.tipo === 'retirada' ? 'Retirada' : p.entrega.tipo === 'propria' ? 'Entrega própria' : 'Correios/transportadora' },
              p.entrega.rastreio ? { rotulo: 'Rastreio', valor: p.entrega.rastreio } : null,
              { rotulo: 'Prazo prometido', valor: formatData(p.prazo) },
              p.etapa === 'orcamento' ? { rotulo: 'Validade do orçamento', valor: formatData(p.validade) } : null,
              p.aprovadoEm ? { rotulo: 'Aprovado em', valor: formatData(p.aprovadoEm) } : null,
              p.prontoEm ? { rotulo: 'Pronto em', valor: formatData(p.prontoEm) } : null,
              p.entregueEm ? { rotulo: 'Entregue em', valor: formatData(p.entregueEm) } : null,
            ]}
          />
          {p.descricao && <p style={{ marginTop: '8px' }}>{p.descricao}</p>}
          {p.referencias.map((r) => (
            <div key={r.valor}>
              <a href={r.valor} target="_blank" rel="noopener" style={{ overflowWrap: 'anywhere' }}>
                {r.nome || r.valor}
              </a>
            </div>
          ))}
          {p.observacoes && <p class="muted">Obs.: {p.observacoes}</p>}
        </Cartao>
        <Cartao titulo="Histórico">
          <ul class="ped-historico">
            {p.historico
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  <small>{formatDataHora(h.data)}</small>
                  <span>{h.evento}</span>
                </li>
              ))}
          </ul>
        </Cartao>
      </Grade>

      <Linha>
        {!final && (
          <Botao icone="editar" href={`/pedidos/${p.id}/editar`}>
            Editar
          </Botao>
        )}
        <Botao icone="copiar" onClick={duplicar}>
          Duplicar orçamento
        </Botao>
        {cliente && (
          <Botao variante="fantasma" icone="usuario" href={`/clientes/${cliente.id}`}>
            Ficha do cliente
          </Botao>
        )}
        {!final && (
          <Botao variante="fantasma" icone="fechar" onClick={() => setMover('cancelado')}>
            Cancelar pedido
          </Botao>
        )}
      </Linha>

      {mover && <ModalEtapa pedido={p} destino={mover} onFechar={() => setMover(null)} onFeito={() => setMsg(MSG_DA_ETAPA[mover])} />}
      {pagando && <ModalPagamento pedido={p} onFechar={() => setPagando(false)} />}
      {estornando && (
        <ModalMotivo aberto titulo="Estornar este pagamento?" rotuloConfirmar="Estornar" perigo onFechar={() => setEstornando(null)} onConfirmar={(motivo) => executar(() => estornarPagamentoPedido(estornando.id, motivo), 'Pagamento estornado')}>
          <p>
            {formatBRL(estornando.valorCentavos)} de {formatData(estornando.data)} ({ROTULO_FORMA[estornando.forma]}). O pagamento original continua no histórico.
          </p>
        </ModalMotivo>
      )}
    </Pagina>
  );
}
