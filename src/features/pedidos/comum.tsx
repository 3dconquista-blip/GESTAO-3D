// Peças compartilhadas dos pedidos: selo da etapa, janela de mudança de etapa (efeitos da tabela 9.3)
// e janela de pagamento.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { ROTULO_ETAPA } from '../../data/defaults.ts';
import { nomeMaterial } from '../../data/selectors.ts';
import type { EtapaPedido, FormaPagamento, Pedido } from '../../data/types.ts';
import { consumoFicha } from '../../domain/consumo.ts';
import { proximaEtapa, situacaoFinanceira } from '../../domain/pedidos.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatGramas, formatQtd } from '../../lib/format.ts';
import { moverEtapa, registrarPagamentoPedido, type PayloadEtapa } from '../../services/pedidos.ts';
import { Aviso, Botao, Campo, Data, Dinheiro, Modal, Numero, Segmentado, Selo, Texto, avisar } from '../../ui/index.ts';
import './pedidos.css';

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

/** Janela para mudar a etapa, pedindo o que cada etapa exige (9.3). */
export function ModalEtapa({ pedido, destino, onFechar, onFeito }: { pedido: Pedido; destino: EtapaPedido; onFechar: () => void; onFeito?: () => void }) {
  const fin = situacaoFinanceira(pedido, db.all('pagamentos'));
  const [data, setData] = useState(hojeISO());
  // Aprovado
  const [semSinal, setSemSinal] = useState(false);
  const [valor, setValor] = useState<number | null>(destino === 'aprovado' ? (fin.pagoCentavos > 0 ? null : pedido.sinalCentavos) : destino === 'entregue' ? fin.saldoCentavos || null : null);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [motivoSinal, setMotivoSinal] = useState('');
  // Pronto
  const [reais, setReais] = useState(false);
  const [gramas, setGramas] = useState<Record<string, Record<string, number | null>>>({});
  const [perdidas, setPerdidas] = useState<Record<string, number | null>>({});
  // Cancelado
  const [motivo, setMotivo] = useState('');
  const [destinoSinal, setDestinoSinal] = useState<'reter' | 'devolver_tudo' | 'devolver_parte'>('reter');
  const [devolver, setDevolver] = useState<number | null>(null);

  const personalizadas = pedido.itens.filter((i) => i.tipo === 'personalizada');
  const catalogo = pedido.itens.filter((i) => i.tipo === 'catalogo');

  const confirmarMudanca = () => {
    const payload: PayloadEtapa = { data };
    if (destino === 'aprovado' || (proximaEtapa(pedido.etapa) === 'aprovado' && destino !== 'cancelado')) {
      if (fin.pagoCentavos <= 0) {
        if (semSinal) payload.dispensarSinalMotivo = motivoSinal;
        else if (valor) payload.sinal = { valorCentavos: valor, forma, data };
      }
    }
    if (destino === 'pronto' && reais) {
      payload.gramasReais = {};
      payload.perdidas = {};
      for (const it of personalizadas) {
        const calc = consumoFicha({ mesas: it.mesas ?? [], componentes: it.componentes ?? [] }, it.quantidade, perdidas[it.id] ?? 0).filamentos;
        payload.gramasReais[it.id] = calc.map((f) => ({ materialId: f.materialId, gramas: gramas[it.id]?.[f.materialId] ?? f.gramas }));
        payload.perdidas[it.id] = perdidas[it.id] ?? 0;
      }
    }
    // Pulando direto do orçamento para a entrega, o valor digitado é o sinal (evita lançar duas vezes).
    if (destino === 'entregue' && valor && !(pedido.etapa === 'orcamento' && fin.pagoCentavos <= 0)) {
      payload.pagamentoSaldo = { valorCentavos: valor, forma, data };
    }
    if (destino === 'cancelado') {
      payload.motivo = motivo;
      if (fin.pagoCentavos > 0) {
        payload.destinoSinal = destinoSinal;
        if (destinoSinal === 'devolver_parte') payload.valorDevolvidoCentavos = devolver ?? 0;
        payload.formaDevolucao = forma;
      }
    }
    try {
      const r = moverEtapa(pedido.id, destino, payload);
      avisar(destino === 'cancelado' ? 'Pedido cancelado' : `Pedido em "${ROTULO_ETAPA[destino]}"`);
      for (const a of r.avisos) avisar(a, 'atencao');
      onFechar();
      onFeito?.();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const pedeSinal = destino !== 'cancelado' && pedido.etapa === 'orcamento' && fin.pagoCentavos <= 0;

  return (
    <Modal
      aberto
      titulo={destino === 'cancelado' ? 'Cancelar pedido' : `Mover para "${ROTULO_ETAPA[destino]}"`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante={destino === 'cancelado' ? 'perigo' : 'primario'} onClick={confirmarMudanca}>
            {destino === 'cancelado' ? 'Cancelar pedido' : 'Confirmar'}
          </Botao>
        </>
      }
    >
      {pedeSinal && (
        <>
          <p>Ao aprovar, registre o sinal ou dispense com o motivo. O prazo começa a contar a partir de hoje.</p>
          <Segmentado
            bloco
            value={semSinal ? 'nao' : 'sim'}
            onChange={(v) => setSemSinal(v === 'nao')}
            opcoes={[
              { valor: 'sim', rotulo: 'Recebi o sinal' },
              { valor: 'nao', rotulo: 'Dispensar sinal' },
            ]}
          />
          {semSinal ? (
            <Campo rotulo="Motivo" obrigatorio>
              <Texto value={motivoSinal} onInput={setMotivoSinal} placeholder="Ex.: cliente antiga, paga na entrega" />
            </Campo>
          ) : (
            <div class="campos-2">
              <Campo rotulo={`Sinal (${formatQtd(pedido.sinalPct)}%)`}>
                <Dinheiro value={valor} onChange={setValor} />
              </Campo>
              <Campo rotulo="Forma">
                <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
              </Campo>
            </div>
          )}
        </>
      )}
      {destino === 'producao' && <p>Em produção, marque o checklist: modelo aprovado pelo cliente, impresso e acabamento.</p>}
      {destino === 'pronto' && (
        <>
          {personalizadas.length ? (
            <>
              <p>Ao ficar pronto, os materiais das peças personalizadas são baixados do estoque:</p>
              <ul class="confirmacao-itens">
                {personalizadas.flatMap((it) => {
                  const c = consumoFicha({ mesas: it.mesas ?? [], componentes: it.componentes ?? [] }, it.quantidade, perdidas[it.id] ?? 0);
                  return [
                    ...c.filamentos.map((f) => <li key={`${it.id}${f.materialId}`}>{nomeMaterial(f.materialId)}: {formatGramas(gramas[it.id]?.[f.materialId] ?? f.gramas)}</li>),
                    ...c.componentes.map((x) => <li key={`${it.id}${x.materialId}c`}>{nomeMaterial(x.materialId)}: {formatQtd(x.quantidade)}</li>),
                  ];
                })}
              </ul>
              <Segmentado
                value={reais ? 'reais' : 'estimado'}
                onChange={(v) => setReais(v === 'reais')}
                opcoes={[
                  { valor: 'estimado', rotulo: 'Usar a estimativa' },
                  { valor: 'reais', rotulo: 'Informar gramas reais e falhas' },
                ]}
              />
              {reais &&
                personalizadas.map((it) => {
                  const c = consumoFicha({ mesas: it.mesas ?? [], componentes: it.componentes ?? [] }, it.quantidade, perdidas[it.id] ?? 0);
                  return (
                    <div key={it.id} class="campos-2">
                      <Campo rotulo={`Peças perdidas (${it.descricao})`}>
                        <Numero value={perdidas[it.id] ?? 0} onChange={(v) => setPerdidas({ ...perdidas, [it.id]: v })} decimais={0} min={0} stepper />
                      </Campo>
                      {c.filamentos.map((f) => (
                        <Campo key={f.materialId} rotulo={`${nomeMaterial(f.materialId)} (gramas reais)`}>
                          <Numero value={gramas[it.id]?.[f.materialId] ?? f.gramas} onChange={(v) => setGramas({ ...gramas, [it.id]: { ...gramas[it.id], [f.materialId]: v } })} decimais={1} min={0} sufixo="g" />
                        </Campo>
                      ))}
                    </div>
                  );
                })}
            </>
          ) : (
            <p>Pedido só com itens do catálogo: nada a baixar agora (os itens saem de Casa na entrega).</p>
          )}
        </>
      )}
      {destino === 'entregue' && (
        <>
          {catalogo.length > 0 && <p>Os itens do catálogo saem de Casa: {catalogo.map((i) => `${i.quantidade} ${i.descricao}`).join(', ')}.</p>}
          {pedeSinal ? null : fin.saldoCentavos > 0 ? (
            <>
              <p>Falta receber {formatBRL(fin.saldoCentavos)}. Registre o pagamento agora ou deixe "A receber".</p>
              <div class="campos-2">
                <Campo rotulo="Recebido agora">
                  <Dinheiro value={valor} onChange={setValor} />
                </Campo>
                <Campo rotulo="Forma">
                  <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
                </Campo>
              </div>
            </>
          ) : (
            <Aviso tom="ok">Pedido pago.</Aviso>
          )}
        </>
      )}
      {destino === 'cancelado' && (
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
        </>
      )}
      <Campo rotulo="Data">
        <Data value={data} onInput={setData} max={hojeISO()} />
      </Campo>
    </Modal>
  );
}

/** Janela "Registrar pagamento" (sinal, parcela ou saldo). Cartão desconta a taxa no lucro. */
export function ModalPagamento({ pedido, onFechar }: { pedido: Pedido; onFechar: () => void }) {
  const fin = situacaoFinanceira(pedido, db.all('pagamentos'));
  const [valor, setValor] = useState<number | null>(fin.saldoCentavos || null);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [tipo, setTipo] = useState<'sinal' | 'parcela' | 'saldo'>(fin.pagoCentavos > 0 ? 'saldo' : 'sinal');
  const [data, setData] = useState(hojeISO());
  const salvar = () => {
    try {
      const r = registrarPagamentoPedido({ pedidoId: pedido.id, valorCentavos: valor ?? 0, forma, tipo, data });
      avisar('Pagamento registrado');
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
      <Campo rotulo="Valor" dica="Valor acima do que falta vira crédito do cliente">
        <Dinheiro value={valor} onChange={setValor} autoFocus />
      </Campo>
      <Campo rotulo="Forma" dica={forma === 'cartao' ? `A taxa do cartão (${formatQtd(db.config.custos.taxaCartaoPct)}%) sai do lucro do pedido` : undefined}>
        <Segmentado value={forma} onChange={setForma} opcoes={FORMAS} />
      </Campo>
      <Campo rotulo="Data">
        <Data value={data} onInput={setData} max={hojeISO()} />
      </Campo>
    </Modal>
  );
}
