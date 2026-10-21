// Visita de acerto (8.6), enxuta (decisão 94): 3 passos no celular, rascunho salvo no aparelho a cada alteração.
// 1 Contagem (ocorrências em "Mais detalhes") · 2 Reposição · 3 Fechar (valores e pagamento). O estoque só muda ao
// concluir; concluir não abre janela: o aviso traz "Desfazer" (reabre o acerto). O acerto final pede confirmação,
// porque encerra a parceria.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto, produtosAtivos, saldoCasa } from '../../data/selectors.ts';
import type { Parceiro } from '../../data/types.ts';
import { passoDoRascunho, precoMudou, reposicaoSugerida, type LinhaRascunho, type RascunhoAcerto } from '../../domain/acerto.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatNumero, formatPct, formatQtd } from '../../lib/format.ts';
import {
  adicionarItemEncontrado,
  adicionarProdutoNaReposicao,
  apagarRascunho,
  concluirAcerto,
  esperadosDesatualizados,
  lerRascunho,
  montarRascunho,
  pendenciasDoParceiro,
  previaConclusao,
  reabrirUltimoAcerto,
  resultadoDoRascunho,
  salvarRascunho,
  sugerir,
} from '../../services/acertos.ts';
import { Aviso, Botao, Campo, Cartao, Data, Dinheiro, Escolha, Linha, MaisDetalhes, Numero, Pagina, Resumo, Segmentado, Selo, Texto, avisar, confirmar } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';
import { ParceiroNaoEncontrado } from './comum.tsx';

function iniciar(p: Parceiro, final: boolean): RascunhoAcerto {
  const salvo = lerRascunho(p.id);
  if (salvo && !!salvo.final === final) return salvo;
  return salvarRascunho(montarRascunho(p.id, hojeISO(), { final }));
}

export function VisitaAcerto({ params, query }: TelaProps) {
  useDb();
  const p = db.get('parceiros', params.id);
  if (!p) return <ParceiroNaoEncontrado />;
  if (!p.instaladoEm) {
    return (
      <Pagina titulo={`Acerto — ${p.nome}`} voltarPara={`/parceiros/${p.id}`}>
        <Aviso tom="atencao" titulo="Parceiro ainda não instalado" acao={<Botao href={`/parceiros/${p.id}/levar`}>Levar peças</Botao>}>
          Leve as primeiras peças antes do primeiro acerto.
        </Aviso>
      </Pagina>
    );
  }
  return <Visita key={p.id} p={p} final={query.get('final') === '1'} />;
}

