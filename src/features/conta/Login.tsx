// Tela de login: a única entrada do app (decisão 109). Sem servidor configurado (nuvem.json vazio e nenhum link de
// outro aparelho), pede antes a URL e a chave pública do projeto Supabase.
import { useState } from 'preact/hooks';
import { NOME_APP } from '../../data/defaults.ts';
import { criarConta, entrar, nuvemFixa, salvarConfigNuvem, useNuvem } from '../../data/nuvem.ts';
import { Aviso, Botao, Campo, Cartao, Logo, Pilha, Texto, avisar } from '../../ui/index.ts';
import './conta.css';

function Servidor() {
  const [url, setUrl] = useState('');
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const ligar = (e: Event) => {
    e.preventDefault();
    setErro(null);
    try {
      salvarConfigNuvem({ url, chave });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form class="formulario" onSubmit={ligar}>
      <p class="muted">
        Primeiro acesso neste aparelho: cole a URL e a chave pública do seu projeto Supabase (botão "Connect" no Supabase).
        Ou abra o link enviado de outro aparelho.
      </p>
      <Campo rotulo="URL do projeto">
        <Texto type="url" value={url} onInput={setUrl} placeholder="https://xxxx.supabase.co" inputMode="url" autoFocus />
      </Campo>
      <Campo rotulo="Chave pública (publishable)" dica="Começa com sb_publishable_. Nunca use a chave secreta">
        <Texto value={chave} onInput={setChave} placeholder="sb_publishable_..." />
      </Campo>
      {erro && <Aviso tom="ruim">{erro}</Aviso>}
      <Botao variante="primario" type="submit" bloco>
        Continuar
      </Botao>
    </form>
  );
}

export function Login() {
  const nuvem = useNuvem();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const enviar = async (e: Event) => {
    e.preventDefault();
    setErro(null);
    setInfo(null);
    if (!email.includes('@')) return setErro('Informe seu e-mail.');
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    setOcupado(true);
    try {
      if (modo === 'entrar') {
        await entrar(email, senha);
        avisar('Bem-vindo de volta!');
      } else {
        const r = await criarConta(email, senha);
        if (r.precisaConfirmar) {
          setInfo('Conta criada. Abra o e-mail de confirmação e depois toque em "Entrar".');
          setModo('entrar');
        } else {
          avisar('Conta criada!');
        }
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div class="conta-fundo">
      <div class="conta-caixa">
        <div class="conta-marca">
          <Logo tamanho={56} />
          <h1>{NOME_APP}</h1>
          <p>Seus dados no celular e no computador.</p>
        </div>
        <Cartao>
          {!nuvem.configurada ? (
            <Servidor />
          ) : (
            <form class="formulario" onSubmit={enviar}>
              <Campo rotulo="E-mail">
                <Texto type="email" value={email} onInput={setEmail} placeholder="voce@exemplo.com" autoFocus inputMode="email" />
              </Campo>
              <Campo rotulo="Senha" dica={modo === 'criar' ? 'Pelo menos 6 caracteres.' : undefined}>
                <Texto type="password" value={senha} onInput={setSenha} />
              </Campo>
              {erro && <Aviso tom="ruim">{erro}</Aviso>}
              {info && <Aviso tom="ok">{info}</Aviso>}
              <Botao variante="primario" type="submit" bloco disabled={ocupado}>
                {ocupado ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
              </Botao>
              <Pilha gap="p">
                <Botao variante="fantasma" bloco onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
                  {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
                </Botao>
                {!nuvemFixa() && (
                  <Botao variante="fantasma" bloco onClick={() => salvarConfigNuvem(null)}>
                    Trocar servidor
                  </Botao>
                )}
              </Pilha>
            </form>
          )}
        </Cartao>
      </div>
    </div>
  );
}
