// Novo pedido / editar pedido (9.2), enxuto (decisão 86). À vista: cliente, itens (produto do catálogo ou peça
// personalizada com tempo e gramas totais e o tipo de filamento; a cor é escolhida em "Pronto"), prazo e o valor
// (vazio = o calculado), com a linha "Calculado · sinal · lucro". Título (vazio = automático pelos itens),
// descrição, modelagem, urgência, desconto, sinal, composição do preço, entrega, canal, referências e observações
// ficam em "Mais detalhes".
import { useMemo, useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { contextoCusto, produtosAtivos, saldoCasa } from '../../data/selectors.ts';
import type { CanalOrigem, Cents, Pedido, TipoEntrega } from '../../data/types.ts';
import {
  calcularOrcamento,
  custoItem,
  descontoQtdSugerido,
  lucroPedido,
  numeroPedido,
  quantidadeTotalItens,
  reservasCatalogo,
  situacaoFinanceira,
  tituloAutomatico,
} from '../../domain/pedidos.ts';
import { addDias, hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { pctOfCents } from '../../lib/money.ts';
import { clientesAtivos, salvarCliente, type DadosCliente } from '../../services/clientes.ts';
import { atualizarPedido, criarPedido, type ItemPedidoEntrada } from '../../services/pedidos.ts';
import { AreaTexto, Aviso, Botao, Campo, Cartao, Chave, Data, Dinheiro, Escolha, Linha, MaisDetalhes, Modal, Numero, Pagina, Resumo, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { CamposCliente } from '../clientes/ClienteForm.tsx';
import { textoFilamentoItem } from './comum.tsx';
import { ItemPersonalizadoEditor, cabeNoSimples, novaPecaPersonalizada, pecaEmBranco, type PecaPersonalizada } from './ItemPersonalizado.tsx';

interface ItemForm extends PecaPersonalizada {
  chave: number;
  id?: string;
  tipo: 'catalogo' | 'personalizada';
  produtoId?: string;
}

const ROTULO_ENTREGA: Record<TipoEntrega, string> = { retirada: 'Retirada', propria: 'Entrega própria', correios: 'Correios/transportadora' };

let seq = 0;
function novoItem(tipo: ItemForm['tipo']): ItemForm {
  if (tipo === 'personalizada') return { chave: ++seq, tipo, ...novaPecaPersonalizada() };
  return { chave: ++seq, tipo, produtoId: produtosAtivos()[0]?.id, descricao: '', quantidade: 1, ficha: { mesas: [], componentes: [], maoDeObraMin: 0 }, completo: false };
}

function itensDoPedido(p: Pedido): ItemForm[] {
  return p.itens.map((i) => {
    const ficha = { mesas: (i.mesas ?? []).map((m) => ({ ...m, filamentos: m.filamentos.map((f) => ({ ...f })) })), componentes: (i.componentes ?? []).map((c) => ({ ...c })), maoDeObraMin: i.maoDeObraMin ?? 0 };
    return {
      chave: ++seq,
      id: i.id,
      tipo: i.tipo,
      produtoId: i.produtoId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      ficha,
      completo: i.tipo === 'personalizada' && !cabeNoSimples(ficha, i.quantidade),
    };
  });
}

export function PedidoForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('pedidos', params.id) : undefined;
  const cfg = db.config;

  const [clienteId, setClienteId] = useState<string | null>(atual?.clienteId ?? query.get('cliente') ?? null);
  // Título automático começa vazio: ao salvar continua automático e é refeito pelos itens.
  const [titulo, setTitulo] = useState(atual && !atual.tituloAuto ? atual.titulo : '');
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [itens, setItens] = useState<ItemForm[]>(() => (atual ? itensDoPedido(atual) : [novoItem('personalizada')]));
  const [prazo, setPrazo] = useState(atual?.prazo ?? '');
  const [entregaTipo, setEntregaTipo] = useState<TipoEntrega>(atual?.entrega.tipo ?? 'retirada');
  const [frete, setFrete] = useState<Cents | null>(atual?.entrega.freteCentavos ?? 0);
  const [rastreio, setRastreio] = useState(atual?.entrega.rastreio ?? '');
  const [canal, setCanal] = useState<CanalOrigem>(atual?.canalOrigem ?? 'whatsapp');
  const [horas, setHoras] = useState<number | null>(atual?.horasModelagem ?? 0);
  const [urgente, setUrgente] = useState(atual?.urgente ?? false);
  const [desconto, setDesconto] = useState<number | null>(atual?.descontoPct ?? 0);
  const [sinalPct, setSinalPct] = useState<number | null>(atual?.sinalPct ?? cfg.pedidos.sinalPct);
  const [totalManual, setTotalManual] = useState<Cents | null>(atual && atual.totalCentavos !== atual.totalCalculadoCentavos ? atual.totalCentavos : null);
  const [links, setLinks] = useState<string[]>(atual?.referencias.map((r) => r.valor) ?? []);
  const [novoLink, setNovoLink] = useState('');
  const [observacoes, setObservacoes] = useState(atual?.observacoes ?? '');
  const [novoCliente, setNovoCliente] = useState<DadosCliente | null>(null);

  const ctx = contextoCusto();
  const custos = useMemo(
    () => itens.map((i) => custoItem({ tipo: i.tipo, quantidade: i.quantidade, mesas: i.ficha.mesas, componentes: i.ficha.componentes, maoDeObraMin: i.ficha.maoDeObraMin }, ctx, i.produtoId ? db.get('produtos', i.produtoId) : undefined)),
    [itens, db.version],
  );
  const parametros = atual ?? {
    margemPct: cfg.custos.margemDesejadaPct,
    valorHoraModelagem: cfg.custos.valorHoraModelagem,
    urgenciaPct: cfg.pedidos.urgenciaPct,
    pedidoMinimoCentavos: cfg.pedidos.pedidoMinimoCentavos,
    arredondamento: cfg.custos.arredondamento,
  };
  const orc = calcularOrcamento({
    custosItens: custos.map((c) => c.custoTotalExato),
    horasModelagem: horas ?? 0,
    valorHoraModelagem: parametros.valorHoraModelagem,
    margemPct: parametros.margemPct,
    urgente,
    urgenciaPct: parametros.urgenciaPct,
    descontoPct: desconto ?? 0,
    pedidoMinimoCentavos: parametros.pedidoMinimoCentavos,
    freteCentavos: frete ?? 0,
    sinalPct: sinalPct ?? 0,
    arredondamento: parametros.arredondamento,
  });
  const totalFinal = totalManual ?? orc.totalCentavos;
  const taxas = atual ? situacaoFinanceira(atual, db.all('pagamentos')).taxasCartaoCentavos : 0;
  const lucro = lucroPedido({ totalCentavos: totalFinal, freteCentavos: frete ?? 0, taxasCartaoCentavos: taxas, custoProducao: orc.custoProducao, modelagem: orc.modelagem });
  const margemBaixa = lucro.lucroCentavos < 0 || lucro.margemPct < cfg.custos.margemMinimaPct;
  const qtdTotal = quantidadeTotalItens(itens);
  const sugestaoDesconto = descontoQtdSugerido(qtdTotal, cfg.pedidos);
  const reservas = reservasCatalogo(db.all('pedidos').filter((p) => p.id !== atual?.id));
  const itensTravados = !!atual?.materiaisBaixados;
  // Título automático (o que o pedido recebe se o campo ficar vazio): item do catálogo sem descrição usa o nome do produto.
  const tituloAuto = tituloAutomatico(
    itens.map((i) => ({ descricao: i.tipo === 'catalogo' ? i.descricao || (i.produtoId ? (db.get('produtos', i.produtoId)?.nome ?? '') : '') : i.descricao, quantidade: i.quantidade })),
  );

  if (params.id && !atual) {
    return (
      <div class="pagina">
        <Vazio titulo="Pedido não encontrado" acao={{ rotulo: 'Ver pedidos', href: '/pedidos' }} />
      </div>
    );
  }

  const mudarItem = (chave: number, patch: Partial<ItemForm>) => setItens(itens.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  // "Produto do catálogo" com só uma peça personalizada ainda em branco troca a peça pelo produto.
  const adicionarCatalogo = () => setItens(itens.length === 1 && itens[0].tipo === 'personalizada' && !itens[0].id && pecaEmBranco(itens[0]) ? [novoItem('catalogo')] : [...itens, novoItem('catalogo')]);

  const salvar = () => {
    if (!clienteId) return avisar('Escolha o cliente do pedido.', 'ruim');
    const entrada: ItemPedidoEntrada[] = itens.map((i) =>
      i.tipo === 'catalogo'
        ? { id: i.id, tipo: 'catalogo', produtoId: i.produtoId, quantidade: i.quantidade, descricao: i.descricao || undefined }
        : { id: i.id, tipo: 'personalizada', descricao: i.descricao, quantidade: i.quantidade, mesas: i.ficha.mesas, componentes: i.ficha.componentes, maoDeObraMin: i.ficha.maoDeObraMin },
    );
    const comum = {
      clienteId,
      titulo,
      descricao,
      referencias: links.map((valor) => ({ tipo: 'link' as const, valor })),
      prazo: prazo || undefined,
      entrega: { tipo: entregaTipo, freteCentavos: frete ?? 0, rastreio },
      canalOrigem: canal,
      observacoes,
      horasModelagem: horas ?? 0,
      urgente,
      descontoPct: desconto ?? 0,
      sinalPct: sinalPct ?? 0,
    };
    try {
      const p = atual
        ? atualizarPedido(atual.id, { ...comum, ...(itensTravados ? {} : { itens: entrada }), totalManualCentavos: totalManual })
        : criarPedido({ ...comum, itens: entrada, totalManualCentavos: totalManual });
      avisar(atual ? 'Pedido salvo' : `Orçamento ${numeroPedido(p.numero)} criado`);
      navegar(`/pedidos/${p.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const criarCliente = () => {
    if (!novoCliente) return;
    try {
      const c = salvarCliente(novoCliente);
      setClienteId(c.id);
      setNovoCliente(null);
      avisar('Cliente cadastrado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const resumoDetalhes = [
    titulo.trim() ? '' : tituloAuto ? `título: ${tituloAuto}` : '',
    (horas ?? 0) > 0 ? `${formatQtd(horas ?? 0, 2)} h de modelagem` : '',
    urgente ? 'urgente' : '',
    desconto ? `desconto ${formatQtd(desconto)}%` : sugestaoDesconto > 0 ? `desconto sugerido ${formatQtd(sugestaoDesconto)}%` : '',
    `sinal ${formatQtd(sinalPct ?? 0)}%`,
    ROTULO_ENTREGA[entregaTipo].toLowerCase(),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pagina titulo={atual ? `Editar ${numeroPedido(atual.numero)}` : 'Novo pedido'} voltarPara={atual ? `/pedidos/${atual.id}` : '/pedidos'} largura="estreita">
      <Cartao>
        <Campo rotulo="Cliente" obrigatorio>
          <Linha quebra={false}>
            <Escolha value={clienteId} onChange={setClienteId} opcoes={clientesAtivos().map((c) => ({ valor: c.id, rotulo: c.nome }))} placeholder="Escolha o cliente" />
            <Botao icone="plus" onClick={() => setNovoCliente({ nome: '', aceitaNovidades: false })}>
              Novo
            </Botao>
          </Linha>
        </Campo>
      </Cartao>

      {itensTravados && <Aviso tom="info">Os materiais deste pedido já foram baixados (Pronto): os itens não podem mais mudar.</Aviso>}
      {itens.map((i, k) => {
        const c = custos[k];
        const disponivel = i.produtoId ? saldoCasa(i.produtoId) - (reservas.get(i.produtoId) || 0) : 0;
        const faltam = i.tipo === 'catalogo' ? Math.max(0, i.quantidade - Math.max(0, disponivel)) : 0;
        const salvo = itensTravados ? atual?.itens.find((x) => x.id === i.id) : undefined;
        const filamento = salvo ? textoFilamentoItem(salvo) : '';
        return (
          <div key={i.chave} class="ped-item">
            <div class="ped-item-topo">
              <strong>
                {itens.length > 1 ? `${k + 1}. ` : ''}
                {i.tipo === 'catalogo' ? 'Produto do catálogo' : 'Peça personalizada'}
              </strong>
              {!itensTravados && itens.length > 1 && <Botao pequeno variante="fantasma" icone="fechar" title="Remover item" onClick={() => setItens(itens.filter((x) => x.chave !== i.chave))} />}
            </div>
            {itensTravados ? (
              <span>
                {formatQtd(i.quantidade)} × {i.descricao}
                {filamento ? ` · ${filamento}` : ''}
              </span>
            ) : i.tipo === 'catalogo' ? (
              <>
                <div class="campos-2">
                  <Campo rotulo="Produto">
                    <Escolha value={i.produtoId ?? null} onChange={(v) => mudarItem(i.chave, { produtoId: v, descricao: '' })} opcoes={produtosAtivos().map((p) => ({ valor: p.id, rotulo: p.nome }))} />
                  </Campo>
                  <Campo rotulo="Quantidade">
                    <Numero value={i.quantidade} onChange={(v) => mudarItem(i.chave, { quantidade: Math.max(1, v ?? 1) })} decimais={0} min={1} stepper />
                  </Campo>
                </div>
                {faltam > 0 && <Aviso tom="atencao">Faltam {faltam} unidade(s) em Casa (descontando outros pedidos). A diferença vai para "O que imprimir".</Aviso>}
              </>
            ) : (
              <ItemPersonalizadoEditor valor={i} onChange={(patch) => mudarItem(i.chave, patch)} custo={c} />
            )}
          </div>
        );
      })}
      {!itensTravados && (
        <Linha>
          <Botao icone="plus" onClick={() => setItens([...itens, novoItem('personalizada')])}>
            Peça personalizada
          </Botao>
          <Botao icone="plus" onClick={adicionarCatalogo} disabled={!produtosAtivos().length}>
            Produto do catálogo
          </Botao>
        </Linha>
      )}

      <Cartao>
        <div class="formulario">
          <div class="campos-2">
            <Campo rotulo="Prazo prometido">
              <Data value={prazo} onInput={setPrazo} min={hojeISO()} />
            </Campo>
            <Campo rotulo="Valor" dica={totalManual == null ? 'Vazio = o calculado' : 'Apague para voltar ao calculado'}>
              <Dinheiro value={totalManual} onChange={setTotalManual} placeholder={(orc.totalCentavos / 100).toFixed(2).replace('.', ',')} />
            </Campo>
          </div>
          {orc.erro ? (
            <Aviso tom="ruim">{orc.erro}</Aviso>
          ) : (
            <p class="ped-preco-linha">
              Calculado {formatBRL(orc.totalCentavos)} · sinal {formatBRL(pctOfCents(totalFinal, sinalPct ?? 0))} ·{' '}
              <span class={margemBaixa ? 'txt-ruim' : ''}>
                lucro {formatBRL(lucro.lucroCentavos)}
                {Number.isFinite(lucro.margemPct) ? ` (${formatPct(lucro.margemPct)})` : ''}
              </span>
            </p>
          )}
        </div>
      </Cartao>

      <MaisDetalhes resumo={resumoDetalhes}>
        <Campo rotulo="Título" dica="Vazio = automático pelos itens">
          <Texto value={titulo} onInput={setTitulo} placeholder={tituloAuto || 'Ex.: 20 chaveiros com nome'} />
        </Campo>
        <Campo rotulo="Descrição">
          <AreaTexto value={descricao} onInput={setDescricao} linhas={2} />
        </Campo>
        <div class="campos-2">
          <Campo rotulo="Horas de modelagem" dica={`${formatReais(parametros.valorHoraModelagem)}/h, cobrada sem margem`}>
            <Numero value={horas} onChange={setHoras} decimais={2} min={0} sufixo="h" />
          </Campo>
          <Campo rotulo="Urgência">
            <Chave checked={urgente} onChange={setUrgente}>
              Urgente (+{formatQtd(parametros.urgenciaPct)}%)
            </Chave>
          </Campo>
          <Campo rotulo="Desconto">
            <Numero value={desconto} onChange={setDesconto} min={0} max={99} sufixo="%" />
          </Campo>
          <Campo rotulo="Sinal">
            <Numero value={sinalPct} onChange={setSinalPct} min={0} max={100} sufixo="%" />
          </Campo>
        </div>
        {sugestaoDesconto > 0 && (desconto ?? 0) === 0 && (
          <Aviso tom="info" acao={<Botao pequeno onClick={() => setDesconto(sugestaoDesconto)}>Aplicar</Botao>}>
            {qtdTotal} peças: desconto por quantidade sugerido de {formatQtd(sugestaoDesconto)}%. Você decide.
          </Aviso>
        )}
        {!orc.erro && (
          <Resumo
            linhas={[
              { rotulo: 'Custo de produção', valor: formatReais(orc.custoProducao, 4) },
              { rotulo: `Preço de produção (margem ${formatQtd(parametros.margemPct)}%)`, valor: formatReais(orc.precoProducao, 4) },
              orc.modelagem ? { rotulo: 'Modelagem', valor: formatReais(orc.modelagem, 4) } : null,
              { rotulo: 'Subtotal', valor: formatReais(orc.subtotal, 4) },
              orc.subtotalAjustado !== orc.subtotal ? { rotulo: 'Com urgência/desconto', valor: formatReais(orc.subtotalAjustado, 4) } : null,
              orc.pedidoMinimoAplicado ? { rotulo: 'Pedido mínimo aplicado', valor: formatBRL(parametros.pedidoMinimoCentavos) } : null,
              frete ? { rotulo: 'Frete', valor: formatBRL(frete) } : null,
              { rotulo: 'Total calculado', valor: formatBRL(orc.totalCentavos), destaque: true },
            ]}
          />
        )}
        <Campo rotulo="Entrega">
          <Segmentado
            value={entregaTipo}
            onChange={setEntregaTipo}
            opcoes={(Object.keys(ROTULO_ENTREGA) as TipoEntrega[]).map((t) => ({ valor: t, rotulo: ROTULO_ENTREGA[t] }))}
          />
        </Campo>
        {entregaTipo !== 'retirada' && (
          <div class="campos-2">
            <Campo rotulo="Frete">
              <Dinheiro value={frete} onChange={setFrete} />
            </Campo>
            {entregaTipo === 'correios' && (
              <Campo rotulo="Código de rastreio">
                <Texto value={rastreio} onInput={setRastreio} />
              </Campo>
            )}
          </div>
        )}
        <Campo rotulo="Canal de origem" dica={canal === 'expositor' ? 'Continua sendo venda direta (não entra no acerto)' : undefined}>
          <Escolha value={canal} onChange={(v) => setCanal(v as CanalOrigem)} opcoes={Object.entries(ROTULO_CANAL_VENDA).map(([v, r]) => ({ valor: v, rotulo: r }))} />
        </Campo>
        <div class="campo">
          <span class="campo-rotulo">Referências</span>
          {links.map((l) => (
            <Linha key={l} quebra={false}>
              <a href={l} target="_blank" rel="noopener" style={{ flex: 1, overflowWrap: 'anywhere' }}>
                {l}
              </a>
              <Botao pequeno variante="fantasma" icone="fechar" title="Remover" onClick={() => setLinks(links.filter((x) => x !== l))} />
            </Linha>
          ))}
          <Linha quebra={false}>
            <Texto value={novoLink} onInput={setNovoLink} placeholder="Link de foto, modelo STL/3MF..." type="url" inputMode="url" />
            <Botao
              icone="plus"
              disabled={!novoLink.trim()}
              onClick={() => {
                setLinks([...links, novoLink.trim()]);
                setNovoLink('');
              }}
            >
              Adicionar
            </Botao>
          </Linha>
        </div>
        <Campo rotulo="Observações internas">
          <AreaTexto value={observacoes} onInput={setObservacoes} linhas={2} />
        </Campo>
        {!atual && <small class="muted">O orçamento vale até {formatData(addDias(hojeISO(), cfg.pedidos.validadeDias))}.</small>}
      </MaisDetalhes>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar} disabled={!!orc.erro}>
          {atual ? 'Salvar pedido' : `Criar orçamento · ${formatBRL(totalFinal)}`}
        </Botao>
      </div>

      {novoCliente && (
        <Modal
          aberto
          titulo="Novo cliente"
          onFechar={() => setNovoCliente(null)}
          rodape={
            <>
              <Botao variante="fantasma" onClick={() => setNovoCliente(null)}>
                Voltar
              </Botao>
              <Botao variante="primario" onClick={criarCliente}>
                Cadastrar
              </Botao>
            </>
          }
        >
          <CamposCliente d={novoCliente} mudar={(patch) => setNovoCliente({ ...novoCliente, ...patch })} completo={false} />
        </Modal>
      )}
    </Pagina>
  );
}
