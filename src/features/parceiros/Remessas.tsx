// Telas de remessa e recolhimento: Instalação (8.4), Reposição avulsa (8.5) e Recolher.
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
  instalar,
  previaInstalacao,
  previaRecolhimento,
  previaReposicao,
  recolher,
  reposicaoAvulsa,
  type ItemQtd,
  type PreviaMovimento,
} from '../../services/parceiros.ts';
import { Aviso, Botao, Campo, Cartao, Data, Escolha, Linha, Marcador, Numero, Pagina, Texto, Vazio, avisar, confirmar } from '../../ui/index.ts';
import { ParceiroNaoEncontrado } from './comum.tsx';

type Modo = 'instalacao' | 'reposicao' | 'recolher';

const TITULO: Record<Modo, string> = { instalacao: 'Instalação', reposicao: 'Reposição avulsa', recolher: 'Recolher' };

/** Quantidades iniciais sugeridas para cada modo. */
function sugestao(p: Parceiro, modo: Modo): Record<string, number> {
  const out: Record<string, number> = {};
  if (modo === 'recolher') {
    for (const e of estoqueDoParceiro(p.id)) if (e.qtd > 0) out[e.produtoId] = 0;
    return out;
  }
  for (const m of p.mix) {
    const falta = modo === 'instalacao' ? m.nivelIdeal : Math.max(0, m.nivelIdeal - saldoNoParceiro(m.produtoId, p.id));
    out[m.produtoId] = Math.max(0, Math.min(falta, Math.max(0, saldoCasa(m.produtoId))));
  }
  return out;
}

