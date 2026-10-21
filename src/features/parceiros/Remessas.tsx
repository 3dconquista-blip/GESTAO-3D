// "Levar peças" (decisão 93): uma tela só para a instalação (8.4) e a reposição avulsa (8.5). Na primeira vez
// instala (e leva o expositor); depois, repõe. Produto levado que não estava no mix entra nele. Também "Recolher".
// Registrar não abre janela: o aviso traz "Desfazer" (as peças voltam para onde estavam).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { estoqueDoParceiro, nomeProduto, precoNoParceiro, produtosAtivos, saldoCasa, saldoNoParceiro } from '../../data/selectors.ts';
import type { Parceiro } from '../../data/types.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData } from '../../lib/format.ts';
import { pendenciasDoParceiro } from '../../services/acertos.ts';
import { expositoresDoParceiro } from '../../services/expositores.ts';
import {
  desfazerRemessa,
  instalar,
  previaInstalacao,
  previaRecolhimento,
  previaReposicao,
  recolher,
  reposicaoAvulsa,
  type ItemQtd,
  type PreviaMovimento,
} from '../../services/parceiros.ts';
import { Aviso, Botao, Campo, Cartao, Data, Escolha, Linha, MaisDetalhes, Marcador, Numero, Pagina, Texto, Vazio, avisar } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';
import { ParceiroNaoEncontrado } from './comum.tsx';

type Modo = 'levar' | 'recolher';

/** Quantidades iniciais sugeridas. */
function sugestao(p: Parceiro, modo: Modo): Record<string, number> {
  const out: Record<string, number> = {};
  if (modo === 'recolher') {
    for (const e of estoqueDoParceiro(p.id)) if (e.qtd > 0) out[e.produtoId] = 0;
    return out;
  }
  // Parceiro novo, sem mix: mostra os produtos que há em Casa para escolher quanto levar.
  if (!p.mix.length) {
    for (const x of produtosAtivos()) if (saldoCasa(x.id) > 0) out[x.id] = 0;
    return out;
  }
  for (const m of p.mix) {
    const falta = p.instaladoEm ? Math.max(0, m.nivelIdeal - saldoNoParceiro(m.produtoId, p.id)) : m.nivelIdeal;
    out[m.produtoId] = Math.max(0, Math.min(falta, Math.max(0, saldoCasa(m.produtoId))));
  }
  return out;
}

