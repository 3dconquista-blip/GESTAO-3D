// Casca do app: menu lateral (computador), barra inferior (celular), botão "+", aviso de backup.
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { NOME_APP } from '../data/defaults.ts';
import { useDb } from '../data/hooks.ts';
import { useNuvem } from '../data/nuvem.ts';
import { HostOverlays, Icon, Logo, Carregando, Botao } from '../ui/index.ts';
import { useLocal } from './router.ts';
import { ACOES_RAPIDAS, MENU, resolverRota, type Secao } from './routes.tsx';
import { Onboarding } from '../features/onboarding/Onboarding.tsx';
import { Login } from '../features/conta/Login.tsx';
import { baixarBackupAgora } from '../features/config/ConfigDados.tsx';
import { adiarLembreteBackup, lembreteBackupAtual } from '../services/backup.ts';

class LimiteErro extends Component<{ chave: string; children: ComponentChildren }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  componentDidCatch(erro: Error) {
    console.error(erro);
    this.setState({ erro });
  }
  componentDidUpdate(anterior: { chave: string }) {
    if (anterior.chave !== this.props.chave && this.state.erro) this.setState({ erro: null });
  }
  render() {
    if (this.state.erro) {
      return (
        <div class="pagina">
          <div class="aviso aviso-ruim">
            <Icon nome="alerta" />
            <div class="aviso-texto">
              <strong>Algo deu errado nesta tela.</strong>
              <div>{this.state.erro.message}</div>
            </div>
          </div>
          <p>
            <Botao href="/" variante="primario">
              Voltar ao início
            </Botao>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function MenuLateral({ secao, empresa }: { secao: Secao | null; empresa: string }) {
  return (
    <aside class="menu-lateral">
      <a class="marca" href="#/">
        <Logo tamanho={36} />
        <span>{empresa}</span>
      </a>
      <BotaoNovo lateral />
      <nav>
        {MENU.map((m) => (
          <a key={m.secao} href={`#${m.href}`} class={`menu-item ${secao === m.secao ? 'ativo' : ''}`}>
            <Icon nome={m.icone} />
            <span>{m.rotulo}</span>
          </a>
        ))}
      </nav>
      <div class="menu-sub">
        <a href="#/venda">Venda rápida</a>
        <a href="#/vendas">Vendas</a>
        <a href="#/clientes">Clientes</a>
        <a href="#/relatorios">Relatórios</a>
        <a href="#/config">Configurações</a>
      </div>
    </aside>
  );
}

function BarraInferior({ secao }: { secao: Secao | null }) {
  return (
    <nav class="barra-inferior">
      {MENU.map((m) => (
        <a key={m.secao} href={`#${m.href}`} class={`barra-item ${secao === m.secao ? 'ativo' : ''}`}>
          <Icon nome={m.icone} />
          <span>{m.rotulo}</span>
        </a>
      ))}
    </nav>
  );
}

function BotaoNovo({ lateral }: { lateral?: boolean }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const fechar = () => setAberto(false);
    window.addEventListener('hashchange', fechar);
    return () => window.removeEventListener('hashchange', fechar);
  }, []);
  return (
    <>
      <button type="button" class={lateral ? 'btn btn-primario btn-bloco novo-lateral' : 'fab'} onClick={() => setAberto(!aberto)} aria-label="Ações rápidas" aria-expanded={aberto}>
        <Icon nome={aberto && !lateral ? 'fechar' : 'plus'} tamanho={lateral ? 20 : 28} />
        {lateral && <span>Novo</span>}
      </button>
      {aberto && (
        <div class={`acoes-rapidas-fundo ${lateral ? 'lateral' : ''}`} onClick={() => setAberto(false)}>
          <div class="acoes-rapidas" onClick={(e) => e.stopPropagation()}>
            {ACOES_RAPIDAS.map((a) => (
              <a key={a.href} href={`#${a.href}`} class="acao-rapida" onClick={() => setAberto(false)}>
                <span class="acao-rapida-icone">
                  <Icon nome={a.icone} />
                </span>
                {a.rotulo}
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Lembrete de backup (decisão 105): sem a nuvem, aparece só quando o último backup tem 7 dias ou mais (ou nunca
 * houve), com "Baixar backup" em um toque e "Depois" (volta em 7 dias). Com a nuvem ligada, não aparece.
 */
function AvisoBackup() {
  const nuvem = useNuvem();
  const [, setVersao] = useState(0);
  const l = lembreteBackupAtual(nuvem.configurada);
  if (!l.mostrar) return null;
  const atualizar = () => setVersao((v) => v + 1);
  return (
    <div class="aviso-backup">
      <Icon nome="alerta" tamanho={16} />
      <span>{l.dias == null ? 'Seus dados estão só neste aparelho e ainda não têm backup.' : `Último backup há ${l.dias} dias.`}</span>
      <button type="button" class="aviso-backup-acao" onClick={() => baixarBackupAgora().then(atualizar)}>
        Baixar backup
      </button>
      <button
        type="button"
        class="aviso-backup-depois"
        onClick={() => {
          adiarLembreteBackup();
          atualizar();
        }}
      >
        Depois
      </button>
    </div>
  );
}

export function App() {
  const db = useDb();
  const nuvem = useNuvem();
  const local = useLocal();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [local.caminho]);

  if (!db.pronto) return <Carregando texto="Abrindo o 3D gestão..." />;
  if (nuvem.configurada && !nuvem.logado) return <><Login /><HostOverlays /></>;
  if (!db.config.onboardingConcluido) return <><Onboarding /><HostOverlays /></>;

  const achada = resolverRota(local.caminho);
  const secao = achada?.rota.secao ?? null;
  const Tela = achada?.rota.tela;

  return (
    <div class="app">
      <MenuLateral secao={secao} empresa={db.config.empresa.nome || NOME_APP} />
      <main class="principal">
        <AvisoBackup />
        <LimiteErro chave={local.caminho}>
          {Tela ? (
            // key: trocar de caminho remonta a tela (ex.: de "editar pedido" para "novo pedido" não herda o estado).
            <Tela key={local.caminho} params={achada!.params} query={local.query} />
          ) : (
            <div class="pagina">
              <h1>Página não encontrada</h1>
              <Botao href="/" variante="primario">
                Voltar ao início
              </Botao>
            </div>
          )}
        </LimiteErro>
      </main>
      <BarraInferior secao={secao} />
      <div class="fab-wrap">
        <BotaoNovo />
      </div>
      <HostOverlays />
    </div>
  );
}
