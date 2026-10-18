// Detalhe do parceiro: dados, mix, saldo no expositor, acertos, pendências e desempenho.
// Ações: "Iniciar acerto", "Reposição avulsa", "Recolher", "Encerrar parceria".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { estoqueDoParceiro, nomeProduto, precoNoParceiro } from '../../data/selectors.ts';
import type { Acerto, FormaPagamento } from '../../data/types.ts';
import { statusAgenda, TOM_STATUS_AGENDA, textoVencimento } from '../../domain/agenda.ts';
import { ROTULO_QUEM_RECEBE, formatarTelefone, rotuloDivisao, rotuloFrequencia } from '../../domain/termo.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatNumero, formatPct, formatQtd } from '../../lib/format.ts';
import { lerRascunho, pendenciasDoParceiro, registrarPagamentoParceiro, ultimoAcerto } from '../../services/acertos.ts';
import { desempenhoDoParceiro } from '../../services/consultas.ts';
import { expositoresDoParceiro } from '../../services/expositores.ts';
import { dispensarLembreteTermo, pausarParceiro, reativarParceiro } from '../../services/parceiros.ts';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Data,
  Dinheiro,
  Grade,
  Indicador,
  Linha,
  Modal,
  Pagina,
  Resumo,
  Segmentado,
  Selo,
  Tabela,
  avisar,
  confirmar,
  type Coluna,
} from '../../ui/index.ts';
import { BotaoMapa, BotaoWhatsApp, ParceiroNaoEncontrado, SeloSituacao, descricaoParceiro } from './comum.tsx';

const TOM_PAGAMENTO = { pago: 'ok', parcial: 'atencao', pendente: 'ruim' } as const;
const ROTULO_PAGAMENTO = { pago: 'Pago', parcial: 'Parcial', pendente: 'Pendente' } as const;

function ModalRecebimento({ parceiroId, aberto, onFechar, maximo }: { parceiroId: string; aberto: boolean; onFechar: () => void; maximo: number }) {
  const [valor, setValor] = useState<number | null>(maximo);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [data, setData] = useState(hojeISO());
  const salvar = () => {
    try {
      registrarPagamentoParceiro({ parceiroId, valorCentavos: valor ?? 0, forma, data });
      avisar('Recebimento registrado');
      onFechar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };
  return (
    <Modal
      aberto={aberto}
      titulo="Receber pendência"
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" disabled={!valor} onClick={salvar}>
            Registrar recebimento
          </Botao>
        </>
      }
    >
      <p>Em aberto: {formatBRL(maximo)}. O valor abate primeiro o acerto mais antigo.</p>
      <Campo rotulo="Valor recebido">
        <Dinheiro value={valor} onChange={setValor} autoFocus />
      </Campo>
      <Campo rotulo="Forma">
        <Segmentado
          value={forma}
          onChange={setForma}
          opcoes={[
            { valor: 'pix', rotulo: 'PIX' },
            { valor: 'dinheiro', rotulo: 'Dinheiro' },
          ]}
        />
      </Campo>
      <Campo rotulo="Data">
        <Data value={data} onInput={setData} max={hojeISO()} />
      </Campo>
    </Modal>
  );
}