function TelaRemessa({ p, modo }: { p: Parceiro; modo: Modo }) {
  const instalando = modo === 'levar' && !p.instaladoEm;
  const [qtd, setQtd] = useState<Record<string, number>>(() => sugestao(p, modo));
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [exps, setExps] = useState<string[]>(() => (instalando ? expositoresDoParceiro(null).map((e) => e.id).slice(0, 1) : []));
  const [novo, setNovo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const itens: ItemQtd[] = Object.entries(qtd).map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
  const temItem = itens.some((i) => i.quantidade > 0);
  const previa: PreviaMovimento | null = temItem
    ? modo === 'recolher'
      ? previaRecolhimento({ parceiroId: p.id, itens, data, motivo })
      : instalando
        ? previaInstalacao({ parceiroId: p.id, expositorIds: exps, itens, data })
        : previaReposicao({ parceiroId: p.id, itens, data })
    : null;
  const vencida = modo === 'levar' && p.instaladoEm ? pendenciasDoParceiro(p.id).vencida : null;
  const disponiveis = produtosAtivos().filter((x) => !(x.id in qtd));
  const emCasa = expositoresDoParceiro(null);
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const valor = itens.reduce((s, i) => s + i.quantidade * precoNoParceiro(p, i.produtoId), 0);

  const registrar = () => {
    if (!previa || previa.bloqueio || enviando) return;
    setEnviando(true);
    // O que estava antes, para o "Desfazer".
    const antes = { parceiroId: p.id, mixAnterior: p.mix.map((m) => ({ ...m })), instaladoEmAnterior: p.instaladoEm };
    try {
      const res =
        modo === 'recolher'
          ? recolher({ parceiroId: p.id, itens, data, motivo })
          : instalando
            ? instalar({ parceiroId: p.id, expositorIds: exps, itens, data })
            : reposicaoAvulsa({ parceiroId: p.id, itens, data });
      const texto = modo === 'recolher' ? `${res.totalPecas} peça(s) voltaram para Casa` : `${res.totalPecas} peça(s) levadas para ${p.nome}`;
      avisar(texto, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => executar(() => desfazerRemessa({ ...antes, lote: res.lote, expositorIds: instalando ? exps : [] }), 'Desfeito'),
      });
      navegar(instalando ? `/parceiros/${p.id}/termo?instalacao=1` : `/parceiros/${p.id}`);
    } catch (e) {
      setEnviando(false);
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const linhas = Object.keys(qtd).sort((a, b) => nomeProduto(a).localeCompare(nomeProduto(b), 'pt-BR'));
  const resumoDetalhes =
    [instalando ? (exps.length ? exps.map((id) => emCasa.find((e) => e.id === id)?.codigo).filter(Boolean).join(', ') : 'sem expositor') : '', data !== hojeISO() ? formatData(data) : '']
      .filter(Boolean)
      .join(' · ') || undefined;

  return (
    <Pagina titulo={`${modo === 'recolher' ? 'Recolher' : 'Levar peças'} — ${p.nome}`} subtitulo={instalando ? 'Primeira vez: instala o expositor e gera o termo.' : undefined} voltarPara={`/parceiros/${p.id}`} largura="estreita">
      {vencida && vencida.valorCentavos > 0 && (
        <Aviso tom="ruim" titulo="Pendência vencida">
          {formatBRL(vencida.valorCentavos)} em aberto desde {formatData(vencida.desde)}. Confira se quer repor mesmo assim.
        </Aviso>
      )}
      <Cartao titulo={modo === 'recolher' ? 'O que volta para Casa' : 'O que levar de Casa'}>
        {linhas.length === 0 ? (
          <Vazio
            icone="estoque"
            titulo={modo === 'recolher' ? 'Nada no expositor' : 'Nada em Casa'}
            texto={modo === 'recolher' ? 'Não há peças para recolher.' : 'Registre a produção para ter peças em Casa.'}
          />
        ) : (
          linhas.map((id) => {
            const casa = saldoCasa(id);
            const noParceiro = saldoNoParceiro(id, p.id);
            const ideal = p.mix.find((m) => m.produtoId === id)?.nivelIdeal;
            return (
              <div key={id} class="parc-item">
                <div>
                  <strong>{nomeProduto(id)}</strong>
                  <small>
                    {modo === 'recolher' ? `No expositor: ${noParceiro}` : `Em Casa: ${casa}${p.instaladoEm ? ` · no expositor: ${noParceiro}` : ''}${ideal != null ? ` · ideal ${ideal}` : ''}`}
                  </small>
                </div>
                <Numero value={qtd[id]} onChange={(v) => setQtd({ ...qtd, [id]: Math.max(0, v ?? 0) })} decimais={0} min={0} max={modo === 'recolher' ? noParceiro : undefined} stepper />
              </div>
            );
          })
        )}
        {modo === 'levar' && disponiveis.length > 0 && (
          <Linha quebra={false} class="parc-dados-acoes">
            <Escolha value={novo} onChange={setNovo} opcoes={disponiveis.map((x) => ({ valor: x.id, rotulo: `${x.nome} (Casa: ${saldoCasa(x.id)})` }))} placeholder="Levar outro produto" />
            <Botao
              icone="plus"
              disabled={!novo}
              onClick={() => {
                if (novo) setQtd({ ...qtd, [novo]: 1 });
                setNovo(null);
              }}
            >
              Incluir
            </Botao>
          </Linha>
        )}
        {temItem && (
          <p class="acerto-total" style={{ marginTop: '10px' }}>
            {pecas} peça(s) · {formatBRL(valor)} a preço de etiqueta
          </p>
        )}
      </Cartao>

      <MaisDetalhes titulo={instalando ? 'Expositor e data' : modo === 'recolher' ? 'Data e motivo' : 'Data'} resumo={resumoDetalhes}>
        {instalando &&
          (emCasa.length === 0 ? (
            <p class="muted">
              Nenhum expositor em Casa. <a href="#/parceiros/expositores/novo">Cadastrar expositor</a>
            </p>
          ) : (
            emCasa.map((e) => (
              <Marcador key={e.id} checked={exps.includes(e.id)} onChange={(v) => setExps(v ? [...exps, e.id] : exps.filter((x) => x !== e.id))}>
                {e.codigo}
                {e.modelo ? ` — ${e.modelo}` : ''}
              </Marcador>
            ))
          ))}
        <Campo rotulo="Data">
          <Data value={data} onInput={setData} max={hojeISO()} />
        </Campo>
        {modo === 'recolher' && (
          <Campo rotulo="Motivo (opcional)">
            <Texto value={motivo} onInput={setMotivo} placeholder="Ex.: item parado, levar para outro parceiro" />
          </Campo>
        )}
        {previa && !previa.bloqueio && (
          <ul class="confirmacao-itens">
            {previa.itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </MaisDetalhes>
      {previa?.bloqueio && <Aviso tom="ruim">{previa.bloqueio}</Aviso>}

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!previa || !!previa.bloqueio || enviando} onClick={registrar}>
          {modo === 'recolher' ? 'Recolher' : instalando ? 'Levar e gerar o termo' : 'Levar peças'}
        </Botao>
      </div>
    </Pagina>
  );
}

function telaPara(modo: Modo) {
  return function Tela({ params }: TelaProps) {
    useDb();
    const p = db.get('parceiros', params.id);
    if (!p) return <ParceiroNaoEncontrado />;
    return <TelaRemessa key={`${p.id}-${modo}`} p={p} modo={modo} />;
  };
}

export const LevarPecas = telaPara('levar');
export const Recolher = telaPara('recolher');