function Visita({ p, final }: { p: Parceiro; final: boolean }) {
  const [r, setR] = useState<RascunhoAcerto>(() => iniciar(p, final));
  const [novoEncontrado, setNovoEncontrado] = useState<string | null>(null);
  const [novoMix, setNovoMix] = useState<string | null>(null);
  const [qtdNovoMix, setQtdNovoMix] = useState<number | null>(1);

  const passo = passoDoRascunho(r);
  const ehFinal = !!r.final;
  const PASSOS = ['Contagem', ehFinal ? 'Recolhimento' : 'Reposição', 'Fechar'];
  const atualizar = (novo: RascunhoAcerto, recalcular = true) => setR(salvarRascunho(recalcular ? sugerir(novo) : novo));
  const mudarLinha = (produtoId: string, patch: Partial<LinhaRascunho>, recalcular = true) =>
    atualizar({ ...r, linhas: r.linhas.map((l) => (l.produtoId === produtoId ? { ...l, ...patch } : l)) }, recalcular);
  const irPara = (n: number) => {
    let novo: RascunhoAcerto = { ...r, passo: n, passos3: true };
    // Ao chegar em "Fechar", sugere receber o total de hoje.
    if (n === 3 && r.pagamento.valorCentavos == null) {
      const total = Math.abs(resultadoDoRascunho(r).totalHoje);
      novo = { ...novo, pagamento: { ...r.pagamento, valorCentavos: total } };
    }
    setR(salvarRascunho(novo));
    window.scrollTo(0, 0);
  };

  const res = resultadoDoRascunho(r);
  const desatualizados = esperadosDesatualizados(r);
  const pend = pendenciasDoParceiro(p.id, r.data);
  const errosDa = (i: number) => res.erros.filter((e) => e.indice === i);
  const linhas = r.linhas;
  const temErroOcorrencia = res.erros.some((e) => e.tipo === 'erro' && ['avariados', 'recolhidos', 'faltasAbonadas', 'motivoFalta'].includes(e.campo));
  const ocorrencias = {
    avariados: linhas.reduce((s, l) => s + l.avariados, 0),
    recolhidos: ehFinal ? 0 : linhas.reduce((s, l) => s + l.recolhidos, 0),
    faltas: linhas.reduce((s, l) => s + l.faltasAbonadas, 0),
  };
  const resumoOcorrencias =
    [
      ocorrencias.avariados ? `${ocorrencias.avariados} avariado(s)` : '',
      ocorrencias.recolhidos ? `${ocorrencias.recolhidos} recolhido(s)` : '',
      ocorrencias.faltas ? `${ocorrencias.faltas} falta(s) abonada(s)` : '',
      r.data !== hojeISO() ? `visita em ${formatData(r.data)}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const descartar = async () => {
    if (!(await confirmar({ titulo: 'Descartar este acerto?', itens: ['A contagem salva neste aparelho será apagada.', 'Nada muda no estoque.'], confirmar: 'Descartar', perigo: true }))) return;
    apagarRascunho(p.id);
    navegar(`/parceiros/${p.id}`);
  };

  const recomecar = () => {
    // Remonta com o saldo atual, mantendo o que já foi contado.
    const novo = montarRascunho(p.id, r.data, { final: ehFinal });
    const linhasNovas = novo.linhas.map((l) => {
      const antiga = r.linhas.find((x) => x.produtoId === l.produtoId);
      return antiga ? { ...l, contei: antiga.contei, avariados: antiga.avariados, recolhidos: antiga.recolhidos, faltasAbonadas: antiga.faltasAbonadas, motivoFalta: antiga.motivoFalta, precoUnitCentavos: antiga.precoUnitCentavos } : l;
    });
    atualizar({ ...novo, linhas: linhasNovas, pixDiretoCentavos: r.pixDiretoCentavos, pixEditado: r.pixEditado, pagamento: r.pagamento, passo, passos3: true });
    avisar('Contagem atualizada com o saldo do sistema');
  };

  const concluir = async () => {
    const prev = previaConclusao(r);
    if (prev.bloqueio) return avisar(prev.bloqueio, 'ruim');
    if (ehFinal) {
      const ok = await confirmar({
        titulo: 'Concluir o acerto final e encerrar a parceria?',
        itens: [...prev.itens, 'A parceria é encerrada e os expositores voltam para Casa. Pendências e histórico continuam.'],
        confirmar: 'Concluir e encerrar',
        perigo: true,
      });
      if (!ok) return;
    }
    try {
      const a = concluirAcerto(r);
      if (ehFinal) {
        avisar('Acerto final concluído e parceria encerrada');
      } else {
        avisar(`Acerto concluído · ${res.totalHoje >= 0 ? `recebido ${formatBRL(res.pagoAgora)}` : `repassado ${formatBRL(res.pagoAgora)}`}`, 'ok', {
          rotulo: 'Desfazer',
          onClick: () => {
            if (executar(() => reabrirUltimoAcerto(p.id), 'Acerto reaberto para corrigir')) navegar(`/parceiros/${p.id}/acerto`);
          },
        });
      }
      navegar(`/acertos/${a.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina
      titulo={`${ehFinal ? 'Acerto final' : 'Acerto'} — ${p.nome}`}
      subtitulo={`Período de ${formatData(r.dataAnterior)} a ${formatData(r.data)} · parceiro ${formatNumero(r.pctParceiro, 0)}%`}
      voltarPara={`/parceiros/${p.id}`}
      acoes={
        <Botao variante="fantasma" pequeno icone="lixeira" onClick={descartar}>
          Descartar
        </Botao>
      }
    >
      <div class="acerto-passos" role="tablist">
        {PASSOS.map((nome, i) => (
          <button key={nome} type="button" role="tab" aria-selected={passo === i + 1} class={`acerto-passo ${passo === i + 1 ? 'ativo' : ''}`} onClick={() => irPara(i + 1)}>
            <span>{i + 1}</span>
            <span>{nome}</span>
          </button>
        ))}
      </div>
      <Linha>
        <Selo tom="info">Rascunho salvo neste aparelho</Selo>
        {ehFinal && <Selo tom="atencao">Acerto final: recolhe tudo e encerra a parceria</Selo>}
      </Linha>
      {desatualizados.length > 0 && (
        <Aviso tom="atencao" titulo="O estoque do parceiro mudou desde o início da contagem" acao={<Botao pequeno onClick={recomecar}>Atualizar</Botao>}>
          {desatualizados.slice(0, 3).join('; ')}
        </Aviso>
      )}

      {passo === 1 && (
        <>
          <Cartao titulo="Quantas peças estão no expositor?">
            <div class="pilha pilha-m">
              {linhas.length === 0 && <p class="muted">Nenhuma peça no expositor.</p>}
              {linhas.map((l, i) => {
                const recontar = errosDa(i).some((e) => e.tipo === 'recontar');
                return (
                  <div key={l.produtoId} class="acerto-linha">
                    <div class="acerto-linha-topo">
                      <span>
                        <strong>{nomeProduto(l.produtoId)}</strong>
                        {l.encontrado && <Selo tom="info">encontrado</Selo>}
                      </span>
                      <small class="muted">{formatBRL(l.precoUnitCentavos)}</small>
                    </div>
                    <div class="acerto-contagem">
                      <div class="acerto-esperado">
                        Esperado
                        <strong>{l.esperado}</strong>
                      </div>
                      <Campo rotulo="Contei">
                        <Numero
                          value={l.contei}
                          onChange={(v) => mudarLinha(l.produtoId, { contei: Math.max(0, v ?? 0), recontagemConfirmada: l.encontrado ? true : false })}
                          decimais={0}
                          min={0}
                          stepper
                          tom={recontar ? 'atencao' : l.contei < l.esperado ? undefined : 'ok'}
                        />
                      </Campo>
                    </div>
                    {recontar && (
                      <Aviso tom="atencao" acao={<Botao pequeno onClick={() => mudarLinha(l.produtoId, { recontagemConfirmada: true })}>Recontei, são {l.contei}</Botao>}>
                        "Contei" maior que o "Esperado". Reconte, por favor.
                      </Aviso>
                    )}
                    {l.recontagemConfirmada && l.contei > l.esperado && !l.encontrado && (
                      <small class="muted">Confirmado: {l.contei - l.esperado} a mais vira ajuste de entrada e a linha fica com 0 vendidos.</small>
                    )}
                  </div>
                );
              })}
            </div>
          </Cartao>
          <MaisDetalhes titulo="Ocorrências e data da visita" resumo={resumoOcorrencias} aberto={temErroOcorrencia || undefined}>
            <Campo rotulo="Data da visita">
              <Data value={r.data} min={r.dataAnterior} max={hojeISO()} onInput={(v) => v && atualizar({ ...r, data: v, pagamento: { ...r.pagamento, data: v } }, false)} />
            </Campo>
            <p class="muted">
              <strong>Avariados</strong>: estão lá, mas estragados (viram perda). <strong>Recolhidos</strong>: bons, voltam para Casa.{' '}
              <strong>Faltas abonadas</strong>: sumiram e você decide não cobrar. Falta sem explicação conta como vendida.
            </p>
            {ehFinal && <Aviso tom="info">Acerto final: tudo o que está bom é recolhido automaticamente.</Aviso>}
            {linhas.map((l, i) => {
              const maxFaltas = Math.max(0, l.esperado - l.contei);
              return (
                <div key={l.produtoId} class="acerto-linha">
                  <div class="acerto-linha-topo">
                    <strong>{nomeProduto(l.produtoId)}</strong>
                    <small class="muted">
                      contei {l.contei} de {l.esperado}
                    </small>
                  </div>
                  <div class="acerto-ocorrencias">
                    <Campo rotulo="Avariados">
                      <Numero value={l.avariados} onChange={(v) => mudarLinha(l.produtoId, { avariados: Math.max(0, v ?? 0) })} decimais={0} min={0} max={l.contei} stepper />
                    </Campo>
                    <Campo rotulo="Recolhidos">
                      <Numero value={l.recolhidos} onChange={(v) => mudarLinha(l.produtoId, { recolhidos: Math.max(0, v ?? 0) })} decimais={0} min={0} max={l.contei} stepper disabled={ehFinal} />
                    </Campo>
                    <Campo rotulo="Faltas abonadas">
                      <Numero value={l.faltasAbonadas} onChange={(v) => mudarLinha(l.produtoId, { faltasAbonadas: Math.max(0, v ?? 0) })} decimais={0} min={0} max={maxFaltas} stepper disabled={maxFaltas === 0} />
                    </Campo>
                  </div>
                  {l.faltasAbonadas > 0 && (
                    <Campo rotulo="Motivo da falta abonada" obrigatorio>
                      <Texto value={l.motivoFalta} onInput={(v) => mudarLinha(l.produtoId, { motivoFalta: v }, false)} placeholder="Ex.: caiu atrás do balcão" />
                    </Campo>
                  )}
                  {errosDa(i)
                    .filter((e) => e.tipo === 'erro')
                    .map((e) => (
                      <small key={e.campo} class="txt-ruim">
                        {e.mensagem}
                      </small>
                    ))}
                </div>
              );
            })}
            <Linha quebra={false}>
              <Escolha value={novoEncontrado} onChange={setNovoEncontrado} opcoes={produtosAtivos().map((x) => ({ valor: x.id, rotulo: x.nome }))} placeholder="Item que não estava no sistema" />
              <Botao
                icone="plus"
                disabled={!novoEncontrado}
                onClick={() => {
                  if (novoEncontrado) atualizar(adicionarItemEncontrado(r, novoEncontrado, 1));
                  setNovoEncontrado(null);
                }}
              >
                Adicionar
              </Botao>
            </Linha>
          </MaisDetalhes>
        </>
      )}

      {passo === 2 && (
        <Cartao titulo={ehFinal ? 'Recolhimento' : 'Reposição'}>
          {pend.vencida.valorCentavos > 0 && !ehFinal && (
            <Aviso tom="ruim" titulo="Pendência vencida">
              {formatBRL(pend.vencida.valorCentavos)} em aberto desde {formatData(pend.vencida.desde)}. Quer repor mesmo assim?
            </Aviso>
          )}
          {ehFinal ? (
            <Resumo linhas={res.linhas.map((l) => ({ rotulo: nomeProduto(l.produtoId), valor: `${l.recolhidos} volta(m) para Casa` }))} />
          ) : (
            <>
              <p class="muted">Já vem a sugestão: nível ideal − o que ficou no expositor, limitada ao que há em Casa.</p>
              {res.linhas.map((l) => {
                const ficam = l.contei - l.avariados - l.recolhidos;
                const casa = saldoCasa(l.produtoId) + l.recolhidos;
                const sug = reposicaoSugerida(l, l.nivelIdeal ?? 0, casa);
                return (
                  <div key={l.produtoId} class="acerto-linha">
                    <div class="acerto-linha-topo">
                      <strong>{nomeProduto(l.produtoId)}</strong>
                      <small class="muted">
                        ficam {ficam} · ideal {l.nivelIdeal ?? '—'} · em Casa {casa}
                      </small>
                    </div>
                    <div class="acerto-contagem">
                      <div class="acerto-esperado">
                        Fica
                        <strong>{l.estoqueFinal}</strong>
                      </div>
                      <Campo rotulo="Repor">
                        <Numero value={l.repostos} onChange={(v) => mudarLinha(l.produtoId, { repostos: Math.max(0, v ?? 0), repostosEditado: true })} decimais={0} min={0} max={casa} stepper />
                      </Campo>
                    </div>
                    {sug.falta > 0 && <small class="txt-atencao">Faltam {sug.falta} em Casa para chegar ao nível ideal: vai para "O que imprimir".</small>}
                  </div>
                );
              })}
              <MaisDetalhes titulo="Levar um produto novo">
                <Linha quebra={false}>
                  <Escolha value={novoMix} onChange={setNovoMix} opcoes={produtosAtivos().filter((x) => !r.linhas.some((l) => l.produtoId === x.id)).map((x) => ({ valor: x.id, rotulo: `${x.nome} (Casa: ${saldoCasa(x.id)})` }))} placeholder="Produto" />
                  <Numero value={qtdNovoMix} onChange={setQtdNovoMix} decimais={0} min={1} ariaLabel="Quantidade" />
                  <Botao
                    icone="plus"
                    disabled={!novoMix || !qtdNovoMix}
                    onClick={() => {
                      if (novoMix && qtdNovoMix) atualizar(adicionarProdutoNaReposicao(r, novoMix, qtdNovoMix), false);
                      setNovoMix(null);
                    }}
                  >
                    Incluir
                  </Botao>
                </Linha>
              </MaisDetalhes>
            </>
          )}
          <p class="acerto-total" style={{ marginTop: '10px' }}>
            Ficam {res.estoqueFinalTotal} peças no expositor
          </p>
        </Cartao>
      )}

      {passo === 3 && (
        <>
          <Cartao>
            <div class="formulario">
              <div class="acerto-total">{res.totalHoje >= 0 ? `Total a receber hoje: ${formatBRL(res.totalHoje)}` : `A repassar ao parceiro: ${formatBRL(-res.totalHoje)}`}</div>
              <small class="muted">
                Vendido {formatBRL(res.bruto)} ({formatQtd(res.pecasVendidas)} peça(s)) · sua parte {formatBRL(res.suaParte)} · parceiro {formatBRL(res.parteParceiro)}
                {res.pendenciaAnterior ? ` · pendência anterior ${formatBRL(res.pendenciaAnterior)}` : ''}
              </small>
              {r.quemRecebe !== 'parceiro' && (
                <Campo rotulo="Recebido no seu PIX no período" dica={r.quemRecebe === 'pix_dono' ? 'Começa com o total vendido (os clientes pagam no seu PIX).' : 'Quanto os clientes pagaram direto no seu PIX.'}>
                  <Dinheiro value={r.pixDiretoCentavos} onChange={(v) => atualizar({ ...r, pixDiretoCentavos: v, pixEditado: true })} />
                </Campo>
              )}
              <div class="campos-2">
                <Campo rotulo={res.totalHoje >= 0 ? 'Recebido agora' : 'Pago ao parceiro agora'}>
                  <Dinheiro value={r.pagamento.valorCentavos} onChange={(v) => atualizar({ ...r, pagamento: { ...r.pagamento, valorCentavos: v } }, false)} />
                </Campo>
                <Campo rotulo="Forma">
                  <Segmentado
                    value={r.pagamento.forma}
                    onChange={(v) => atualizar({ ...r, pagamento: { ...r.pagamento, forma: v } }, false)}
                    opcoes={[
                      { valor: 'pix', rotulo: 'PIX' },
                      { valor: 'dinheiro', rotulo: 'Dinheiro' },
                    ]}
                  />
                </Campo>
              </div>
              {res.totalHoje > 0 && res.restante > 0 && <Aviso tom="atencao">Fica {formatBRL(res.restante)} "A receber".</Aviso>}
              {res.totalHoje < 0 && res.restante < 0 && <Aviso tom="atencao">Falta repassar {formatBRL(-res.restante)} ao parceiro.</Aviso>}
              {res.erros.length > 0 && <Aviso tom="ruim">{res.erros[0].mensagem}</Aviso>}
            </div>
          </Cartao>
          <MaisDetalhes titulo="Como chegamos no valor" resumo={`valor do acerto ${formatBRL(res.valorAcerto)}`}>
            {res.linhas.map((l) => (
              <div key={l.produtoId} class="acerto-linha">
                <div class="acerto-linha-topo">
                  <strong>{nomeProduto(l.produtoId)}</strong>
                  <strong>{formatBRL(l.valorCentavos)}</strong>
                </div>
                <div class="acerto-valores">
                  <span>
                    {l.vendidos} vendido(s){l.ajusteEntrada ? ` · +${l.ajusteEntrada} ajuste` : ''}
                    {l.faltasAbonadas ? ` · ${l.faltasAbonadas} abonada(s)` : ''}
                    {l.avariados ? ` · ${l.avariados} avariado(s)` : ''}
                  </span>
                  <div class={precoMudou(l) ? 'acerto-preco-mudou' : ''}>
                    <Dinheiro value={l.precoUnitCentavos} onChange={(v) => mudarLinha(l.produtoId, { precoUnitCentavos: v ?? 0 })} />
                  </div>
                </div>
                {precoMudou(l) && <small class="txt-atencao">Preço mudou desde o último acerto (era {formatBRL(l.precoAnteriorCentavos!)}).</small>}
              </div>
            ))}
            <Resumo
              linhas={[
                { rotulo: 'Total vendido', valor: formatBRL(res.bruto) },
                { rotulo: `Parte do parceiro (${formatNumero(r.pctParceiro, 0)}%)`, valor: formatBRL(res.parteParceiro) },
                { rotulo: `Sua parte (${formatNumero(100 - r.pctParceiro, 0)}%)`, valor: formatBRL(res.suaParte) },
                r.quemRecebe !== 'parceiro' ? { rotulo: 'Recebido no seu PIX', valor: `− ${formatBRL(res.pixDireto)}` } : null,
                { rotulo: 'Valor do acerto', valor: formatBRL(res.valorAcerto), destaque: true, tom: res.valorAcerto < 0 ? 'atencao' : undefined },
                res.pendenciaAnterior ? { rotulo: 'Pendências de acertos anteriores', valor: formatBRL(res.pendenciaAnterior), tom: res.pendenciaAnterior > 0 ? 'ruim' : undefined } : null,
                { rotulo: 'Dias do período', valor: String(res.dias) },
                { rotulo: 'Média por dia', valor: `${formatNumero(res.mediaPorDia, 2)} peça(s)` },
                { rotulo: 'Giro', valor: formatPct(res.giro * 100) },
              ]}
            />
            <Campo rotulo="Data do pagamento">
              <Data value={r.pagamento.data} onInput={(v) => atualizar({ ...r, pagamento: { ...r.pagamento, data: v } }, false)} />
            </Campo>
          </MaisDetalhes>
        </>
      )}

      <div class="barra-acoes-fixa">
        {passo > 1 && (
          <Botao variante="fantasma" icone="voltar" onClick={() => irPara(passo - 1)}>
            Voltar
          </Botao>
        )}
        {passo < 3 ? (
          <Botao variante="primario" onClick={() => irPara(passo + 1)}>
            Próximo: {PASSOS[passo]}
          </Botao>
        ) : (
          <Botao variante="sucesso" icone="check" onClick={concluir}>
            {ehFinal ? 'Concluir e encerrar' : 'Concluir acerto'}
          </Botao>
        )}
      </div>
    </Pagina>
  );
}
