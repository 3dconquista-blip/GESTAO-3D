// "Início" (11.1): Hoje (acertos, pedidos, estoque e a receber), Este mês × mês anterior com a divisão por
// canal, gráfico dos últimos 6 meses por canal e top 5 do mês. Os números vêm de services/relatorios.ts.
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto } from '../../data/selectors.ts';
import { TOM_STATUS_AGENDA, textoVencimento, type CartaoAgenda } from '../../domain/agenda.ts';
import type { AlertaPedido } from '../../domain/pedidos.ts';
import { numeroPedido } from '../../domain/pedidos.ts';
import { CANAIS_RECEITA, ROTULO_CANAL_RECEITA, type ComparativoMeses } from '../../domain/relatorios.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatPct, formatQtd } from '../../lib/format.ts';
import { dinheiroDoPeriodo, painelInicio } from '../../services/relatorios.ts';
import { ListaAlertas } from '../estoque/Alertas.tsx';
import {
  Aviso,
  BarraComposicao,
  Botao,
  CORES_SERIES,
  Cartao,
  Dica,
  GraficoBarras,
  Grade,
  Indicador,
  ItemLista,
  Lista,
  Pagina,
  Progresso,
  Resumo,
  Secao,
  Selo,
} from '../../ui/index.ts';
import './inicio.css';

const SERIES = CANAIS_RECEITA.map((c, i) => ({ id: c, rotulo: ROTULO_CANAL_RECEITA[c], cor: CORES_SERIES[i] }));

/**
 * Comparação com o mês anterior: "+12,5% vs set/2026" quando o anterior foi positivo; senão o valor do
 * anterior ("set/2026: −R$ 82,05"), porque % sobre zero ou sobre prejuízo não diz nada.
 */
function Variacao({ atual, anterior, rotulo }: { atual: number; anterior: number; rotulo: string }) {
  if (anterior <= 0) {
    return (
      <span class="muted">
        {rotulo}: {formatBRL(anterior)}
      </span>
    );
  }
  const pct = ((atual - anterior) / anterior) * 100;
  const tom = pct > 0.05 ? 'txt-ok' : pct < -0.05 ? 'txt-ruim' : 'muted';
  return (
    <span class={tom} title={`${rotulo}: ${formatBRL(anterior)}`}>
      {pct > 0 ? '+' : ''}
      {formatPct(pct)} vs {rotulo}
    </span>
  );
}

function CartaoAcertos({ atrasados, daSemana }: { atrasados: CartaoAgenda[]; daSemana: CartaoAgenda[] }) {
  const lista = [...atrasados, ...daSemana.filter((c) => !atrasados.includes(c))];
  return (
    <Cartao titulo="Acertos" acoes={<Botao pequeno variante="fantasma" href="/parceiros">Agenda</Botao>}>
      {lista.length === 0 ? (
        <p class="muted">Nenhum acerto atrasado nem para os próximos 7 dias.</p>
      ) : (
        <Lista>
          {lista.map((c) => (
            <ItemLista
              key={c.parceiro.id}
              titulo={c.parceiro.nome}
              subtitulo={c.proximoAcerto ? `Acerto em ${formatData(c.proximoAcerto)} · ${formatQtd(c.pecasNoExpositor)} peças no expositor` : 'Sem instalação'}
              direita={<Selo tom={TOM_STATUS_AGENDA[c.status]}>{textoVencimento(c.diasParaVencer)}</Selo>}
              href={`/parceiros/${c.parceiro.id}/acerto`}
            />
          ))}
        </Lista>
      )}
    </Cartao>
  );
}

