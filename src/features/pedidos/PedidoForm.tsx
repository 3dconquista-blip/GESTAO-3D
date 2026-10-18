// Novo pedido / editar pedido (9.2): cliente, itens (catálogo ou peça personalizada), orçamento,
// entrega, prazo e valor final editável (mostra lucro e margem do novo valor).
import { useMemo, useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { apagarLocal, lerLocal } from '../../data/local.ts';
import { contextoCusto, produtosAtivos, saldoCasa } from '../../data/selectors.ts';
import type { CanalOrigem, Cents, Pedido, TipoEntrega } from '../../data/types.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { calcularOrcamento, custoItem, descontoQtdSugerido, lucroPedido, numeroPedido, quantidadeTotalItens, reservasCatalogo, situacaoFinanceira } from '../../domain/pedidos.ts';
import { addDias, hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { pctOfCents } from '../../lib/money.ts';
import { clientesAtivos, salvarCliente, type DadosCliente } from '../../services/clientes.ts';
import { atualizarPedido, criarPedido, type ItemPedidoEntrada } from '../../services/pedidos.ts';
import { AreaTexto, Aviso, Botao, Campo, Cartao, Chave, Data, Dinheiro, Escolha, Grade, Linha, Modal, Numero, Pagina, Resumo, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { CamposCliente } from '../clientes/ClienteForm.tsx';
import { CHAVE_CALCULO_PARA_PEDIDO, type CalculoParaPedido } from '../precos/Calculadora.tsx';
import { FichaTecnicaEditor, fichaVazia } from '../precos/componentes.tsx';

interface ItemForm {
  chave: number;
  id?: string;
  tipo: 'catalogo' | 'personalizada';
  produtoId?: string;
  descricao: string;
  quantidade: number;
  ficha: FichaTecnica;
}

let seq = 0;
const novoItem = (tipo: ItemForm['tipo']): ItemForm => ({ chave: ++seq, tipo, descricao: '', quantidade: 1, ficha: fichaVazia(), produtoId: tipo === 'catalogo' ? produtosAtivos()[0]?.id : undefined });

function itensDoPedido(p: Pedido): ItemForm[] {
  return p.itens.map((i) => ({
    chave: ++seq,
    id: i.id,
    tipo: i.tipo,
    produtoId: i.produtoId,
    descricao: i.descricao,
    quantidade: i.quantidade,
    ficha: { mesas: (i.mesas ?? []).map((m) => ({ ...m, filamentos: m.filamentos.map((f) => ({ ...f })) })), componentes: (i.componentes ?? []).map((c) => ({ ...c })), maoDeObraMin: i.maoDeObraMin ?? 0 },
  }));
}

export function PedidoForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('pedidos', params.id) : undefined;
  const cfg = db.config;
  const daCalculadora = query.get('da') === 'calculadora' ? lerLocal<CalculoParaPedido>(CHAVE_CALCULO_PARA_PEDIDO) : null;

  const [clienteId, setClienteId] = useState<string | null>(atual?.clienteId ?? query.get('cliente') ?? null);
  const [titulo, setTitulo] = useState(atual?.titulo ?? daCalculadora?.descricao ?? '');
  const [descricao, setDescricao] = useState(atual?.descricao ?? '');
  const [itens, setItens] = useState<ItemForm[]>(() =>
    atual
      ? itensDoPedido(atual)
      : daCalculadora
        ? [{ chave: ++seq, tipo: 'personalizada', descricao: daCalculadora.descricao, quantidade: daCalculadora.quantidade, ficha: daCalculadora.ficha }]
        : [novoItem('personalizada')],
  );
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
    impostoPct: cfg.custos.impostoPct,
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
    impostoPct: parametros.impostoPct,
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
  const lucro = lucroPedido({ totalCentavos: totalFinal, freteCentavos: frete ?? 0, impostoPct: parametros.impostoPct, taxasCartaoCentavos: taxas, custoProducao: orc.custoProducao, modelagem: orc.modelagem });
  const qtdTotal = quantidadeTotalItens(itens);
  const sugestaoDesconto = descontoQtdSugerido(qtdTotal, cfg.pedidos);
  const reservas = reservasCatalogo(db.all('pedidos').filter((p) => p.id !== atual?.id));
  const itensTravados = !!atual?.materiaisBaixados;

  if (params.id && !atual) {
    return (
      <div class="pagina">
        <Vazio titulo="Pedido não encontrado" acao={{ rotulo: 'Ver pedidos', href: '/pedidos' }} />
      </div>
    );
  }

  const mudarItem = (chave: number, patch: Partial<ItemForm>) => setItens(itens.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));

  const salvar = () => {
    if (!clienteId) return avisar('Escolha o cliente do pedido.', 'ruim');
    const entrada: ItemPedidoEntrada[] = itens.map((i) =>
      i.tipo === 'catalogo'
        ? { id: i.id, tipo: 'catalogo', produtoId: i.produtoId, quantidade: i.quantidade, descricao: i.descricao || undefined }
        : { id: i.id, tipo: 'personalizada', descricao: i.descricao || titulo, quantidade: i.quantidade, mesas: i.ficha.mesas, componentes: i.ficha.componentes, maoDeObraMin: i.ficha.maoDeObraMin },
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
      if (daCalculadora) apagarLocal(CHAVE_CALCULO_PARA_PEDIDO);
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

  return (
    <Pagina titulo={atual ? `Editar ${numeroPedido(atual.numero)}` : 'Novo pedido'} voltarPara={atual ? `/pedidos/${atual.id}` : '/pedidos'} largura="larga">
      <Grade colunas={2}>
        <div class="pilha pilha-m">
          <Cartao titulo="Pedido">
            <div class="formulario">
              <Campo rotulo="Cliente" obrigatorio>
                <Linha quebra={false}>
                  <Escolha value={clienteId} onChange={setClienteId} opcoes={clientesAtivos().map((c) => ({ valor: c.id, rotulo: c.nome }))} placeholder="Escolha o cliente" />
                  <Botao icone="plus" onClick={() => setNovoCliente({ nome: '', aceitaNovidades: false })}>
                    Novo
                  </Botao>
                </Linha>
              </Campo>
              <Campo rotulo="Título" obrigatorio>
                <Texto value={titulo} onInput={setTitulo} placeholder="Ex.: 20 chaveiros com nome" />
              </Campo>
              <Campo rotulo="Descrição">
                <AreaTexto value={descricao} onInput={setDescricao} linhas={2} />
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Prazo prometido">
                  <Data value={prazo} onInput={setPrazo} min={hojeISO()} />
                </Campo>
                <Campo rotulo="Canal de origem" dica={canal === 'expositor' ? 'Continua sendo venda direta (não entra no acerto)' : undefined}>
                  <Escolha value={canal} onChange={(v) => setCanal(v as CanalOrigem)} opcoes={Object.entries(ROTULO_CANAL_VENDA).map(([v, r]) => ({ valor: v, rotulo: r }))} />
                </Campo>
              </div>
            </div>
          </Cartao>

          {itensTravados && <Aviso tom="info">Os materiais deste pedido já foram baixados (Pronto): os itens não podem mais mudar.</Aviso>}
          {itens.map((i, k) => {
            const c = custos[k];
            const disponivel = i.produtoId ? saldoCasa(i.produtoId) - (reservas.get(i.produtoId) || 0) : 0;
            const faltam = i.tipo === 'catalogo' ? Math.max(0, i.quantidade - Math.max(0, disponivel)) : 0;
            return (
              <div key={i.chave} class="ped-item">
                <div class="ped-item-topo">
                  <strong>Item {k + 1}</strong>
                  {!itensTravados && itens.length > 1 && <Botao pequeno variante="fantasma" icone="fechar" title="Remover item" onClick={() => setItens(itens.filter((x) => x.chave !== i.chave))} />}
                </div>
                {!itensTravados && (
                  <Segmentado
                    value={i.tipo}
                    onChange={(tipo) => mudarItem(i.chave, { tipo, produtoId: tipo === 'catalogo' ? (i.produtoId ?? produtosAtivos()[0]?.id) : undefined })}
                    opcoes={[
                      { valor: 'personalizada', rotulo: 'Peça personalizada' },
                      { valor: 'catalogo', rotulo: 'Produto do catálogo' },
                    ]}
                  />
                )}
                <div class="campos-2">
                  {i.tipo === 'catalogo' ? (
                    <Campo rotulo="Produto">
                      <Escolha value={i.produtoId ?? null} onChange={(v) => mudarItem(i.chave, { produtoId: v })} opcoes={produtosAtivos().map((p) => ({ valor: p.id, rotulo: p.nome }))} disabled={itensTravados} />
                    </Campo>
                  ) : (
                    <Campo rotulo="Descrição da peça">
                      <Texto value={i.descricao} onInput={(v) => mudarItem(i.chave, { descricao: v })} placeholder="Ex.: chaveiro com nome" disabled={itensTravados} />
                    </Campo>
                  )}
                  <Campo rotulo="Quantidade">
                    <Numero value={i.quantidade} onChange={(v) => mudarItem(i.chave, { quantidade: Math.max(1, v ?? 1) })} decimais={0} min={1} stepper disabled={itensTravados} />
                  </Campo>
                </div>
                {faltam > 0 && <Aviso tom="atencao">Faltam {faltam} unidade(s) em Casa (descontando outros pedidos). A diferença vai para "O que imprimir".</Aviso>}
                {i.tipo === 'personalizada' && !itensTravados && <FichaTecnicaEditor valor={i.ficha} onChange={(ficha) => mudarItem(i.chave, { ficha })} />}
                <small class="muted">
                  Custo: {formatReais(c.custoUnit, 4)} por peça · {formatReais(c.custoTotalExato)} no total
                  {c.avisos.length ? ` · ${c.avisos[0]}` : ''}
                </small>
              </div>
            );
          })}
          {!itensTravados && (
            <Linha>
              <Botao icone="plus" onClick={() => setItens([...itens, novoItem('personalizada')])}>
                Peça personalizada
              </Botao>
              <Botao icone="plus" onClick={() => setItens([...itens, novoItem('catalogo')])} disabled={!produtosAtivos().length}>
                Produto do catálogo
              </Botao>
            </Linha>
          )}
        </div>

        <div class="pilha pilha-m">
          <Cartao titulo="Orçamento">
            <div class="formulario">
              <div class="campos-2">
                <Campo rotulo="Horas de modelagem" dica={`${formatReais(parametros.valorHoraModelagem)}/h, cobrada sem margem`}>
                  <Numero value={horas} onChange={setHoras} decimais={2} min={0} sufixo="h" />
                </Campo>
                <Campo rotulo="Sinal">
                  <Numero value={sinalPct} onChange={setSinalPct} min={0} max={100} sufixo="%" />
                </Campo>
                <Campo rotulo="Desconto">
                  <Numero value={desconto} onChange={setDesconto} min={0} max={99} sufixo="%" />
                </Campo>
                <Campo rotulo="Urgência">
                  <Chave checked={urgente} onChange={setUrgente}>
                    Urgente (+{formatQtd(parametros.urgenciaPct)}%)
                  </Chave>
                </Campo>
              </div>
              {sugestaoDesconto > 0 && (desconto ?? 0) === 0 && (
                <Aviso tom="info" acao={<Botao pequeno onClick={() => setDesconto(sugestaoDesconto)}>Aplicar</Botao>}>
                  {qtdTotal} peças: desconto por quantidade sugerido de {formatQtd(sugestaoDesconto)}%. Você decide.
                </Aviso>
              )}
              {orc.erro ? (
                <Aviso tom="ruim">{orc.erro}</Aviso>
              ) : (
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
              <Campo rotulo="Valor final (editável)" dica={totalManual == null ? 'Vazio = total calculado' : `Calculado: ${formatBRL(orc.totalCentavos)}`}>
                <Dinheiro value={totalManual} onChange={setTotalManual} placeholder={(orc.totalCentavos / 100).toFixed(2).replace('.', ',')} />
              </Campo>
              <Resumo
                linhas={[
                  { rotulo: 'Total', valor: formatBRL(totalFinal), destaque: true },
                  { rotulo: `Sinal (${formatQtd(sinalPct ?? 0)}%)`, valor: formatBRL(pctOfCents(totalFinal, sinalPct ?? 0)) },
                  { rotulo: 'Lucro', valor: formatBRL(lucro.lucroCentavos), tom: lucro.lucroCentavos < 0 ? 'ruim' : 'ok' },
                  { rotulo: 'Margem', valor: Number.isFinite(lucro.margemPct) ? formatPct(lucro.margemPct) : '—', tom: lucro.margemPct < cfg.custos.margemMinimaPct ? 'ruim' : undefined },
                ]}
              />
            </div>
          </Cartao>

          <Cartao titulo="Entrega">
            <div class="formulario">
              <Segmentado
                value={entregaTipo}
                onChange={setEntregaTipo}
                opcoes={[
                  { valor: 'retirada', rotulo: 'Retirada' },
                  { valor: 'propria', rotulo: 'Entrega própria' },
                  { valor: 'correios', rotulo: 'Correios/transportadora' },
                ]}
              />
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
            </div>
          </Cartao>

          <Cartao titulo="Referências e observações">
            <div class="formulario">
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
              <Campo rotulo="Observações internas">
                <AreaTexto value={observacoes} onInput={setObservacoes} linhas={2} />
              </Campo>
              {!atual && <small class="muted">O orçamento vale até {formatData(addDias(hojeISO(), cfg.pedidos.validadeDias))}.</small>}
            </div>
          </Cartao>
        </div>
      </Grade>

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
