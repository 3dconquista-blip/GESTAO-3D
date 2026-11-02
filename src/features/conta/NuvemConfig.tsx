// Bloco "Sincronizar na nuvem" para a tela de Configurações > Dados (o app só abre com login: decisão 109).
import { NOME_APP } from '../../data/defaults.ts';
import { linkConfiguracao, sair, sincronizar, useNuvem } from '../../data/nuvem.ts';
import { linkWhatsApp } from '../../domain/whatsapp.ts';
import { formatDataHora } from '../../lib/format.ts';
import { Aviso, Botao, Cartao, Icon, Linha, Pilha, Selo, avisar, copiarTexto } from '../../ui/index.ts';

const ROTULO_STATUS = {
  desligada: { texto: 'Desligada', tom: 'neutro' },
  sincronizando: { texto: 'Sincronizando...', tom: 'info' },
  ok: { texto: 'Sincronizado', tom: 'ok' },
  offline: { texto: 'Sem internet — envia quando voltar', tom: 'atencao' },
  erro: { texto: 'Erro na sincronização', tom: 'ruim' },
} as const;

export function NuvemConfig() {
  const nuvem = useNuvem();
  const status = ROTULO_STATUS[nuvem.status];
  // O link só faz sentido quando o app está publicado (no localhost ele não abre em outro aparelho).
  const link = !/localhost|127\.0\.0\.1/.test(location.hostname) ? linkConfiguracao(location.href) : null;

  return (
    <Cartao titulo="Sincronizar na nuvem" acoes={<Selo tom={status.tom}>{status.texto}</Selo>}>
      <Pilha>
        <p>
          Conta: <strong>{nuvem.email ?? '—'}</strong>
          <br />
          <small>
            Última sincronização: {formatDataHora(nuvem.ultimaSincronizacao)}
            {nuvem.pendentes > 0 && ` · ${nuvem.pendentes} alteração(ões) para enviar`}
          </small>
        </p>
        {nuvem.erro && <Aviso tom="ruim">{nuvem.erro}</Aviso>}
        {link && (
          <div class="nuvem-link">
            <strong>Usar em outro aparelho</strong>
            <small class="muted">
              Abra este link no celular ou no outro computador: o app já abre ligado a esta nuvem e só pede o seu e-mail e a
              senha.
            </small>
            <Linha>
              <Botao pequeno icone="copiar" onClick={() => copiarTexto(link).then((ok) => avisar(ok ? 'Link copiado' : 'Não deu para copiar', ok ? 'ok' : 'ruim'))}>
                Copiar link
              </Botao>
              <a class="btn btn-secundario btn-sm" href={linkWhatsApp('', `Link do ${NOME_APP}: ${link}`)} target="_blank" rel="noopener">
                <Icon nome="whatsapp" tamanho={18} />
                Mandar pelo WhatsApp
              </a>
            </Linha>
          </div>
        )}
        <Linha>
          <Botao variante="primario" icone="atualizar" onClick={() => sincronizar().then(() => avisar('Sincronizado')).catch((e) => avisar(e.message, 'ruim'))}>
            Sincronizar agora
          </Botao>
          <Botao variante="secundario" icone="sair" onClick={() => sair()}>
            Sair da conta
          </Botao>
        </Linha>
      </Pilha>
    </Cartao>
  );
}
