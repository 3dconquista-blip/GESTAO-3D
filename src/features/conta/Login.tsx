// Tela de login (aparece quando a nuvem está configurada e ninguém entrou neste aparelho).
import { useState } from 'preact/hooks';
import { NOME_APP } from '../../data/defaults.ts';
import { criarConta, entrar, salvarConfigNuvem } from '../../data/nuvem.ts';
import { Aviso, Botao, Campo, Cartao, Logo, Pilha, Texto, avisar, confirmar } from '../../ui/index.ts';
import './conta.css';

export function Login() {
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

  const usarSoAparelho = async () => {
    const ok = await confirmar({
      titulo: 'Usar só neste aparelho?',
      itens: ['A sincronização com a nuvem será desligada.', 'Os dados continuam salvos neste aparelho.', 'Lembre de exportar backups.'],
      confirmar: 'Usar só neste aparelho',
    });
    if (ok) salvarConfigNuvem(null);
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
              <Botao variante="fantasma" bloco onClick={usarSoAparelho}>
                Usar só neste aparelho
              </Botao>
            </Pilha>
          </form>
        </Cartao>
      </div>
    </div>
  );
}
