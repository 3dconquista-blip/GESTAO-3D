// "Agenda de acertos" (8.8): parceiros ativos ordenados pelo vencimento.
import type { TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { TOM_STATUS_AGENDA, textoVencimento } from '../../domain/agenda.ts';
import { formatBRL, formatData, formatQtd } from '../../lib/format.ts';
import { lerRascunho, pendenciasDoParceiro, resumoPendencias } from '../../services/acertos.ts';
import { agendaAtual } from '../../services/consultas.ts';
import { Aviso, Botao, Cartao, Indicador, Pagina, Selo, Vazio } from '../../ui/index.ts';
import { BotaoMapa, ParceirosAbas, descricaoParceiro } from './comum.tsx';

export function AgendaAcertos(_props: TelaProps) {
  useDb();
  const cartoes = agendaAtual();
  const pend = resumoPendencias();
  const atrasados = cartoes.filter((c) => c.status === 'atrasado').length;
  return (
    <Pagina
      titulo="Parceiros"
      acoes={
        <Botao variante="primario" icone="plus" href="/parceiros/novo">
          Novo parceiro
        </Botao>
      }
    >
      <ParceirosAbas ativa="agenda" />
      <div class="indicadores">
        <Indicador rotulo="Acertos atrasados" valor={String(atrasados)} tom={atrasados ? 'ruim' : 'ok'} />
        <Indicador rotulo="A receber dos parceiros" valor={formatBRL(pend.aReceber)} tom={pend.aReceber ? 'atencao' : undefined} />
        {pend.aPagar > 0 && <Indicador rotulo="A repassar aos parceiros" valor={formatBRL(pend.aPagar)} />}
      </div>
      {pend.vencidas.map((v) => (
        <Aviso key={v.parceiro.id} tom="ruim" titulo={`Pendência vencida: ${v.parceiro.nome}`} acao={<Botao pequeno href={`/parceiros/${v.parceiro.id}`}>Ver</Botao>}>
          {formatBRL(v.vencida.valorCentavos)} em aberto desde {formatData(v.vencida.desde)}.
        </Aviso>
      ))}
      {cartoes.length === 0 ? (
        <Vazio
          icone="parceiros"
          titulo="Nenhum parceiro ativo na agenda"
          texto="Cadastre um parceiro (academia, loja...), instale o expositor e a agenda mostra quando visitar para fazer o acerto."
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
                    <Selo tom={tom}>{textoVencimento(c.diasParaVencer)}</Selo>
                  </div>
                  <div class="agenda-numeros">
                    <span>
                      Próximo acerto<strong>{formatData(c.proximoAcerto)}</strong>
                    </span>
                    <span>
                      Última visita<strong>{c.diasDesdeUltimaVisita != null ? `há ${c.diasDesdeUltimaVisita} dia(s)` : '—'}</strong>
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
                  {rascunho && <Selo tom="info">Acerto em andamento neste aparelho</Selo>}
                  <div class="agenda-acoes">
                    {c.status === 'sem_instalacao' ? (
                      <Botao variante="primario" icone="estoque" href={`/parceiros/${p.id}/instalacao`}>
                        Instalar expositor
                      </Botao>
                    ) : (
                      <Botao variante="primario" icone="check" href={`/parceiros/${p.id}/acerto`}>
                        {rascunho ? 'Continuar acerto' : 'Iniciar acerto'}
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
    </Pagina>
  );
}