function CartaoPedidos({ alertas }: { alertas: { pedido: { id: string; numero: number; titulo: string }; alerta: AlertaPedido }[] }) {
  const porPedido = new Map<string, { numero: number; titulo: string; alertas: AlertaPedido[] }>();
  for (const a of alertas) {
    const x = porPedido.get(a.pedido.id) ?? { numero: a.pedido.numero, titulo: a.pedido.titulo, alertas: [] };
    x.alertas.push(a.alerta);
    porPedido.set(a.pedido.id, x);
  }
  return (
    <Cartao titulo="Pedidos" acoes={<Botao pequeno variante="fantasma" href="/pedidos">Ver pedidos</Botao>}>
      {porPedido.size === 0 ? (
        <p class="muted">Nenhum pedido atrasado, com prazo próximo ou esperando sinal.</p>
      ) : (
        <Lista>
          {Array.from(porPedido, ([id, p]) => (
            <ItemLista
              key={id}
              titulo={`${numeroPedido(p.numero)} · ${p.titulo}`}
              subtitulo={
                <span class="inicio-selos">
                  {p.alertas.map((a) => (
                    <Selo key={a.tipo} tom={a.tom}>
                      {a.texto}
                    </Selo>
                  ))}
                </span>
              }
              tom={p.alertas.some((a) => a.tom === 'ruim') ? 'ruim' : 'atencao'}
              href={`/pedidos/${id}`}
            />
          ))}
        </Lista>
      )}
    </Cartao>
  );
}

function EsteMes({ mes, hoje }: { mes: ComparativoMeses; hoje: string }) {
  const { atual, anterior } = mes;
  const dinheiro = dinheiroDoPeriodo({ de: atual.de, ate: atual.ate });
  const dinheiroAnterior = dinheiroDoPeriodo({ de: anterior.de, ate: anterior.ate });
  const partes = CANAIS_RECEITA.map((c, i) => ({ rotulo: ROTULO_CANAL_RECEITA[c], valor: atual.receitaPorCanal[c], cor: CORES_SERIES[i] }));
  return (
    <Secao titulo={`Este mês · ${atual.rotulo}`} acoes={<Botao pequeno variante="fantasma" icone="grafico" href="/relatorios">Relatórios</Botao>}>
      <div class="indicadores">
        <Indicador rotulo="Vendas (receita)" valor={formatBRL(atual.receitaCentavos)} detalhe={<Variacao atual={atual.receitaCentavos} anterior={anterior.receitaCentavos} rotulo={anterior.rotulo} />} />
        <Indicador
          rotulo="Lucro estimado"
          valor={formatBRL(atual.lucroCentavos)}
          tom={atual.lucroCentavos < 0 ? 'ruim' : undefined}
          detalhe={<Variacao atual={atual.lucroCentavos} anterior={anterior.lucroCentavos} rotulo={anterior.rotulo} />}
        />
        <Indicador rotulo="Total vendido (bruto)" valor={formatBRL(atual.vendidoCentavos)} detalhe={<Variacao atual={atual.vendidoCentavos} anterior={anterior.vendidoCentavos} rotulo={anterior.rotulo} />} />
        <Indicador rotulo="Dinheiro que entrou" valor={formatBRL(dinheiro.totalCentavos)} detalhe={<Variacao atual={dinheiro.totalCentavos} anterior={dinheiroAnterior.totalCentavos} rotulo={anterior.rotulo} />} />
      </div>
      <Cartao titulo="Divisão por canal">
        {atual.receitaCentavos > 0 ? <BarraComposicao partes={partes} formatar={formatBRL} /> : <p class="muted">Nenhuma venda, acerto ou pedido entregue neste mês ainda.</p>}
        <div class="inicio-canais">
          {CANAIS_RECEITA.map((c) => {
            const a = atual.receitaPorCanal[c];
            const b = anterior.receitaPorCanal[c];
            return (
              <div key={c}>
                <span>{ROTULO_CANAL_RECEITA[c]}</span>
                <strong>{formatBRL(a)}</strong>
                <small class="muted">{anterior.rotulo}: {formatBRL(b)}</small>
              </div>
            );
          })}
        </div>
        <small class="muted">
          Lucro estimado = receita − impostos − custo dos produtos vendidos − perdas − custos fixos do mês ({formatBRL(atual.custosFixosCentavos)}).
          {hoje < atual.ate ? ' O mês ainda não acabou: os custos fixos entram inteiros.' : ''}
        </small>
      </Cartao>
    </Secao>
  );
}

