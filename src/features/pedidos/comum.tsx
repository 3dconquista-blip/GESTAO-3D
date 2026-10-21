// Peças compartilhadas dos pedidos: selo da etapa, janela de mudança de etapa (efeitos da tabela 9.3) e janela de
// pagamento. Enxutas (decisão 86): o essencial à vista, o resto em "Mais detalhes". "Aprovado" e "Em produção" são
// uma etapa só; em "Pronto" a cor de cada filamento das peças personalizadas é escolhida em botões com a amostra
// (decisão 85). Registrar pagamento não pede confirmação: o aviso traz "Desfazer" (estorna o pagamento).
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { ROTULO_ETAPA } from '../../data/defaults.ts';
import { nomeMaterial } from '../../data/selectors.ts';
import type { Cents, EtapaPedido, FormaPagamento, ID, Pedido, PedidoItem } from '../../data/types.ts';
import { consumoFicha } from '../../domain/consumo.ts';
import { posicoesDaFicha } from '../../domain/filamento.ts';
import { ETAPAS_FLUXO, etapaNoFluxo, situacaoFinanceira } from '../../domain/pedidos.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatGramas, formatQtd } from '../../lib/format.ts';
import { coresDoPedido, desfazerPagamentoPedido, moverEtapa, registrarPagamentoPedido, type PayloadEtapa } from '../../services/pedidos.ts';
import { Aviso, Botao, Campo, Data, Dinheiro, MaisDetalhes, Modal, Numero, Segmentado, Selo, Texto, avisar } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';
import { AmostraCor } from '../estoque/EstoqueAbas.tsx';
import './pedidos.css';

// A etapa obsoleta 'aprovado' (pedidos antigos) aparece como "Em produção".
export const TOM_ETAPA: Record<EtapaPedido, 'neutro' | 'info' | 'atencao' | 'ok'> = {
  orcamento: 'neutro',
  aprovado: 'info',
  producao: 'info',
  pronto: 'atencao',
  entregue: 'ok',
  cancelado: 'neutro',
};

export function SeloEtapa({ etapa }: { etapa: EtapaPedido }) {
  return <Selo tom={TOM_ETAPA[etapa]}>{ROTULO_ETAPA[etapa]}</Selo>;
}

const FORMAS: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'cartao', rotulo: 'Cartão' },
];

/**
 * Filamento de uma peça personalizada para mostrar, somando as peças: "PLA 120 g"; depois de Pronto, com a cor
 * usada: "PLA Azul 120 g". Vazio para itens do catálogo e peças sem filamento.
 */
export function textoFilamentoItem(item: PedidoItem): string {
  if (item.tipo !== 'personalizada') return '';
  const material = (id: ID) => db.get('materiais', id);
  const total = new Map<string, number>();
  for (const p of posicoesDaFicha(item.mesas ?? [], material)) {
    const porMesa = item.mesas?.[p.mesaIndice]?.pecasPorMesa || 1;
    const cor = item.cores?.[p.chave];
    const nome = (cor && material(cor)?.nome) || p.tipo;
    total.set(nome, (total.get(nome) || 0) + (p.gramas / porMesa) * item.quantidade);
  }
  return Array.from(total, ([nome, g]) => `${nome} ${formatGramas(g)}`).join(' + ');
}

/**
 * Janela para mudar a etapa, pedindo o que cada etapa exige (9.3). Pulando etapas, pede o de todas por onde o pedido
 * passa: saindo do Orçamento, o sinal (já preenchido) ou "dispensar sinal" com motivo; passando por Pronto, a cor de
 * cada filamento; na entrega, o que foi recebido agora (já preenchido com o que falta).
 */
