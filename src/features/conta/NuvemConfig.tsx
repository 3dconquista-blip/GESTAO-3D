// Bloco "Sincronizar na nuvem" para a tela de Configurações > Dados.
import { useState } from 'preact/hooks';
import { configNuvem, salvarConfigNuvem, sair, sincronizar, useNuvem } from '../../data/nuvem.ts';
import { formatDataHora } from '../../lib/format.ts';
import { Aviso, Botao, Campo, Cartao, Linha, Pilha, Selo, Texto, avisar, confirmar } from '../../ui/index.ts';

const ROTULO_STATUS = {
  desligada: { texto: 'Desligada', tom: 'neutro' },
  sincronizando: { texto: 'Sincronizando...', tom: 'info' },
  ok: { texto: 'Sincronizado', tom: 'ok' },
  offline: { texto: 'Sem internet — envia quando voltar', tom: 'atencao' },
  erro: { texto: 'Erro na sincronização', tom: 'ruim' },
} as const;

export function NuvemConfig() {
  const nuvem = useNuvem();
  const atual = configNuvem();
  const [url, setUrl] = useState(atual?.url ?? '');
  const [chave, setChave] = useState(atual?.chave ?? '');
  const [erro, setErro] = useState<string | null>(null);

  const salvar = () => {
    setErro(null);
    try {
      salvarConfigNuvem({ url, chave });
      avisar('Nuvem configurada. Entre com seu e-mail e senha.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const desligar = async () => {
    const ok = await confirmar({
      titulo: 'Desligar a nuvem?',
      itens: ['Este aparelho para de sincronizar.', 'Os dados continuam aqui e na nuvem.'],
      confirmar: 'Desligar',
      perigo: true,
    });
    if (ok) salvarConfigNuvem(null);
  };

  const status = ROTULO_STATUS[nuvem.status];

  return (
    <Cartao titulo="Sincronizar na nuvem" acoes={nuvem.configurada ? <Selo tom={status.tom}>{status.texto}</Selo> : undefined}>
      {!nuvem.configurada ? (
        <Pilha>
          <p class="muted">
            Para ver os mesmos dados no celular e no computador, crie um projeto gratuito no Supabase, rode o SQL do arquivo
            NUVEM.md e cole aqui a URL e a chave pública (anon key) do projeto.
          </p>
          <Campo rotulo="URL do projeto">
            <Texto type="url" value={url} onInput={setUrl} placeholder="https://xxxx.supabase.co" inputMode="url" />
          </Campo>
          <Campo rotulo="Chave pública (anon key)">
            <Texto value={chave} onInput={setChave} placeholder="eyJhbGciOi..." />
          </Campo>
          {erro && <Aviso tom="ruim">{erro}</Aviso>}
          <Linha>
            <Botao variante="primario" icone="nuvem" onClick={salvar}>
              Ligar a nuvem
            </Botao>
          </Linha>
        </Pilha>
      ) : (
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
          <Linha>
            <Botao variante="primario" icone="atualizar" onClick={() => sincronizar().then(() => avisar('Sincronizado')).catch((e) => avisar(e.message, 'ruim'))}>
              Sincronizar agora
            </Botao>
            <Botao variante="secundario" icone="sair" onClick={() => sair()}>
              Sair da conta
            </Botao>
            <Botao variante="fantasma" onClick={desligar}>
              Desligar a nuvem
            </Botao>
          </Linha>
        </Pilha>
      )}
    </Cartao>
  );
}