export function Inicio(_props: TelaProps) {
  useDb();
  const hoje = hojeISO();
  const p = painelInicio(hoje);
  const h = p.hoje;
  const nome = db.config.empresa?.nome;
  const graves = h.alertas.filter((a) => a.tom === 'ruim').length;
  const semDados = db.all('produtos').length === 0;

  return (
    <Pagina
      titulo="Início"
      subtitulo={nome ? `${nome} · ${formatData(hoje)}` : formatData(hoje)}
      largura="larga"
      acoes={
        <Botao variante="primario" icone="carrinho" href="/venda">
          Venda rápida
        </Botao>
      }
    >
      {semDados && (
        <Dica>
          Comece cadastrando materiais e produtos em Estoque, ou carregue os dados de exemplo em Mais &gt; Configurações &gt; Dados para ver o
          painel funcionando.
        </Dica>
      )}
      {p.mei.mensagem && (
        <Aviso tom={p.mei.nivel === 'acima' ? 'ruim' : 'atencao'} titulo="Limite do MEI" acao={<Botao pequeno href="/relatorios?secao=ano">Ver</Botao>}>
          {p.mei.mensagem}
        </Aviso>
      )}
      {h.aReceber.vencidas.map((v) => (
        <Aviso key={v.parceiro.id} tom="ruim" titulo={`Pendência vencida: ${v.parceiro.nome}`} acao={<Botao pequeno href={`/parceiros/${v.parceiro.id}`}>Ver</Botao>}>
          {formatBRL(v.valorCentavos)} do acerto anterior ainda não foram pagos.
        </Aviso>
      ))}

      <Secao titulo="Hoje">
        <div class="indicadores">
          <Indicador
            rotulo="Acertos atrasados"
            valor={String(h.acertosAtrasados.length)}
            tom={h.acertosAtrasados.length ? 'ruim' : 'ok'}
            detalhe={`${h.acertosDaSemana.length} nos próximos 7 dias`}
            href="/parceiros"
          />
          <Indicador
            rotulo="Pedidos com alerta"
            valor={String(new Set(h.pedidos.map((x) => x.pedido.id)).size)}
            tom={h.pedidos.some((x) => x.alerta.tom === 'ruim') ? 'ruim' : h.pedidos.length ? 'atencao' : 'ok'}
            href="/pedidos"
          />
          <Indicador
            rotulo="Alertas de estoque"
            valor={String(h.alertas.length)}
            tom={graves ? 'ruim' : h.alertas.length ? 'atencao' : 'ok'}
            detalhe={graves ? `${graves} urgente(s)` : undefined}
            href="/estoque"
          />
          <Indicador
            rotulo="Total a receber"
            valor={formatBRL(h.aReceber.totalCentavos)}
            tom={h.aReceber.vencidas.length ? 'ruim' : h.aReceber.totalCentavos ? 'atencao' : undefined}
            detalhe={`Parceiros ${formatBRL(h.aReceber.parceirosCentavos)} · Pedidos ${formatBRL(h.aReceber.pedidosCentavos)}`}
          />
        </div>
        <Grade colunas={2}>
          <CartaoAcertos atrasados={h.acertosAtrasados} daSemana={h.acertosDaSemana} />
          <CartaoPedidos alertas={h.pedidos} />
          <Cartao titulo="Estoque" acoes={<Botao pequeno variante="fantasma" href="/estoque/imprimir">O que imprimir</Botao>}>
            {h.alertas.length ? <ListaAlertas alertas={h.alertas} limite={5} /> : <p class="muted">Estoque em ordem: nada abaixo do mínimo.</p>}
          </Cartao>
          <Cartao titulo="A receber">
            <Resumo
              linhas={[
                { rotulo: 'Dos parceiros (acertos)', valor: formatBRL(h.aReceber.parceirosCentavos) },
                { rotulo: 'Saldo de pedidos', valor: formatBRL(h.aReceber.pedidosCentavos) },
                { rotulo: 'Total', valor: formatBRL(h.aReceber.totalCentavos), destaque: true },
              ]}
            />
            {h.aReceber.pedidos.length > 0 && (
              <Lista>
                {h.aReceber.pedidos.slice(0, 5).map((x) => (
                  <ItemLista
                    key={x.pedido.id}
                    titulo={`${numeroPedido(x.pedido.numero)} · ${x.pedido.titulo}`}
                    subtitulo={x.pedido.etapa === 'entregue' ? 'Entregue, falta receber' : 'Saldo na entrega'}
                    direita={<strong>{formatBRL(x.saldoCentavos)}</strong>}
                    tom={x.pedido.etapa === 'entregue' ? 'atencao' : undefined}
                    href={`/pedidos/${x.pedido.id}`}
                  />
                ))}
              </Lista>
            )}
          </Cartao>
        </Grade>
      </Secao>

      <EsteMes mes={p.mes} hoje={hoje} />

      <Grade colunas={2}>
        <Cartao titulo="Últimos 6 meses por canal">
          <GraficoBarras
            grupos={p.serie.map((s) => ({ rotulo: s.rotulo.slice(0, 3), valores: { direta: s.direta, parceiros: s.parceiros, pedidos: s.pedidos } }))}
            series={SERIES}
            altura={190}
          />
        </Cartao>
        <Cartao titulo={`Top 5 do mês · ${p.mes.atual.rotulo}`}>
          <div class="inicio-top">
            <div>
              <h3 class="secao-titulo">Produtos</h3>
              {p.topProdutos.length === 0 ? (
                <p class="muted">Sem vendas no mês.</p>
              ) : (
                <ol class="inicio-ranking">
                  {p.topProdutos.map((l) => (
                    <li key={l.produtoId}>
                      <a href={`#/estoque/produtos/${l.produtoId}`}>{nomeProduto(l.produtoId)}</a>
                      <span>
                        {formatQtd(l.unidades)} pç · <strong>{formatBRL(l.receitaCentavos)}</strong>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3 class="secao-titulo">Parceiros</h3>
              {p.topParceiros.length === 0 ? (
                <p class="muted">Nenhum acerto no mês.</p>
              ) : (
                <ol class="inicio-ranking">
                  {p.topParceiros.map((l) => (
                    <li key={l.parceiroId}>
                      <a href={`#/parceiros/${l.parceiroId}`}>{db.get('parceiros', l.parceiroId)?.nome ?? 'Parceiro'}</a>
                      <span>
                        {formatQtd(l.unidades)} pç · <strong>{formatBRL(l.receitaCentavos)}</strong>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </Cartao>
      </Grade>

      <Cartao titulo={`Receita do ano · ${hoje.slice(0, 4)}`} compacto>
        <ReceitaAnoMei mei={p.mei} />
      </Cartao>
    </Pagina>
  );
}

function ReceitaAnoMei({ mei }: { mei: ReturnType<typeof painelInicio>['mei'] }) {
  const tom = mei.nivel === 'acima' ? 'ruim' : mei.nivel === 'atencao' ? 'atencao' : 'ok';
  return (
    <div class="inicio-mei">
      <div class="inicio-mei-topo">
        <strong>{formatBRL(mei.receitaCentavos)}</strong>
        <span class="muted">
          {mei.limiteCentavos > 0 ? `${formatPct(mei.pct)} do limite do MEI (${formatBRL(mei.limiteCentavos)})` : 'Limite do MEI não configurado'}
        </span>
      </div>
      {mei.limiteCentavos > 0 && <Progresso valor={mei.receitaCentavos} max={mei.limiteCentavos} tom={tom} />}
    </div>
  );
}
