// "Termo de consignação" (8.12): imprimir/PDF, enviar no WhatsApp, copiar e marcar como assinado.
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { formatBRL, formatQtd } from '../../lib/format.ts';
import { registrarTermoAssinado, termoDoParceiro } from '../../services/parceiros.ts';
import { Aviso, Botao, Linha, Pagina, avisar, copiarTexto } from '../../ui/index.ts';
import { BotaoWhatsApp, ParceiroNaoEncontrado } from './comum.tsx';

export function Termo({ params, query }: TelaProps) {
  useDb();
  const p = db.get('parceiros', params.id);
  if (!p) return <ParceiroNaoEncontrado />;
  const termo = termoDoParceiro(p.id, { data: p.instaladoEm ?? undefined });
  const recemInstalado = query.get('instalacao') === '1';
  return (
    <Pagina
      titulo="Termo de consignação"
      subtitulo={p.nome}
      voltarPara={`/parceiros/${p.id}`}
      acoes={
        <Botao variante="primario" icone="baixar" onClick={() => window.print()}>
          Imprimir / PDF
        </Botao>
      }
    >
      {recemInstalado && <Aviso tom="ok" titulo="Instalação registrada">Imprima ou envie o termo para o parceiro assinar.</Aviso>}
      <Linha class="nao-imprimir">
        <BotaoWhatsApp numero={p.whatsapp} texto={termo.textoPlano}>
          Enviar no WhatsApp
        </BotaoWhatsApp>
        <Botao icone="copiar" onClick={() => copiarTexto(termo.textoPlano)}>
          Copiar texto
        </Botao>
        {(!p.termoAssinado || p.lembrarReimprimirTermo) && (
          <Botao
            icone="check"
            onClick={() => {
              registrarTermoAssinado(p.id);
              avisar('Termo marcado como assinado');
            }}
          >
            Marcar como assinado
          </Botao>
        )}
      </Linha>
      <article class="termo">
        <h1>{termo.titulo}</h1>
        {termo.secoes.map((s) => (
          <section key={s.chave}>
            <h2>{s.titulo}</h2>
            {s.chave === 'itens' ? (
              <>
                {termo.itens.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th class="al-dir">Qtd.</th>
                        <th class="al-dir">Preço de etiqueta</th>
                        <th class="al-dir">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {termo.itens.map((i) => (
                        <tr key={i.nome}>
                          <td>{i.nome}</td>
                          <td class="al-dir">{formatQtd(i.quantidade)}</td>
                          <td class="al-dir">{formatBRL(i.precoCentavos)}</td>
                          <td class="al-dir">{formatBRL(i.valorCentavos)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td class="al-dir">
                          <strong>{formatQtd(termo.totalPecas)}</strong>
                        </td>
                        <td />
                        <td class="al-dir">
                          <strong>{formatBRL(termo.totalCentavos)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  s.paragrafos.map((t) => <p key={t}>{t}</p>)
                )}
              </>
            ) : s.chave === 'assinaturas' ? null : (
              s.paragrafos.map((t) => <p key={t}>{t}</p>)
            )}
          </section>
        ))}
        <p style={{ marginTop: '18px' }}>{termo.localData}</p>
        <div class="termo-assinaturas">
          {termo.assinaturas.map((a) => (
            <div key={a.parte} class="termo-assinatura">
              {a.nome}
              {a.responsavel ? ` — ${a.responsavel}` : ''}
            </div>
          ))}
        </div>
        <p class="termo-rodape">{termo.rodape}</p>
      </article>
    </Pagina>
  );
}
