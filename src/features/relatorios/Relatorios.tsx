// "Relatórios" (11.2), em 3 abas (decisão 99): Resultado (com por canal, dinheiro que entrou e o ano em "Mais
// detalhes"), Vendas (produtos e parceiros) e Materiais. Filtro de período (esta quinzena, quinzena anterior, este
// mês, mês anterior, personalizado). Cada seção exporta CSV. Os números vêm de services/relatorios.ts.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeMaterial, nomeProduto } from '../../data/selectors.ts';
import { ROTULO_MOTIVO_PERDA } from '../../data/defaults.ts';
import { nomeArquivoCSV } from '../../domain/csv.ts';
import { numeroPedido } from '../../domain/pedidos.ts';
import type { Gasto } from '../../data/types.ts';
import { cancelarGasto } from '../../services/gastos.ts';
import { CANAIS_RECEITA, ROTULO_CANAL_RECEITA, somarTotais, type Intervalo, type LinhaParceiro, type LinhaPerda, type LinhaProduto, type Totais } from '../../domain/relatorios.ts';
import { diffDias, hojeISO, inicioDoMes, periodoPorChave, type PeriodoChave } from '../../lib/dates.ts';
import { formatBRL, formatData, formatKg, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import {
  resumoDoAno,
  csvAno,
  csvCanais,
  csvDinheiro,
  csvMargens,
  csvMateriais,
  csvParados,
  csvParceiros,
  csvPerdas,
  csvProdutos,
  csvResultado,
  dinheiroDoPeriodo,
  margensProdutos,
  materiaisDoPeriodo,
  movimentoDinheiro,
  parceirosDoPeriodo,
  produtosDoPeriodo,
  produtosParados,
  resultadoDoPeriodo,
  type ArquivoCSV,
  type LinhaDinheiro,
  type MargemProduto,
  type ProdutoParado,
} from '../../services/relatorios.ts';
import {
  Abas,
  Aviso,
  BarraComposicao,
  Botao,
  CORES_SERIES,
  Cartao,
  Data,
  Dica,
  Escolha,
  GraficoBarras,
  Indicador,
  MaisDetalhes,
  Pagina,
  Resumo,
  Segmentado,
  Selo,
  Tabela,
  avisar,
  baixarArquivo,
  type Coluna,
} from '../../ui/index.ts';
import './relatorios.css';

type SecaoRel = 'resultado' | 'vendas' | 'materiais';

const ABAS: { id: SecaoRel; rotulo: string }[] = [
  { id: 'resultado', rotulo: 'Resultado' },
  { id: 'vendas', rotulo: 'Vendas' },
  { id: 'materiais', rotulo: 'Materiais' },
];

/** Links antigos (?secao=canais, parceiros...) abrem a aba que agora tem a seção. */
const ABA_ANTIGA: Record<string, SecaoRel> = { canais: 'resultado', dinheiro: 'resultado', ano: 'resultado', parceiros: 'vendas', produtos: 'vendas' };

const PERIODOS: { valor: Exclude<PeriodoChave, 'ano'>; rotulo: string }[] = [
  { valor: 'quinzena', rotulo: 'Esta quinzena' },
  { valor: 'quinzena_anterior', rotulo: 'Quinzena anterior' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes_anterior', rotulo: 'Mês anterior' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
];

function baixarCSV(arq: ArquivoCSV) {
  baixarArquivo(nomeArquivoCSV(arq.nome, hojeISO()), arq.texto, 'text/csv;charset=utf-8');
  avisar('Planilha baixada. Abra no Excel ou no Google Planilhas.', 'ok');
}

function BotaoCSV({ gerar, rotulo = 'Exportar CSV' }: { gerar: () => ArquivoCSV; rotulo?: string }) {
  return (
    <Botao pequeno variante="secundario" icone="baixar" onClick={() => baixarCSV(gerar())}>
      {rotulo}
    </Botao>
  );
}

const margem = (v: number | null) => (v == null ? '—' : formatPct(v));
const brl = (v: number) => formatBRL(v);
const tomValor = (v: number) => (v < 0 ? 'txt-ruim' : undefined);

// ---------------------------------------------------------------- Resultado

function tentarCancelarGasto(id: string) {
  try {
    cancelarGasto(id);
    avisar('Gasto desfeito');
  } catch (e) {
    avisar(e instanceof Error ? e.message : String(e), 'ruim');
  }
}

function nomePerda(l: LinhaPerda): string {
  if (l.tipo === 'produto') return `${formatQtd(l.quantidade)} × ${nomeProduto(l.refId)}`;
  if (l.tipo === 'material') {
    const m = db.get('materiais', l.refId);
    const qtd = m?.tipo === 'filamento' ? `${formatQtd(l.quantidade)} g` : `${formatQtd(l.quantidade)} un`;
    return `${qtd} de ${nomeMaterial(l.refId)}`;
  }
  return `Expositor ${db.get('expositores', l.refId)?.codigo ?? ''}`;
}

function motivoPerda(l: LinhaPerda): string {
  if (l.motivo === 'pedido_cancelado') {
    const pd = l.pedidoId ? db.get('pedidos', l.pedidoId) : undefined;
    return `Pedido cancelado${pd ? ` ${numeroPedido(pd.numero)}` : ''}`;
  }
  return (l.motivo && ROTULO_MOTIVO_PERDA[l.motivo]) || l.motivo || '—';
}

function SecaoResultado({ p }: { p: Intervalo }) {
  const r = resultadoDoPeriodo(p);
  const dinheiro = dinheiroDoPeriodo(p);
  const diasPeriodo = diffDias(p.de, p.ate) + 1;
  const colunasGasto: Coluna<Gasto>[] = [
    { id: 'desc', rotulo: 'Gasto', render: (g) => g.descricao, principal: true },
    { id: 'data', rotulo: 'Data', render: (g) => formatData(g.data) },
    { id: 'valor', rotulo: 'Valor', render: (g) => brl(g.valorCentavos), alinhar: 'dir' },
    {
      id: 'acao',
      rotulo: '',
      alinhar: 'dir',
      render: (g) => (
        <Botao pequeno variante="fantasma" onClick={() => tentarCancelarGasto(g.id)}>
          Desfazer
        </Botao>
      ),
    },
  ];
  const colunasPerda: Coluna<LinhaPerda>[] = [
    { id: 'item', rotulo: 'Item', render: nomePerda, principal: true },
    { id: 'data', rotulo: 'Data', render: (l) => formatData(l.data) },
    { id: 'motivo', rotulo: 'Motivo', render: motivoPerda },
    { id: 'valor', rotulo: 'Valor', render: (l) => brl(l.valorCentavos), alinhar: 'dir' },
  ];
  return (
    <>
      <div class="indicadores">
        <Indicador rotulo="Receita" valor={brl(r.receitaCentavos)} detalhe="o que fica com você" />
        <Indicador
          rotulo="Lucro estimado"
          valor={brl(r.lucroCentavos)}
          tom={r.lucroCentavos < 0 ? 'ruim' : r.lucroCentavos > 0 ? 'ok' : undefined}
          detalhe={r.margemPct != null ? `${formatPct(r.margemPct)} da receita` : undefined}
        />
      </div>
      <Cartao titulo="Resultado do período" acoes={<BotaoCSV gerar={() => csvResultado(p)} />}>
          <Resumo
            linhas={[
              { rotulo: 'Venda direta (menos taxa do cartão)', valor: brl(r.receitaPorCanal.direta) },
              { rotulo: 'Parceiros (sua parte nos acertos)', valor: brl(r.receitaPorCanal.parceiros) },
              { rotulo: 'Pedidos entregues', valor: brl(r.receitaPorCanal.pedidos) },
              { rotulo: 'Receita', valor: brl(r.receitaCentavos), destaque: true },
              { rotulo: '(−) Custo dos produtos vendidos', valor: brl(-r.cmvCentavos) },
              { rotulo: '(−) Perdas', valor: brl(-r.perdasCentavos) },
              { rotulo: diasPeriodo < 28 ? `(−) Custos fixos (proporcional a ${diasPeriodo} dias)` : '(−) Custos fixos', valor: brl(-r.custosFixosCentavos) },
              r.gastosCentavos ? { rotulo: '(−) Gastos avulsos', valor: brl(-r.gastosCentavos) } : null,
              { rotulo: '(=) Lucro estimado', valor: brl(r.lucroCentavos), destaque: true, tom: r.lucroCentavos < 0 ? 'ruim' : 'ok' },
            ]}
          />
          <small class="muted">
            Taxas de cartão já descontadas: {brl(r.taxasCartaoCentavos)}. Falhas de impressão não entram em perdas: já estão no custo pela taxa de falha.
          </small>
      </Cartao>
      <MaisDetalhes titulo="Perdas" resumo={brl(r.perdasCentavos)}>
        {r.perdas.linhas.length > 0 && <BotaoCSV gerar={() => csvPerdas(p)} />}
          <Resumo
            linhas={[
              { rotulo: 'Produtos (avaria, falta abonada, defeito...)', valor: brl(r.perdas.produtosCentavos) },
              { rotulo: 'Expositores perdidos', valor: brl(r.perdas.expositoresCentavos) },
              { rotulo: 'Materiais', valor: brl(r.perdas.materiaisCentavos) },
            ]}
          />
          <Tabela colunas={colunasPerda} linhas={r.perdas.linhas} chave={(l) => `${l.tipo}-${l.refId}-${l.data}-${l.motivo}-${l.valorCentavos}`} vazio={<p class="muted">Nenhuma perda no período.</p>} />
      </MaisDetalhes>
      <MaisDetalhes titulo="Gastos avulsos" resumo={r.gastos.length ? `${brl(r.gastosCentavos)} em ${r.gastos.length} gasto(s)` : 'nenhum no período'}>
        <Tabela
          colunas={colunasGasto}
          linhas={r.gastos}
          chave={(g) => g.id}
          vazio={<p class="muted">Nenhum gasto avulso no período. Os custos fixos do mês ficam em Configurações &gt; Custos e preços.</p>}
        />
        <div>
          <Botao pequeno variante="secundario" icone="plus" href="/gastos/novo">
            Lançar gasto
          </Botao>
        </div>
      </MaisDetalhes>
      <MaisDetalhes titulo="Por canal" resumo={`vendido nos parceiros ${brl(r.totalVendidoParceirosCentavos)}`}>
        <SecaoCanais p={p} />
      </MaisDetalhes>
      <MaisDetalhes titulo="Dinheiro que entrou" resumo={brl(dinheiro.totalCentavos)}>
        <SecaoDinheiro p={p} />
      </MaisDetalhes>
    </>
  );
}

// ---------------------------------------------------------------- Por canal

type LinhaTabCanal = Totais & { id: string; rotulo: string; sub?: boolean };

const margemTotais = (t: Totais) => (t.receitaCentavos > 0 ? (t.lucroCentavos / t.receitaCentavos) * 100 : null);

function SecaoCanais({ p }: { p: Intervalo }) {
  const r = resultadoDoPeriodo(p);
  const linhas: LinhaTabCanal[] = [];
  for (const c of r.canais) {
    linhas.push({ ...c, id: c.canal, rotulo: c.rotulo });
    if (c.canal === 'direta') for (const d of r.direta) if (d.quantidade) linhas.push({ ...d, id: `direta-${d.canal}`, rotulo: `↳ ${d.rotulo}`, sub: true });
  }
  const total = somarTotais(r.canais);
  const colunas: Coluna<LinhaTabCanal>[] = [
    { id: 'canal', rotulo: 'Canal', render: (l) => (l.sub ? <span class="rel-sub">{l.rotulo}</span> : <strong>{l.rotulo}</strong>), principal: true },
    { id: 'qtd', rotulo: 'Registros', render: (l) => formatQtd(l.quantidade), alinhar: 'dir', esconderNoCelular: true },
    { id: 'pecas', rotulo: 'Peças', render: (l) => formatQtd(l.unidades), alinhar: 'dir' },
    { id: 'vendido', rotulo: 'Vendido', render: (l) => brl(l.vendidoCentavos), alinhar: 'dir' },
    { id: 'taxas', rotulo: 'Taxas', render: (l) => brl(l.taxasCentavos), alinhar: 'dir', esconderNoCelular: true },
    { id: 'receita', rotulo: 'Receita', render: (l) => brl(l.receitaCentavos), alinhar: 'dir' },
    { id: 'custo', rotulo: 'Custo', render: (l) => brl(l.custoCentavos), alinhar: 'dir' },
    { id: 'lucro', rotulo: 'Lucro', render: (l) => <span class={tomValor(l.lucroCentavos)}>{brl(l.lucroCentavos)}</span>, alinhar: 'dir' },
    { id: 'margem', rotulo: 'Margem', render: (l) => margem(margemTotais(l)), alinhar: 'dir' },
  ];
  const partes = CANAIS_RECEITA.map((c, i) => ({ rotulo: ROTULO_CANAL_RECEITA[c], valor: r.receitaPorCanal[c], cor: CORES_SERIES[i] }));
  return (
    <Cartao titulo="Vendas e lucro por canal" acoes={<BotaoCSV gerar={() => csvCanais(p)} />}>
      {r.receitaCentavos > 0 && <BarraComposicao partes={partes} formatar={brl} />}
      <Tabela
        colunas={colunas}
        linhas={linhas}
        chave={(l) => l.id}
        rodape={{
          canal: <strong>Total</strong>,
          qtd: formatQtd(total.quantidade),
          pecas: formatQtd(total.unidades),
          vendido: brl(total.vendidoCentavos),
          taxas: brl(total.taxasCentavos),
          receita: <strong>{brl(total.receitaCentavos)}</strong>,
          custo: brl(total.custoCentavos),
          lucro: <strong>{brl(total.lucroCentavos)}</strong>,
          margem: margem(margemTotais(total)),
        }}
      />
      <small class="muted">
        Vendido: total das vendas, bruto dos acertos e pedidos sem frete. Receita: venda menos taxa do cartão, sua parte nos acertos e pedidos menos frete e
        taxas. Lucro desta tabela: antes das perdas e dos custos fixos (veja Resultado).
      </small>
    </Cartao>
  );
}

// ---------------------------------------------------------------- Parceiros

function SecaoParceiros({ p }: { p: Intervalo }) {
  const linhas = parceirosDoPeriodo(p);
  const nome = (id: string) => db.get('parceiros', id)?.nome ?? 'Parceiro';
  const colunas: Coluna<LinhaParceiro>[] = [
    {
      id: 'nome',
      rotulo: 'Parceiro',
      render: (l) => (
        <a href={`#/parceiros/${l.parceiroId}`}>
          <strong>{nome(l.parceiroId)}</strong>
        </a>
      ),
      principal: true,
    },
    { id: 'acertos', rotulo: 'Acertos', render: (l) => formatQtd(l.quantidade), alinhar: 'dir', esconderNoCelular: true },
    { id: 'pecas', rotulo: 'Peças', render: (l) => formatQtd(l.unidades), alinhar: 'dir' },
    { id: 'giro', rotulo: 'Giro', render: (l) => margem(l.giroPct), alinhar: 'dir' },
    { id: 'bruto', rotulo: 'Vendido (bruto)', render: (l) => brl(l.vendidoCentavos), alinhar: 'dir' },
    { id: 'parte', rotulo: 'Sua parte', render: (l) => <strong>{brl(l.receitaCentavos)}</strong>, alinhar: 'dir' },
    { id: 'lucro', rotulo: 'Lucro', render: (l) => <span class={tomValor(l.lucroCentavos)}>{brl(l.lucroCentavos)}</span>, alinhar: 'dir' },
    { id: 'receber', rotulo: 'A receber', render: (l) => (l.aReceberCentavos ? <span class="txt-atencao">{brl(l.aReceberCentavos)}</span> : '—'), alinhar: 'dir' },
    {
      id: 'retorno',
      rotulo: 'Retorno do expositor',
      render: (l) => (l.retornoExpositorPct == null ? '—' : <span class={l.retornoExpositorPct >= 100 ? 'txt-ok' : undefined}>{formatPct(l.retornoExpositorPct)}</span>),
      alinhar: 'dir',
    },
  ];
  const soma = (f: (l: LinhaParceiro) => number) => linhas.reduce((s, l) => s + f(l), 0);
  return (
    <Cartao titulo="Ranking de parceiros" acoes={<BotaoCSV gerar={() => csvParceiros(p)} />}>
      <Tabela
        colunas={colunas}
        linhas={linhas}
        chave={(l) => l.parceiroId}
        vazio={<p class="muted">Nenhum parceiro cadastrado.</p>}
        rodape={{
          nome: <strong>Total</strong>,
          acertos: formatQtd(soma((l) => l.quantidade)),
          pecas: formatQtd(soma((l) => l.unidades)),
          bruto: brl(soma((l) => l.vendidoCentavos)),
          parte: <strong>{brl(soma((l) => l.receitaCentavos))}</strong>,
          lucro: brl(soma((l) => l.lucroCentavos)),
          receber: brl(soma((l) => l.aReceberCentavos)),
        }}
      />
      <small class="muted">
        Ordenado pela sua parte no período. Giro = peças vendidas ÷ peças que estavam no expositor nos acertos do período. Retorno do expositor = lucro
        acumulado no parceiro até o fim do período ÷ custo dos expositores dele. A receber: pendências em aberto até o fim do período.
      </small>
    </Cartao>
  );
}

// ---------------------------------------------------------------- Produtos

const TOM_MARGEM = { ok: 'ok', atencao: 'atencao', prejuizo: 'ruim', sem_preco: 'neutro' } as const;
const ROTULO_MARGEM = { ok: 'Boa', atencao: 'Abaixo da desejada', prejuizo: 'Prejuízo', sem_preco: 'Sem preço' } as const;

function SecaoProdutos({ p }: { p: Intervalo }) {
  const vendidos = produtosDoPeriodo(p).filter((l) => l.unidades > 0 || l.unidadesPedidos > 0);
  const parados = produtosParados(p);
  const margens = margensProdutos(p);
  const link = (id: string, texto: string) => (
    <a href={`#/estoque/produtos/${id}`}>
      <strong>{texto}</strong>
    </a>
  );
  const colVend: Coluna<LinhaProduto>[] = [
    { id: 'nome', rotulo: 'Produto', render: (l) => link(l.produtoId, nomeProduto(l.produtoId)), principal: true },
    { id: 'direta', rotulo: 'Venda direta', render: (l) => formatQtd(l.unidadesDireta), alinhar: 'dir' },
    { id: 'parc', rotulo: 'Parceiros', render: (l) => formatQtd(l.unidadesParceiros), alinhar: 'dir' },
    { id: 'ped', rotulo: 'Pedidos', render: (l) => formatQtd(l.unidadesPedidos), alinhar: 'dir', esconderNoCelular: true },
    { id: 'receita', rotulo: 'Receita', render: (l) => brl(l.receitaCentavos), alinhar: 'dir' },
    { id: 'lucro', rotulo: 'Lucro', render: (l) => <span class={tomValor(l.lucroCentavos)}>{brl(l.lucroCentavos)}</span>, alinhar: 'dir' },
    { id: 'margem', rotulo: 'Margem', render: (l) => margem(l.margemPct), alinhar: 'dir' },
  ];
  const colParados: Coluna<ProdutoParado>[] = [
    { id: 'nome', rotulo: 'Produto', render: (l) => link(l.produto.id, l.produto.nome), principal: true },
    { id: 'casa', rotulo: 'Em Casa', render: (l) => formatQtd(l.emCasa), alinhar: 'dir' },
    { id: 'parc', rotulo: 'Nos parceiros', render: (l) => formatQtd(l.nosParceiros), alinhar: 'dir' },
    { id: 'ultima', rotulo: 'Última venda', render: (l) => (l.ultimaVenda ? `${formatData(l.ultimaVenda)} (${l.diasSemVenda} dias)` : 'Nunca vendeu') },
  ];
  const colMargem: Coluna<MargemProduto>[] = [
    { id: 'nome', rotulo: 'Produto', render: (l) => link(l.produto.id, l.produto.nome), principal: true },
    { id: 'custo', rotulo: 'Custo por peça', render: (l) => formatReais(l.custoUnit, 4), alinhar: 'dir' },
    { id: 'preco', rotulo: 'Etiqueta', render: (l) => brl(l.precoEtiquetaCentavos), alinhar: 'dir' },
    { id: 'status', rotulo: 'Etiqueta nos canais', render: (l) => <Selo tom={TOM_MARGEM[l.status]}>{ROTULO_MARGEM[l.status]}</Selo> },
    { id: 'real', rotulo: 'Margem real no período', render: (l) => margem(l.margemPeriodoPct), alinhar: 'dir' },
  ];
  return (
    <>
      <Cartao titulo="Mais vendidos" acoes={<BotaoCSV gerar={() => csvProdutos(p)} />}>
        <Tabela colunas={colVend} linhas={vendidos} chave={(l) => l.produtoId} vazio={<p class="muted">Nenhum produto vendido no período.</p>} />
        <small class="muted">Receita e lucro de venda direta e parceiros. Peças de catálogo entregues em pedidos aparecem só na contagem (o valor fica no pedido).</small>
      </Cartao>
      <Cartao titulo={`Parados (${parados.length})`} acoes={parados.length > 0 && <BotaoCSV gerar={() => csvParados(p)} />}>
        <Tabela colunas={colParados} linhas={parados} chave={(l) => l.produto.id} vazio={<p class="muted">Todo produto com estoque vendeu no período.</p>} />
        <small class="muted">Produtos com peças em Casa ou nos parceiros e nenhuma venda no período.</small>
      </Cartao>
      <Cartao titulo="Margem" acoes={<BotaoCSV gerar={() => csvMargens(p)} />}>
        <Tabela colunas={colMargem} linhas={margens} chave={(l) => l.produto.id} vazio={<p class="muted">Nenhum produto ativo.</p>} />
      </Cartao>
    </>
  );
}

// ---------------------------------------------------------------- Materiais

function SecaoMateriais({ p }: { p: Intervalo }) {
  const m = materiaisDoPeriodo(p);
  const falha = m.falha;
  const acima = falha.taxaPct != null && falha.taxaPct > m.taxaFalhaConfigPct + 0.05;
  return (
    <>
      <div class="indicadores">
        <Indicador rotulo="Filamento consumido" valor={formatKg(m.totalGramas)} detalhe={`${formatQtd(m.totalGramas, 0)} g`} />
        <Indicador rotulo="Custo do filamento" valor={brl(m.totalCustoCentavos)} />
        <Indicador
          rotulo="Taxa de falha real"
          valor={falha.taxaPct == null ? '—' : formatPct(falha.taxaPct)}
          tom={acima ? 'atencao' : falha.taxaPct != null ? 'ok' : undefined}
          detalhe={`usada no custo: ${formatPct(m.taxaFalhaConfigPct)}`}
        />
        <Indicador rotulo="Peças produzidas" valor={formatQtd(falha.boas)} detalhe={`${formatQtd(falha.perdidas)} perdidas em falhas`} />
      </div>
      {acima && (
        <Aviso tom="atencao" titulo="Falhas acima do previsto">
          A taxa de falha real ({formatPct(falha.taxaPct ?? 0)}) está acima da usada no custo ({formatPct(m.taxaFalhaConfigPct)}). Se continuar assim, ajuste em
          Configurações &gt; Custos para o preço cobrir as perdas.
        </Aviso>
      )}
      <Cartao titulo="Consumo de filamento por mês" acoes={<BotaoCSV gerar={() => csvMateriais(p)} />}>
        {m.meses.length > 1 && (
          <GraficoBarras grupos={m.meses.map((x) => ({ rotulo: x.rotulo, valores: { custo: x.custoCentavos } }))} series={[{ id: 'custo', rotulo: 'Custo' }]} altura={150} />
        )}
        {m.meses.map((x) => (
          <div key={x.mes} class="rel-mes">
            <div class="rel-mes-topo">
              <strong>{x.rotulo}</strong>
              <span>
                {formatKg(x.gramas)} · <strong>{brl(x.custoCentavos)}</strong>
              </span>
            </div>
            {x.porMaterial.length === 0 ? (
              <small class="muted">Sem consumo registrado.</small>
            ) : (
              <ul class="rel-materiais">
                {x.porMaterial.map((mat) => (
                  <li key={mat.materialId}>
                    <span>{nomeMaterial(mat.materialId)}</span>
                    <span>
                      {formatQtd(mat.gramas, 0)} g · {brl(mat.custoCentavos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <small class="muted">Filamento baixado nas produções e nos pedidos (inclui o gasto nas falhas), pelo custo médio do momento.</small>
      </Cartao>
    </>
  );
}

// ---------------------------------------------------------------- Dinheiro

function SecaoDinheiro({ p }: { p: Intervalo }) {
  const d = dinheiroDoPeriodo(p);
  const linhas = movimentoDinheiro(p);
  const colunas: Coluna<LinhaDinheiro>[] = [
    { id: 'ref', rotulo: 'Referência', render: (l) => <strong>{l.referencia}</strong>, principal: true },
    { id: 'data', rotulo: 'Data', render: (l) => formatData(l.data) },
    { id: 'origem', rotulo: 'Origem', render: (l) => l.origem, esconderNoCelular: true },
    { id: 'desc', rotulo: 'Descrição', render: (l) => (l.entraNoTotal ? l.descricao : <span class="muted">{l.descricao} (fora do total)</span>) },
    { id: 'forma', rotulo: 'Forma', render: (l) => l.forma, esconderNoCelular: true },
    { id: 'valor', rotulo: 'Valor', render: (l) => <span class={tomValor(l.valorCentavos)}>{brl(l.valorCentavos)}</span>, alinhar: 'dir' },
  ];
  return (
    <>
      <div class="indicadores">
        <Indicador rotulo="Dinheiro que entrou" valor={brl(d.totalCentavos)} tom={d.totalCentavos > 0 ? 'ok' : undefined} />
        <Indicador rotulo="Vendas diretas" valor={brl(d.porOrigem.venda)} />
        <Indicador rotulo="Acertos pagos" valor={brl(d.porOrigem.acerto + d.pixExpositorCentavos)} detalhe={d.pixExpositorCentavos ? `inclui ${brl(d.pixExpositorCentavos)} no PIX do expositor` : undefined} />
        <Indicador rotulo="Pedidos (sinais e saldos)" valor={brl(d.porOrigem.pedido)} />
      </div>
      <Cartao titulo="Pagamentos do período" acoes={<BotaoCSV gerar={() => csvDinheiro(p)} />}>
        <Resumo
          linhas={[
            { rotulo: 'Pagamentos recebidos (menos estornos)', valor: brl(d.recebidoCentavos) },
            { rotulo: 'Recebido no seu PIX no expositor', valor: brl(d.pixExpositorCentavos) },
            d.devolvidoCentavos > 0 && { rotulo: '(−) Devoluções a clientes', valor: brl(-d.devolvidoCentavos) },
            { rotulo: 'Dinheiro que entrou', valor: brl(d.totalCentavos), destaque: true },
            d.taxasCartaoCentavos > 0 && { rotulo: 'Taxas de cartão desses recebimentos', valor: brl(d.taxasCartaoCentavos) },
            d.pagoParceirosCentavos !== 0 && { rotulo: 'Repasses feitos a parceiros (fora do total)', valor: brl(d.pagoParceirosCentavos) },
          ]}
        />
        <Tabela colunas={colunas} linhas={linhas} chave={(l) => `${l.data}-${l.referencia}-${l.descricao}-${l.valorCentavos}-${l.forma}`} vazio={<p class="muted">Nenhum pagamento no período.</p>} />
        <small class="muted">
          Conta na data do pagamento: o sinal de um pedido entra quando foi pago, mesmo que o pedido seja entregue depois. Não é a receita do período (veja
          Resultado).
        </small>
      </Cartao>
    </>
  );
}

// ---------------------------------------------------------------- Receita do ano

function anosComDados(hoje: string): number[] {
  const anos = new Set<number>([Number(hoje.slice(0, 4))]);
  for (const v of db.all('vendas')) anos.add(Number(v.data.slice(0, 4)));
  for (const a of db.all('acertos')) anos.add(Number(a.data.slice(0, 4)));
  for (const p of db.all('pedidos')) if (p.entregueEm) anos.add(Number(p.entregueEm.slice(0, 4)));
  return Array.from(anos).sort((a, b) => b - a);
}

function SecaoAno({ hoje }: { hoje: string }) {
  const anos = anosComDados(hoje);
  const [ano, setAno] = useState(anos[0]);
  const { receita, meses } = resumoDoAno(ano, hoje);
  const colunas: Coluna<(typeof meses)[number]>[] = [
    { id: 'mes', rotulo: 'Mês', render: (l) => <strong>{l.rotulo}</strong>, principal: true },
    { id: 'direta', rotulo: 'Venda direta', render: (l) => brl(l.receitaPorCanal.direta), alinhar: 'dir' },
    { id: 'parc', rotulo: 'Parceiros', render: (l) => brl(l.receitaPorCanal.parceiros), alinhar: 'dir' },
    { id: 'ped', rotulo: 'Pedidos', render: (l) => brl(l.receitaPorCanal.pedidos), alinhar: 'dir' },
    { id: 'receita', rotulo: 'Receita', render: (l) => <strong>{brl(l.receitaCentavos)}</strong>, alinhar: 'dir' },
    { id: 'bruto', rotulo: 'Vendido nos parceiros', render: (l) => brl(l.totalVendidoParceirosCentavos), alinhar: 'dir', esconderNoCelular: true },
    { id: 'lucro', rotulo: 'Lucro estimado', render: (l) => <span class={tomValor(l.lucroCentavos)}>{brl(l.lucroCentavos)}</span>, alinhar: 'dir' },
  ];
  return (
    <>
      {anos.length > 1 && (
        <div class="rel-ano">
          <span>Ano</span>
          <Escolha value={ano} onChange={(v) => setAno(Number(v))} opcoes={anos.map((a) => ({ valor: a, rotulo: String(a) }))} />
        </div>
      )}
      <Cartao titulo={`Receita de ${ano}`} acoes={<BotaoCSV gerar={() => csvAno(ano, hoje)} />}>
        <Resumo
          linhas={[
            { rotulo: 'Venda direta (menos taxa do cartão)', valor: brl(receita.porCanal.direta) },
            { rotulo: 'Parceiros (sua parte)', valor: brl(receita.porCanal.parceiros) },
            { rotulo: 'Pedidos entregues', valor: brl(receita.porCanal.pedidos) },
            { rotulo: 'Receita do ano', valor: brl(receita.receitaCentavos), destaque: true },
            { rotulo: 'Total vendido nos parceiros (bruto)', valor: brl(receita.totalVendidoParceirosCentavos) },
          ]}
        />
        <Dica>O contador pode pedir a receita (o que fica com você) ou o total vendido nos parceiros (bruto). Os dois estão aqui e no CSV.</Dica>
        <Tabela
          colunas={colunas}
          linhas={meses}
          chave={(l) => l.mes}
          vazio={<p class="muted">Nenhum registro neste ano.</p>}
          rodape={{
            mes: <strong>Total</strong>,
            direta: brl(meses.reduce((s, l) => s + l.receitaPorCanal.direta, 0)),
            parc: brl(meses.reduce((s, l) => s + l.receitaPorCanal.parceiros, 0)),
            ped: brl(meses.reduce((s, l) => s + l.receitaPorCanal.pedidos, 0)),
            receita: <strong>{brl(meses.reduce((s, l) => s + l.receitaCentavos, 0))}</strong>,
            bruto: brl(meses.reduce((s, l) => s + l.totalVendidoParceirosCentavos, 0)),
            lucro: brl(meses.reduce((s, l) => s + l.lucroCentavos, 0)),
          }}
        />
      </Cartao>
    </>
  );
}

// ---------------------------------------------------------------- Tela

export function Relatorios({ query }: TelaProps) {
  useDb();
  const hoje = hojeISO();
  const pedida = query.get('secao') ?? 'resultado';
  const inicial = ABA_ANTIGA[pedida] ?? pedida;
  const [secao, setSecao] = useState<SecaoRel>(ABAS.some((a) => a.id === inicial) ? (inicial as SecaoRel) : 'resultado');
  const [chave, setChave] = useState<Exclude<PeriodoChave, 'ano'>>('mes');
  const [de, setDe] = useState(inicioDoMes(hoje));
  const [ate, setAte] = useState(hoje);

  const periodo: Intervalo = chave === 'personalizado' ? { de, ate } : periodoPorChave(chave, hoje);
  const valido = periodo.de && periodo.ate && periodo.de <= periodo.ate;

  return (
    <Pagina titulo="Relatórios" voltarPara="/mais" largura="larga">
      <Abas abas={ABAS} ativa={secao} onMudar={(id) => setSecao(id as SecaoRel)} />
      <div class="rel-filtro">
          <Segmentado value={chave} onChange={setChave} opcoes={PERIODOS.map((x) => ({ valor: x.valor, rotulo: x.rotulo }))} />
          {chave === 'personalizado' && (
            <div class="rel-datas">
              <label>
                De <Data value={de} onInput={setDe} max={ate} />
              </label>
              <label>
                Até <Data value={ate} onInput={setAte} min={de} />
              </label>
            </div>
          )}
          {valido && (
            <small class="muted">
              {formatData(periodo.de)} a {formatData(periodo.ate)}
            </small>
          )}
      </div>
      {!valido ? (
        <Aviso tom="atencao">Escolha uma data inicial antes da final.</Aviso>
      ) : (
        <>
          {secao === 'resultado' && (
            <>
              <SecaoResultado p={periodo} />
              <MaisDetalhes titulo="Receita do ano">
                <SecaoAno hoje={hoje} />
              </MaisDetalhes>
            </>
          )}
          {secao === 'vendas' && (
            <>
              <SecaoProdutos p={periodo} />
              <SecaoParceiros p={periodo} />
            </>
          )}
          {secao === 'materiais' && <SecaoMateriais p={periodo} />}
        </>
      )}
    </Pagina>
  );
}