export function ParceiroDetalhe({ params }: TelaProps) {
  useDb();
  const [recebendo, setRecebendo] = useState(false);
  const p = db.get('parceiros', params.id);
  if (!p) return <ParceiroNaoEncontrado />;
  const hoje = hojeISO();
  const ultimo = ultimoAcerto(p.id);
  const agenda = statusAgenda(p, ultimo, hoje, db.config.parcerias.diasAviso);
  const estoque = estoqueDoParceiro(p.id).sort((a, b) => nomeProduto(a.produtoId).localeCompare(nomeProduto(b.produtoId), 'pt-BR'));
  const pecas = estoque.reduce((s, e) => s + e.qtd, 0);
  const pend = pendenciasDoParceiro(p.id, hoje);
  const des = desempenhoDoParceiro(p.id);
  const acertos = db
    .all('acertos')
    .filter((a) => a.parceiroId === p.id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const exps = expositoresDoParceiro(p.id);
  const ativo = p.situacao === 'ativo' && !p.arquivado;
  const rascunho = lerRascunho(p.id);
  const statusDe = new Map(pend.acertos.map((a) => [a.acertoId, a]));

  const colAcertos: Coluna<Acerto>[] = [
    { id: 'data', rotulo: 'Data', principal: true, render: (a) => `${formatData(a.data)}${a.final ? ' (final)' : ''}` },
    { id: 'vendidos', rotulo: 'Vendidos', alinhar: 'dir', render: (a) => formatQtd(a.itens.reduce((s, i) => s + i.vendidos, 0)) },
    { id: 'bruto', rotulo: 'Total vendido', alinhar: 'dir', render: (a) => formatBRL(a.brutoCentavos) },
    { id: 'sua', rotulo: 'Sua parte', alinhar: 'dir', render: (a) => formatBRL(a.suaParteCentavos) },
    { id: 'valor', rotulo: 'Valor do acerto', alinhar: 'dir', render: (a) => formatBRL(a.valorAcertoCentavos) },
    {
      id: 'status',
      rotulo: 'Situação',
      render: (a) => {
        if (a.situacao === 'estornado') return <Selo tom="neutro">Reaberto</Selo>;
        const al = statusDe.get(a.id);
        return (
          <Selo tom={TOM_PAGAMENTO[a.statusPagamento]}>
            {ROTULO_PAGAMENTO[a.statusPagamento]}
            {al && al.aberto > 0 ? ` · falta ${formatBRL(al.aberto)}` : ''}
          </Selo>
        );
      },
    },
  ];

  const alternarPausa = async () => {
    if (p.situacao === 'ativo') {
      if (!(await confirmar({ titulo: `Pausar ${p.nome}?`, itens: ['Sai da agenda de acertos.', 'As peças continuam no expositor e no saldo do parceiro.'], confirmar: 'Pausar' }))) return;
      pausarParceiro(p.id);
      avisar('Parceiro pausado');
    } else {
      reativarParceiro(p.id);
      avisar('Parceiro reativado');
    }
  };

  return (
    <Pagina
      titulo={p.nome}
      subtitulo={descricaoParceiro(p)}
      voltarPara="/parceiros/lista"
      acoes={
        ativo && p.instaladoEm ? (
          <Botao variante="primario" icone="check" href={`/parceiros/${p.id}/acerto`}>
            {rascunho ? 'Continuar acerto' : 'Iniciar acerto'}
          </Botao>
        ) : ativo ? (
          <Botao variante="primario" icone="estoque" href={`/parceiros/${p.id}/instalacao`}>
            Instalação
          </Botao>
        ) : undefined
      }
    >
      <Linha>
        <SeloSituacao p={p} />
        {p.instaladoEm && <Selo tom={TOM_STATUS_AGENDA[agenda.status]}>{textoVencimento(agenda.diasParaVencer)}</Selo>}
        {rascunho && <Selo tom="info">Acerto em andamento neste aparelho</Selo>}
      </Linha>

      {p.lembrarReimprimirTermo && (
        <Aviso
          tom="atencao"
          titulo="A divisão mudou: reimprima o termo"
          acao={
            <Linha>
              <Botao pequeno href={`/parceiros/${p.id}/termo`}>
                Termo
              </Botao>
              <Botao pequeno variante="fantasma" onClick={() => dispensarLembreteTermo(p.id)}>
                Dispensar
              </Botao>
            </Linha>
          }
        >
          Imprima o termo novo com {rotuloDivisao(p.pctParceiro)} e peça a assinatura.
        </Aviso>
      )}
      {pend.vencida.valorCentavos > 0 && (
        <Aviso tom="ruim" titulo="Pendência vencida" acao={<Botao pequeno onClick={() => setRecebendo(true)}>Receber</Botao>}>
          {formatBRL(pend.vencida.valorCentavos)} em aberto desde {formatData(pend.vencida.desde)} ({pend.vencida.dias} dia(s)).
        </Aviso>
      )}
      {des?.baixoDesempenho && (
        <Aviso tom="atencao" titulo="Baixo desempenho">
          A sua parte por mês ficou abaixo de {formatBRL(db.config.parcerias.limiteBaixoDesempenhoCentavos)} nos 2 últimos acertos.
        </Aviso>
      )}
      {des && des.itensParados.length > 0 && (
        <Aviso tom="atencao" titulo="Itens parados (sem venda em 2 acertos seguidos)">
          {des.itensParados.map((i) => (
            <div key={i.produtoId}>
              {nomeProduto(i.produtoId)}: {i.estoque} peça(s).{' '}
              {i.sugestaoParceiroId ? `Sugestão: recolher e levar para ${db.get('parceiros', i.sugestaoParceiroId)?.nome}, onde vende mais.` : 'Sugestão: recolher.'}
            </div>
          ))}
        </Aviso>
      )}

      <div class="indicadores">
        <Indicador rotulo="Peças no expositor" valor={formatQtd(pecas)} />
        <Indicador rotulo="A receber" valor={formatBRL(pend.saldo?.aReceber ?? 0)} tom={(pend.saldo?.aReceber ?? 0) > 0 ? 'atencao' : undefined} detalhe={(pend.saldo?.aPagar ?? 0) > 0 ? `A repassar: ${formatBRL(pend.saldo!.aPagar)}` : undefined} />
        <Indicador rotulo="Sua parte por mês" valor={des && des.totais.acertos ? formatBRL(des.totais.suaPartePorMesCentavos) : '—'} detalhe={des && des.totais.acertos ? `${des.totais.acertos} acerto(s)` : undefined} />
        <Indicador rotulo="Próximo acerto" valor={formatData(agenda.proximoAcerto)} detalhe={agenda.diasDesdeUltimaVisita != null ? `última visita há ${agenda.diasDesdeUltimaVisita} dia(s)` : undefined} />
      </div>

      {ativo && (
        <Linha>
          {p.instaladoEm && (
            <>
              <Botao icone="repor" href={`/parceiros/${p.id}/reposicao`}>
                Reposição avulsa
              </Botao>
              <Botao icone="voltar" href={`/parceiros/${p.id}/recolher`}>
                Recolher
              </Botao>
            </>
          )}
          <Botao icone="arquivo" href={`/parceiros/${p.id}/termo`}>
            Termo
          </Botao>
          {(pend.saldo?.aReceber ?? 0) > 0 && (
            <Botao icone="dinheiro" onClick={() => setRecebendo(true)}>
              Receber pendência
            </Botao>
          )}
        </Linha>
      )}

      <Grade colunas={2}>
        <Cartao titulo="No expositor agora" acoes={<Botao pequeno variante="fantasma" href={`/parceiros/${p.id}/mix`}>Mix</Botao>}>
          {estoque.length === 0 ? (
            <p class="muted">{p.instaladoEm ? 'Nenhuma peça no expositor.' : 'Ainda não instalado.'}</p>
          ) : (
            <Resumo
              linhas={[
                ...estoque.map((e) => {
                  const ideal = p.mix.find((m) => m.produtoId === e.produtoId)?.nivelIdeal;
                  return {
                    rotulo: `${nomeProduto(e.produtoId)} · ${formatBRL(precoNoParceiro(p, e.produtoId))}`,
                    valor: (
                      <span class={e.qtd < 0 ? 'txt-ruim' : ''}>
                        {formatQtd(e.qtd)}
                        {ideal != null ? ` / ideal ${ideal}` : ''}
                      </span>
                    ),
                  };
                }),
                { rotulo: 'Total', valor: formatQtd(pecas), destaque: true },
              ]}
            />
          )}
          {exps.length > 0 && <p class="muted" style={{ marginTop: '8px' }}>Expositor: {exps.map((e) => `${e.codigo} (${e.modelo})`).join(', ')}</p>}
        </Cartao>

        <Cartao titulo="Desempenho">
          {des && des.totais.acertos > 0 ? (
            <Resumo
              linhas={[
                { rotulo: 'Unidades vendidas', valor: formatQtd(des.totais.unidades) },
                { rotulo: 'Total vendido', valor: formatBRL(des.totais.brutoCentavos) },
                { rotulo: 'Sua parte', valor: formatBRL(des.totais.suaParteCentavos) },
                { rotulo: 'Média por dia', valor: `${formatNumero(des.totais.mediaPorDia, 2)} peça(s)` },
                { rotulo: 'Giro', valor: formatPct(des.totais.giroPct) },
                { rotulo: 'Mais vendidos', valor: des.maisVendidos.slice(0, 3).map((m) => `${nomeProduto(m.produtoId)} (${m.unidades})`).join(', ') || '—' },
                {
                  rotulo: 'Retorno do expositor',
                  valor:
                    des.retornoExpositor.retorno != null
                      ? `${formatPct(des.retornoExpositor.retorno * 100, 0)} (${formatBRL(des.retornoExpositor.lucroAcumuladoCentavos)} de ${formatBRL(des.retornoExpositor.custoExpositoresCentavos)})`
                      : '—',
                },
              ]}
            />
          ) : (
            <p class="muted">Os números aparecem depois do primeiro acerto.</p>
          )}
        </Cartao>
      </Grade>

      <Cartao titulo="Acertos">
        <Tabela colunas={colAcertos} linhas={acertos} chave={(a) => a.id} onClickLinha={(a) => navegar(`/acertos/${a.id}`)} vazio={<p class="muted">Nenhum acerto ainda.</p>} />
      </Cartao>

      <Cartao titulo="Dados">
        <Resumo
          linhas={[
            { rotulo: 'Responsável', valor: p.responsavel || '—' },
            { rotulo: 'WhatsApp', valor: formatarTelefone(p.whatsapp) || '—' },
            { rotulo: 'Endereço', valor: [p.endereco, p.bairro].filter(Boolean).join(' — ') || '—' },
            { rotulo: 'Divisão', valor: rotuloDivisao(p.pctParceiro) },
            p.percentuais.length > 1 ? { rotulo: 'Histórico da divisão', valor: p.percentuais.map((x) => `${formatData(x.vigenteDesde)}: ${x.pct}%`).join(' · ') } : null,
            { rotulo: 'Acerto', valor: rotuloFrequencia(p.frequenciaDias) },
            { rotulo: 'Quem recebe dos clientes', valor: ROTULO_QUEM_RECEBE[p.quemRecebe] },
            { rotulo: 'Início', valor: formatData(p.dataInicio) },
            { rotulo: 'Instalação', valor: formatData(p.instaladoEm) },
            { rotulo: 'Termo assinado', valor: p.termoAssinado ? `Sim, em ${formatData(p.termoData)}` : 'Não' },
            p.notaRemessa ? { rotulo: 'Nota de remessa', valor: p.notaRemessa } : null,
            p.observacoes ? { rotulo: 'Observações', valor: p.observacoes } : null,
          ]}
        />
        <Linha class="parc-dados-acoes">
          {p.whatsapp && <BotaoWhatsApp numero={p.whatsapp} pequeno />}
          <BotaoMapa p={p} pequeno />
          <Botao pequeno icone="editar" href={`/parceiros/${p.id}/editar`}>
            Editar
          </Botao>
          {!p.arquivado && p.situacao !== 'encerrado' && (
            <Botao pequeno variante="fantasma" onClick={alternarPausa}>
              {p.situacao === 'ativo' ? 'Pausar' : 'Reativar'}
            </Botao>
          )}
          {!p.arquivado && p.situacao === 'encerrado' && (
            <Botao pequeno variante="fantasma" onClick={alternarPausa}>
              Reativar parceria
            </Botao>
          )}
          {!p.arquivado && p.situacao !== 'encerrado' && (
            <Botao pequeno variante="fantasma" icone="sair" href={`/parceiros/${p.id}/encerrar`}>
              Encerrar parceria
            </Botao>
          )}
        </Linha>
      </Cartao>

      {recebendo && <ModalRecebimento parceiroId={p.id} aberto onFechar={() => setRecebendo(false)} maximo={pend.saldo?.aReceber ?? 0} />}
    </Pagina>
  );
}