function TelaRemessa({ p, modo }: { p: Parceiro; modo: Modo }) {
  const [qtd, setQtd] = useState<Record<string, number>>(() => sugestao(p, modo));
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [exps, setExps] = useState<string[]>(() => expositoresDoParceiro(null).map((e) => e.id).slice(0, 1));
  const [novo, setNovo] = useState<string | null>(null);
  const itens: ItemQtd[] = Object.entries(qtd).map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
  const temItem = itens.some((i) => i.quantidade > 0);
  const previa: PreviaMovimento | null = temItem
    ? modo === 'instalacao'
      ? previaInstalacao({ parceiroId: p.id, expositorIds: exps, itens, data })
      : modo === 'reposicao'
        ? previaReposicao({ parceiroId: p.id, itens, data })
        : previaRecolhimento({ parceiroId: p.id, itens, data, motivo })
    : null;
  const vencida = modo === 'reposicao' ? pendenciasDoParceiro(p.id).vencida : null;
  const disponiveis = produtosAtivos().filter((x) => !(x.id in qtd));
  const emCasa = expositoresDoParceiro(null);

  const confirmarTudo = async () => {
    if (!previa || previa.bloqueio) return;
    const itensConfirmacao = [...previa.itens];
    if (vencida && vencida.valorCentavos > 0) itensConfirmacao.unshift(`Atenção: pendência vencida de ${formatBRL(vencida.valorCentavos)} desde ${formatData(vencida.desde)}. Repor mesmo assim?`);
    if (!(await confirmar({ titulo: previa.titulo, itens: itensConfirmacao, confirmar: TITULO[modo] }))) return;
    try {
      if (modo === 'instalacao') {
        instalar({ parceiroId: p.id, expositorIds: exps, itens, data });
        avisar('Instalação registrada');
        navegar(`/parceiros/${p.id}/termo?instalacao=1`);
      } else if (modo === 'reposicao') {
        reposicaoAvulsa({ parceiroId: p.id, itens, data });
        avisar('Reposição registrada');
        navegar(`/parceiros/${p.id}`);
      } else {
        recolher({ parceiroId: p.id, itens, data, motivo });
        avisar('Recolhimento registrado');
        navegar(`/parceiros/${p.id}`);
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const linhas = Object.keys(qtd).sort((a, b) => nomeProduto(a).localeCompare(nomeProduto(b), 'pt-BR'));

  return (
    <Pagina titulo={`${TITULO[modo]} — ${p.nome}`} voltarPara={`/parceiros/${p.id}`} largura="estreita">
      {modo === 'instalacao' && p.instaladoEm && <Aviso tom="info">Este parceiro já foi instalado em {formatData(p.instaladoEm)}. Esta remessa entra como mais uma instalação (ex.: novo expositor).</Aviso>}
      {vencida && vencida.valorCentavos > 0 && (
        <Aviso tom="ruim" titulo="Pendência vencida">
          {formatBRL(vencida.valorCentavos)} em aberto desde {formatData(vencida.desde)}. Confira se quer repor mesmo assim.
        </Aviso>
      )}
      {modo === 'instalacao' && (
        <Cartao titulo="Expositor">
          {emCasa.length === 0 && exps.length === 0 ? (
            <p class="muted">
              Nenhum expositor em Casa. <a href="#/parceiros/expositores/novo">Cadastrar expositor</a>
            </p>
          ) : (
            emCasa.map((e) => (
              <Marcador key={e.id} checked={exps.includes(e.id)} onChange={(v) => setExps(v ? [...exps, e.id] : exps.filter((x) => x !== e.id))}>
                {e.codigo} — {e.modelo || 'Expositor'}
              </Marcador>
            ))
          )}
        </Cartao>
      )}
      <Cartao titulo={modo === 'recolher' ? 'O que volta para Casa' : 'O que levar de Casa'}>
        {linhas.length === 0 ? (
          <Vazio
            icone="estoque"
            titulo={modo === 'recolher' ? 'Nada no expositor' : 'Mix vazio'}
            texto={modo === 'recolher' ? 'Não há peças para recolher.' : 'Monte o mix do parceiro ou adicione produtos abaixo.'}
          />
        ) : (
          linhas.map((id) => {
            const casa = saldoCasa(id);
            const noParceiro = saldoNoParceiro(id, p.id);
            const ideal = p.mix.find((m) => m.produtoId === id)?.nivelIdeal;
            const max = modo === 'recolher' ? noParceiro : undefined;
            return (
              <div key={id} class="parc-item">
                <div>
                  <strong>{nomeProduto(id)}</strong>
                  <small>
                    {modo === 'recolher' ? `No expositor: ${noParceiro}` : `Em Casa: ${casa} · no expositor: ${noParceiro}${ideal != null ? ` · ideal ${ideal}` : ''}`} · {formatBRL(precoNoParceiro(p, id))}
                  </small>
                </div>
                <Numero value={qtd[id]} onChange={(v) => setQtd({ ...qtd, [id]: Math.max(0, v ?? 0) })} decimais={0} min={0} max={max} stepper />
              </div>
            );
          })
        )}
        {modo !== 'recolher' && (
          <Linha quebra={false} class="parc-dados-acoes">
            <Escolha value={novo} onChange={setNovo} opcoes={disponiveis.map((x) => ({ valor: x.id, rotulo: x.nome }))} placeholder="Incluir outro produto" />
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
      </Cartao>
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
          {modo === 'recolher' && (
            <Campo rotulo="Motivo (opcional)">
              <Texto value={motivo} onInput={setMotivo} placeholder="Ex.: item parado, levar para outro parceiro" />
            </Campo>
          )}
        </div>
      </Cartao>
      {previa?.bloqueio && <Aviso tom="ruim">{previa.bloqueio}</Aviso>}
      {previa && !previa.bloqueio && (
        <Cartao titulo="Resumo">
          <ul class="confirmacao-itens">
            {previa.itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Cartao>
      )}
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!previa || !!previa.bloqueio} onClick={confirmarTudo}>
          {modo === 'instalacao' ? 'Instalar e gerar termo' : `Registrar ${TITULO[modo].toLowerCase()}`}
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

export const Instalacao = telaPara('instalacao');
export const ReposicaoAvulsa = telaPara('reposicao');
export const Recolher = telaPara('recolher');
