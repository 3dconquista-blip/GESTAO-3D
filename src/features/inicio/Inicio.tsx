// "Início" (11.1), enxuto (decisão 98): o que fazer hoje numa lista só (acertos, pedidos, estoque e o que há a
// receber, do mais urgente ao menos) e, do mês, só a receita e o lucro. Divisão por canal, gráfico de 6 meses,
// top 5 e "dinheiro que entrou" ficam em Relatórios. Os números vêm de services/relatorios.ts.
import type { ComponentChildren } from 'preact';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { textoVencimento } from '../../domain/agenda.ts';
import type { AlertaPedido } from '../../domain/pedidos.ts';
import { numeroPedido } from '../../domain/pedidos.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatPct, formatQtd } from '../../lib/format.ts';
import { painelInicio } from '../../services/relatorios.ts';
import { Aviso, Botao, Cartao, Dica, Indicador, ItemLista, Lista, Pagina, Secao, Selo } from '../../ui/index.ts';
import './inicio.css';

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

interface Tarefa {
  chave: string;
  /** 0 = urgente (vermelho), 1 = atenção, 2 = em dia. */
  peso: number;
  tom?: 'ruim' | 'atencao';
  titulo: string;
  subtitulo: ComponentChildren;
  direita?: ComponentChildren;
  href: string;
}

export function Inicio(_props: TelaProps) {
  useDb();
  const hoje = hojeISO();
  const p = painelInicio(hoje);
  const h = p.hoje;
  const { atual, anterior } = p.mes;
  const nome = db.config.empresa?.nome;
  const semDados = db.all('produtos').length === 0;

  const tarefas: Tarefa[] = [];
  const acertos = [...h.acertosAtrasados, ...h.acertosDaSemana.filter((c) => !h.acertosAtrasados.includes(c))];
  for (const c of acertos) {
    const atrasado = c.status === 'atrasado';
    tarefas.push({
      chave: `acerto:${c.parceiro.id}`,
      peso: atrasado ? 0 : 1,
      tom: atrasado ? 'ruim' : 'atencao',
      titulo: c.proximoAcerto ? `Acerto: ${c.parceiro.nome}` : `Levar peças: ${c.parceiro.nome}`,
      subtitulo: c.proximoAcerto ? `${textoVencimento(c.diasParaVencer)} · ${formatQtd(c.pecasNoExpositor)} peças no expositor` : 'Parceiro sem peças ainda',
      href: c.proximoAcerto ? `/parceiros/${c.parceiro.id}/acerto` : `/parceiros/${c.parceiro.id}/levar`,
    });
  }
  const porPedido = new Map<string, { numero: number; titulo: string; alertas: AlertaPedido[] }>();
  for (const a of h.pedidos) {
    const x = porPedido.get(a.pedido.id) ?? { numero: a.pedido.numero, titulo: a.pedido.titulo, alertas: [] };
    x.alertas.push(a.alerta);
    porPedido.set(a.pedido.id, x);
  }
  for (const [id, x] of porPedido) {
    const grave = x.alertas.some((a) => a.tom === 'ruim');
    tarefas.push({
      chave: `pedido:${id}`,
      peso: grave ? 0 : 1,
      tom: grave ? 'ruim' : 'atencao',
      titulo: `Pedido ${numeroPedido(x.numero)} · ${x.titulo}`,
      subtitulo: (
        <span class="inicio-selos">
          {x.alertas.map((a) => (
            <Selo key={a.tipo} tom={a.tom}>
              {a.texto}
            </Selo>
          ))}
        </span>
      ),
      href: `/pedidos/${id}`,
    });
  }
  for (const x of h.aReceber.pedidos.filter((x) => x.pedido.etapa === 'entregue' && !porPedido.has(x.pedido.id))) {
    tarefas.push({
      chave: `receber:${x.pedido.id}`,
      peso: 1,
      tom: 'atencao',
      titulo: `Receber ${numeroPedido(x.pedido.numero)} · ${x.pedido.titulo}`,
      subtitulo: 'Entregue, falta receber',
      direita: <strong>{formatBRL(x.saldoCentavos)}</strong>,
      href: `/pedidos/${x.pedido.id}`,
    });
  }
  const estoque = h.alertas.filter((a) => !a.discreto);
  for (const a of estoque.slice(0, 5)) {
    tarefas.push({ chave: `estoque:${a.id}`, peso: a.tom === 'ruim' ? 0 : 2, tom: a.tom, titulo: a.titulo, subtitulo: a.detalhe, href: a.href });
  }
  tarefas.sort((a, b) => a.peso - b.peso);

  return (
    <Pagina
      titulo="Início"
      subtitulo={nome ? `${nome} · ${formatData(hoje)}` : formatData(hoje)}
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
      {h.aReceber.vencidas.map((v) => (
        <Aviso key={v.parceiro.id} tom="ruim" titulo={`Pendência vencida: ${v.parceiro.nome}`} acao={<Botao pequeno href={`/parceiros/${v.parceiro.id}`}>Ver</Botao>}>
          {formatBRL(v.valorCentavos)} do acerto anterior ainda não foram pagos.
        </Aviso>
      ))}

      <Cartao titulo="Para fazer hoje">
        {tarefas.length === 0 ? (
          <p class="muted">Tudo em dia: nenhum acerto, pedido ou estoque pedindo atenção.</p>
        ) : (
          <Lista>
            {tarefas.map((t) => (
              <ItemLista key={t.chave} titulo={t.titulo} subtitulo={t.subtitulo} direita={t.direita} tom={t.tom} href={t.href} />
            ))}
          </Lista>
        )}
        {estoque.length > 5 && (
          <p class="muted" style={{ marginTop: '8px' }}>
            E mais {estoque.length - 5} alerta(s) de estoque. <a href="#/estoque/imprimir">O que imprimir</a>
          </p>
        )}
      </Cartao>

      <Secao titulo={`Este mês · ${atual.rotulo}`} acoes={<Botao pequeno variante="fantasma" icone="grafico" href="/relatorios">Relatórios</Botao>}>
        <div class="indicadores">
          <Indicador rotulo="Receita" valor={formatBRL(atual.receitaCentavos)} detalhe={<Variacao atual={atual.receitaCentavos} anterior={anterior.receitaCentavos} rotulo={anterior.rotulo} />} />
          <Indicador
            rotulo="Lucro estimado"
            valor={formatBRL(atual.lucroCentavos)}
            tom={atual.lucroCentavos < 0 ? 'ruim' : undefined}
            detalhe={<Variacao atual={atual.lucroCentavos} anterior={anterior.lucroCentavos} rotulo={anterior.rotulo} />}
          />
          {h.aReceber.totalCentavos > 0 && (
            <Indicador
              rotulo="A receber"
              valor={formatBRL(h.aReceber.totalCentavos)}
              tom={h.aReceber.vencidas.length ? 'ruim' : 'atencao'}
              detalhe={`Parceiros ${formatBRL(h.aReceber.parceirosCentavos)} · Pedidos ${formatBRL(h.aReceber.pedidosCentavos)}`}
            />
          )}
        </div>
        <small class="muted">
          Lucro estimado = receita − custo dos produtos vendidos − perdas − custos fixos do mês ({formatBRL(atual.custosFixosCentavos)}).
          {hoje < atual.ate ? ' O mês ainda não acabou: os custos fixos entram inteiros.' : ''}
        </small>
      </Secao>
    </Pagina>
  );
}