export function ModalEtapa({ pedido, destino, onFechar, onFeito }: { pedido: Pedido; destino: EtapaPedido; onFechar: () => void; onFeito?: () => void }) {
  const fin = situacaoFinanceira(pedido, db.all('pagamentos'));
  const de = etapaNoFluxo(pedido.etapa);
  const para = etapaNoFluxo(destino);
  const cancelar = para === 'cancelado';
  const passaPor = (e: EtapaPedido) => !cancelar && ETAPAS_FLUXO.indexOf(de) < ETAPAS_FLUXO.indexOf(e) && ETAPAS_FLUXO.indexOf(para) >= ETAPAS_FLUXO.indexOf(e);
  const pedeSinal = passaPor('producao') && fin.pagoCentavos <= 0;
  const passaPronto = passaPor('pronto') && !pedido.materiaisBaixados;
  const entrega = para === 'entregue';

  const [data, setData] = useState(hojeISO());
  // Em produção
  const [sinal, setSinal] = useState<Cents | null>(pedido.sinalCentavos || null);
  const [formaSinal, setFormaSinal] = useState<FormaPagamento>('pix');
  const [motivoSinal, setMotivoSinal] = useState('');
  // Pronto: cor escolhida por item e posição; gramas reais por item e carretel; peças perdidas por item
  const [escolhidas, setEscolhidas] = useState<Record<ID, Record<string, ID>>>({});
  const [gramas, setGramas] = useState<Record<ID, Record<ID, number | null>>>({});
  const [perdidas, setPerdidas] = useState<Record<ID, number | null>>({});
  // Entregue: undefined = o que falta receber (descontando o sinal desta mesma mudança)
  const [recebido, setRecebido] = useState<Cents | null | undefined>(undefined);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  // Cancelado
  const [motivo, setMotivo] = useState('');
  const [destinoSinal, setDestinoSinal] = useState<'reter' | 'devolver_tudo' | 'devolver_parte'>('reter');
  const [devolver, setDevolver] = useState<number | null>(null);

  const personalizadas = pedido.itens.filter((i) => i.tipo === 'personalizada');
  const catalogo = pedido.itens.filter((i) => i.tipo === 'catalogo');
  const coresItens = passaPronto ? coresDoPedido(pedido.id) : [];
  const dispensar = pedeSinal && !!motivoSinal.trim();
  const faltaReceber = Math.max(0, fin.saldoCentavos - (pedeSinal && !dispensar ? (sinal ?? 0) : 0));
  const recebidoAgora = recebido === undefined ? faltaReceber || null : recebido;

  /** Cor de cada posição do item: a escolhida ou a padrão. */
  const coresDoItem = (itemId: ID): Record<string, ID> => {
    const out: Record<string, ID> = {};
    for (const p of coresItens.find((c) => c.itemId === itemId)?.posicoes ?? []) {
      const id = escolhidas[itemId]?.[p.chave] ?? p.padrao;
      if (id) out[p.chave] = id;
    }
    return out;
  };
  const consumoDoItem = (it: PedidoItem) => consumoFicha({ mesas: it.mesas ?? [], componentes: it.componentes ?? [] }, it.quantidade, perdidas[it.id] ?? 0, undefined, coresDoItem(it.id));

  const confirmarMudanca = () => {
    const payload: PayloadEtapa = { data };
    if (pedeSinal) {
      if (dispensar) payload.dispensarSinalMotivo = motivoSinal.trim();
      else if (sinal) payload.sinal = { valorCentavos: sinal, forma: formaSinal, data };
    }
    if (passaPronto) {
      payload.cores = {};
      payload.perdidas = {};
      payload.gramasReais = {};
      for (const it of personalizadas) {
        payload.cores[it.id] = coresDoItem(it.id);
        payload.perdidas[it.id] = perdidas[it.id] ?? 0;
        // Só manda gramas reais se alguma foi digitada (lista vazia = usar a estimativa).
        const digitadas = gramas[it.id];
        if (digitadas && Object.values(digitadas).some((g) => g != null)) {
          payload.gramasReais[it.id] = consumoDoItem(it).filamentos.map((f) => ({ materialId: f.materialId, gramas: digitadas[f.materialId] ?? f.gramas }));
        }
      }
    }
    // Só o que está à vista: se o sinal já cobre tudo, o campo some e um valor digitado antes não conta.
    if (entrega && faltaReceber > 0 && recebidoAgora) payload.pagamentoSaldo = { valorCentavos: recebidoAgora, forma, data };
    if (cancelar) {
      payload.motivo = motivo;
      if (fin.pagoCentavos > 0) {
        payload.destinoSinal = destinoSinal;
        if (destinoSinal === 'devolver_parte') payload.valorDevolvidoCentavos = devolver ?? 0;
        payload.formaDevolucao = forma;
      }
    }
    try {
      const r = moverEtapa(pedido.id, destino, payload);
      avisar(cancelar ? 'Pedido cancelado' : `Pedido em "${ROTULO_ETAPA[para]}"`);
      for (const a of r.avisos) avisar(a, 'atencao');
      onFechar();
      onFeito?.();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const perdidasTotal = personalizadas.reduce((s, it) => s + (perdidas[it.id] ?? 0), 0);
  const comGramasReais = Object.values(gramas).some((g) => Object.values(g).some((v) => v != null));
  const resumoDetalhes = [
    dispensar ? 'sem sinal' : '',
    perdidasTotal ? `${formatQtd(perdidasTotal)} perdida(s)` : '',
    comGramasReais ? 'gramas reais' : '',
    data !== hojeISO() ? formatData(data) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      aberto
      titulo={cancelar ? 'Cancelar pedido' : `Mover para "${ROTULO_ETAPA[para]}"`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante={cancelar ? 'perigo' : 'primario'} onClick={confirmarMudanca}>
            {cancelar ? 'Cancelar pedido' : 'Confirmar'}
          </Botao>
        </>
      }
    >
      {pedeSinal && (
        <>
          <p>Ao aprovar, registre o sinal. O prazo começa a contar a partir de hoje.</p>
          <div class="campos-2">
            <Campo rotulo={`Sinal (${formatQtd(pedido.sinalPct)}%)`} dica={dispensar ? 'Sinal dispensado (motivo em "Mais detalhes")' : undefined}>
              <Dinheiro value={sinal} onChange={setSinal} disabled={dispensar} />
            </Campo>
            <Campo rotulo="Forma">
              <Segmentado value={formaSinal} onChange={setFormaSinal} opcoes={FORMAS} />
            </Campo>
          </div>
        </>
      )}
      {para === 'producao' && !pedeSinal && <p>O pedido entra em produção.</p>}

      {passaPronto &&
        (personalizadas.length ? (
          coresItens.length > 0 && (
            <>
              <p>Escolha a cor de cada peça: o filamento sai do carretel escolhido.</p>
              {coresItens.map((ic) => (
                <div key={ic.itemId} class="ped-cores-item">
                  {coresItens.length > 1 && <strong>{ic.descricao}</strong>}
                  {ic.posicoes.map((p) => (
                    <Campo key={p.chave} rotulo={ic.posicoes.length > 1 ? `Cor · ${p.rotulo}` : `Cor (${p.tipo})`}>
                      {p.opcoes.length === 0 ? (
                        <Aviso tom="atencao">
                          Nenhum filamento {p.tipo} cadastrado. <a href={`#/compra?nova=${p.tipo}`}>Cadastrar a cor na compra de material</a>.
                        </Aviso>
                      ) : (
                        <div class="cores" role="radiogroup">
                          {p.opcoes.map((m) => {
                            const ativo = (escolhidas[ic.itemId]?.[p.chave] ?? p.padrao) === m.id;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                role="radio"
                                aria-checked={ativo}
                                class={`cor-botao ${ativo ? 'ativo' : ''}`}
                                onClick={() => setEscolhidas({ ...escolhidas, [ic.itemId]: { ...escolhidas[ic.itemId], [p.chave]: m.id } })}
                              >
                                <AmostraCor hex={m.corHex} tamanho={20} />
                                {m.corNome || m.nome}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Campo>
                  ))}
                </div>
              ))}
            </>
          )
        ) : (
          para === 'pronto' && <p>Pedido só com itens do catálogo: nada a baixar agora (os itens saem de Casa na entrega).</p>
        ))}

      {entrega && (
        <>
          {catalogo.length > 0 && <p>Os itens do catálogo saem de Casa: {catalogo.map((i) => `${i.quantidade} ${i.descricao}`).join(', ')}.</p>}
          {faltaReceber > 0 ? (
            <div class="campos-2">
              <Campo rotulo="Recebido agora" dica={`Falta receber ${formatBRL(faltaReceber)}. Vazio = fica "A receber".`}>
                <Dinheiro value={recebidoAgora} onChange={setRecebido} />
              </Campo>
              <Campo rotulo="Forma">
                <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
              </Campo>
            </div>
          ) : (
            !pedeSinal && <Aviso tom="ok">Pedido pago.</Aviso>
          )}
        </>
      )}

      {cancelar ? (
        <>
          <Campo rotulo="Motivo do cancelamento" obrigatorio>
            <Texto value={motivo} onInput={setMotivo} />
          </Campo>
          {fin.pagoCentavos > 0 && (
            <>
              <p>O cliente já pagou {formatBRL(fin.pagoCentavos)}. O que fazer com esse valor?</p>
              <Segmentado
                bloco
                value={destinoSinal}
                onChange={setDestinoSinal}
                opcoes={[
                  { valor: 'reter', rotulo: 'Reter' },
                  { valor: 'devolver_tudo', rotulo: 'Devolver tudo' },
                  { valor: 'devolver_parte', rotulo: 'Devolver parte' },
                ]}
              />
              {destinoSinal === 'devolver_parte' && (
                <Campo rotulo="Valor devolvido">
                  <Dinheiro value={devolver} onChange={setDevolver} />
                </Campo>
              )}
              {destinoSinal !== 'reter' && (
                <Campo rotulo="Forma da devolução">
                  <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
                </Campo>
              )}
            </>
          )}
          <small class="muted">O material já gasto continua baixado.</small>
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
        </>
      ) : (
        <MaisDetalhes resumo={resumoDetalhes || undefined}>
          {pedeSinal && (
            <Campo rotulo="Dispensar sinal (motivo)" dica="Preenchido, o pedido entra em produção sem sinal">
              <Texto value={motivoSinal} onInput={setMotivoSinal} placeholder="Ex.: cliente antiga, paga na entrega" />
            </Campo>
          )}
          {passaPronto && personalizadas.length > 0 && (
            <>
              <strong>Material que sai do estoque</strong>
              <ul class="confirmacao-itens">
                {personalizadas.flatMap((it) => {
                  const c = consumoDoItem(it);
                  return [
                    ...c.filamentos.map((f) => (
                      <li key={`${it.id}${f.materialId}`}>
                        {nomeMaterial(f.materialId)}: {formatGramas(gramas[it.id]?.[f.materialId] ?? f.gramas)}
                      </li>
                    )),
                    ...c.componentes.map((x) => (
                      <li key={`${it.id}${x.materialId}c`}>
                        {nomeMaterial(x.materialId)}: {formatQtd(x.quantidade)}
                      </li>
                    )),
                  ];
                })}
              </ul>
              {personalizadas.map((it) => {
                const c = consumoDoItem(it);
                return (
                  <div key={it.id} class="campos-2">
                    <Campo rotulo={`Peças perdidas (${it.descricao})`} dica="Falhas de impressão: gastam filamento a mais">
                      <Numero value={perdidas[it.id] ?? 0} onChange={(v) => setPerdidas({ ...perdidas, [it.id]: v })} decimais={0} min={0} stepper />
                    </Campo>
                    {c.filamentos.map((f) => (
                      <Campo key={f.materialId} rotulo={`${nomeMaterial(f.materialId)} (gramas reais)`} dica="Vazio ou igual = a estimativa">
                        <Numero
                          value={gramas[it.id]?.[f.materialId] ?? f.gramas}
                          onChange={(v) => setGramas({ ...gramas, [it.id]: { ...gramas[it.id], [f.materialId]: v } })}
                          decimais={1}
                          min={0}
                          sufixo="g"
                        />
                      </Campo>
                    ))}
                  </div>
                );
              })}
            </>
          )}
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
        </MaisDetalhes>
      )}
    </Modal>
  );
}

const ROTULO_TIPO_PAGAMENTO = { sinal: 'Sinal', parcela: 'Parcela', saldo: 'Saldo' } as const;

/**
 * Janela "Registrar pagamento" (sinal, parcela ou saldo): valor e forma à vista; tipo e data em "Mais detalhes".
 * Cartão desconta a taxa no lucro. Sem confirmação: o aviso traz "Desfazer" (estorna o pagamento).
 */
export function ModalPagamento({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const fin = situacaoFinanceira(pedido, db.all('pagamentos'));
  const [valor, setValor] = useState<number | null>(fin.saldoCentavos || null);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [tipo, setTipo] = useState<'sinal' | 'parcela' | 'saldo'>(fin.pagoCentavos > 0 ? 'saldo' : 'sinal');
  const [data, setData] = useState(hojeISO());
  const salvar = () => {
    try {
      const r = registrarPagamentoPedido({ pedidoId: pedido.id, valorCentavos: valor ?? 0, forma, tipo, data });
      avisar(`Pagamento de ${formatBRL(r.pagamento.valorCentavos)} registrado`, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => executar(() => desfazerPagamentoPedido(r.pagamento.id), 'Pagamento desfeito'),
      });
      if (r.situacao.creditoCentavos > 0) avisar(`Crédito do cliente: ${formatBRL(r.situacao.creditoCentavos)}`, 'info');
      onFechar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };
  return (
    <Modal
      aberto
      titulo="Registrar pagamento"
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" disabled={!valor} onClick={salvar}>
            Registrar
          </Botao>
        </>
      }
    >
      <p>
        Total {formatBRL(pedido.totalCentavos)} · pago {formatBRL(fin.pagoCentavos)} · falta {formatBRL(fin.saldoCentavos)}
      </p>
      <Campo rotulo="Valor" dica="Valor acima do que falta vira crédito do cliente">
        <Dinheiro value={valor} onChange={setValor} autoFocus />
      </Campo>
      <Campo rotulo="Forma" dica={forma === 'cartao' ? `A taxa do cartão (${formatQtd(db.config.custos.taxaCartaoPct)}%) sai do lucro do pedido` : undefined}>
        <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
      </Campo>
      <MaisDetalhes resumo={[ROTULO_TIPO_PAGAMENTO[tipo], data !== hojeISO() ? formatData(data) : ''].filter(Boolean).join(' · ')}>
        <Campo rotulo="Tipo">
          <Segmentado
            bloco
            value={tipo}
            onChange={setTipo}
            opcoes={[
              { valor: 'sinal', rotulo: 'Sinal' },
              { valor: 'parcela', rotulo: 'Parcela' },
              { valor: 'saldo', rotulo: 'Saldo' },
            ]}
          />
        </Campo>
        <Campo rotulo="Data">
          <Data value={data} onInput={setData} max={hojeISO()} />
        </Campo>
      </MaisDetalhes>
    </Modal>
  );
}
