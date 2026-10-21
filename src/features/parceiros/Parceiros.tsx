// "Parceiros" (decisão 95): uma tela só no lugar das 3 abas. À vista, a agenda de acertos dos parceiros ativos
// (8.8), pelo vencimento; os outros parceiros (pausados, encerrados, arquivados) e os expositores ficam em
// "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Parceiro } from '../../data/types.ts';
import { TOM_STATUS_AGENDA, textoVencimento } from '../../domain/agenda.ts';
import { rotuloDivisao } from '../../domain/termo.ts';
import { combinaBusca, formatBRL, formatData, formatQtd } from '../../lib/format.ts';
import { lerRascunho, pendenciasDoParceiro, resumoPendencias } from '../../services/acertos.ts';
import { agendaAtual } from '../../services/consultas.ts';
import { Aviso, Botao, Busca, Cartao, Indicador, Linha, MaisDetalhes, Pagina, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { BotaoMapa, SeloSituacao, descricaoParceiro } from './comum.tsx';

export function TelaParceiros(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const cartoes = agendaAtual();
  const pend = resumoPendencias();
  const atrasados = cartoes.filter((c) => c.status === 'atrasado').length;
  const todos = db.all('parceiros');
  const outros = todos
    .filter((p) => p.arquivado || p.situacao !== 'ativo')
    .filter((p) => combinaBusca(busca, p.nome, p.bairro, p.responsavel))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const totalOutros = todos.filter((p) => p.arquivado || p.situacao !== 'ativo').length;
  const exps = db.all('expositores').filter((e) => !e.arquivado);
  const expsEmCasa = exps.filter((e) => !e.parceiroId && e.estado !== 'perdido').length;

  const colunas: Coluna<Parceiro>[] = [
    {
      id: 'nome',
      rotulo: 'Parceiro',
      principal: true,
      render: (p) => (
        <span class="est-nome-textos">
          <strong>{p.nome}</strong>
          <small>{descricaoParceiro(p)}</small>
        </span>
      ),
    },
    { id: 'divisao', rotulo: 'Divisão', render: (p) => rotuloDivisao(p.pctParceiro), esconderNoCelular: true },
    {
      id: 'receber',
      rotulo: 'A receber',
      alinhar: 'dir',
      render: (p) => {
        const v = pendenciasDoParceiro(p.id).saldo?.aReceber ?? 0;
        return v ? <span class="txt-ruim negrito">{formatBRL(v)}</span> : '—';
      },
    },
    { id: 'situacao', rotulo: 'Situação', render: (p) => <SeloSituacao p={p} /> },
  ];

  return (
    <Pagina
      titulo="Parceiros"
      acoes={
        <Botao variante="primario" icone="plus" href="/parceiros/novo">
          Novo parceiro
        </Botao>
      }
    >
      {cartoes.length > 0 && (
        <div class="indicadores">
          <Indicador rotulo="Acertos atrasados" valor={String(atrasados)} tom={atrasados ? 'ruim' : 'ok'} />
          <Indicador rotulo="A receber dos parceiros" valor={formatBRL(pend.aReceber)} tom={pend.aReceber ? 'atencao' : undefined} />
          {pend.aPagar > 0 && <Indicador rotulo="A repassar aos parceiros" valor={formatBRL(pend.aPagar)} />}
        </div>
      )}
      {pend.vencidas.map((v) => (
        <Aviso key={v.parceiro.id} tom="ruim" titulo={`Pendência vencida: ${v.parceiro.nome}`} acao={<Botao pequeno href={`/parceiros/${v.parceiro.id}`}>Ver</Botao>}>
          {formatBRL(v.vencida.valorCentavos)} em aberto desde {formatData(v.vencida.desde)}.
        </Aviso>
      ))}
      {cartoes.length === 0 ? (
        <Vazio
          icone="parceiros"
          titulo="Nenhum parceiro ativo"
          texto="Parceiros são academias, lojas e outros lugares onde você deixa um expositor com seus produtos e divide o que vender. Cadastre um e leve as peças: a agenda mostra quando voltar para o acerto."
          acao={{ rotulo: 'Cadastrar parceiro', href: '/parceiros/novo' }}
        />
      ) : (
        <div class="agenda">
          {cartoes.map((c) => {
            const p = c.parceiro;
            const pendencia = pendenciasDoParceiro(p.id).saldo?.aReceber ?? 0;
            const rascunho = lerRascunho(p.id);
            const tom = TOM_STATUS_AGENDA[c.status];
            return (
              <Cartao key={p.id} tom={tom === 'neutro' ? undefined : tom}>
                <div class="agenda-cartao">
                  <div class="agenda-topo">
                    <div>
                      <h3>
                        <a href={`#/parceiros/${p.id}`}>{p.nome}</a>
                      </h3>
                      <small>{descricaoParceiro(p)}</small>
                    </div>
                    <Selo tom={tom}>{c.status === 'sem_instalacao' ? 'Levar as primeiras peças' : textoVencimento(c.diasParaVencer)}</Selo>
                  </div>
                  {c.status !== 'sem_instalacao' && (
                    <div class="agenda-numeros">
                      <span>
                        Próximo acerto<strong>{formatData(c.proximoAcerto)}</strong>
                      </span>
                      <span>
                        Peças no expositor<strong>{formatQtd(c.pecasNoExpositor)}</strong>
                      </span>
                      <span>
                        Último valor<strong>{c.ultimoValorCentavos != null ? formatBRL(c.ultimoValorCentavos) : '—'}</strong>
                      </span>
                      {pendencia > 0 && (
                        <span class="txt-ruim">
                          Pendência<strong class="txt-ruim">{formatBRL(pendencia)}</strong>
                        </span>
                      )}
                    </div>
                  )}
                  {rascunho && <Selo tom="info">Acerto em andamento neste aparelho</Selo>}
                  <div class="agenda-acoes">
                    {c.status === 'sem_instalacao' ? (
                      <Botao variante="primario" icone="estoque" href={`/parceiros/${p.id}/levar`}>
                        Levar peças
                      </Botao>
                    ) : (
                      <Botao variante="primario" icone="check" href={`/parceiros/${p.id}/acerto`}>
                        {rascunho ? 'Continuar acerto' : 'Fazer acerto'}
                      </Botao>
                    )}
                    <BotaoMapa p={p} />
                  </div>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      {totalOutros > 0 && (
        <MaisDetalhes titulo="Outros parceiros" resumo={`${totalOutros} pausado(s), encerrado(s) ou arquivado(s)`}>
          <Busca value={busca} onInput={setBusca} placeholder="Buscar parceiro, bairro ou responsável..." />
          <Tabela colunas={colunas} linhas={outros} chave={(p) => p.id} onClickLinha={(p) => navegar(`/parceiros/${p.id}`)} vazio={<p class="muted">Nenhum parceiro encontrado.</p>} />
        </MaisDetalhes>
      )}
      <MaisDetalhes titulo="Expositores" resumo={exps.length ? `${exps.length} expositor(es) · ${expsEmCasa} em Casa` : 'nenhum cadastrado'}>
        <Linha>
          <Botao href="/parceiros/expositores">Ver expositores</Botao>
          <Botao variante="fantasma" icone="plus" href="/parceiros/expositores/novo">
            Novo expositor
          </Botao>
        </Linha>
      </MaisDetalhes>
    </Pagina>
  );
}
