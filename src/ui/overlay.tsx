// Janelas (modal / folha no celular), confirmação com resumo e avisos rápidos (toast).
// Uso imperativo:
//   if (await confirmar({ titulo: 'Registrar produção?', itens: ['15 peças entram em Casa', ...] })) { ... }
//   avisar('Venda registrada', 'ok');
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Botao } from './controls.tsx';
import { Icon } from './Icon.tsx';

export function Modal({ aberto, titulo, onFechar, children, rodape, largura = 'normal' }: {
  aberto: boolean;
  titulo: ComponentChildren;
  onFechar: () => void;
  children?: ComponentChildren;
  rodape?: ComponentChildren;
  largura?: 'normal' | 'larga';
}) {
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', tecla);
    document.body.classList.add('sem-rolagem');
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.classList.remove('sem-rolagem');
    };
  }, [aberto]);
  if (!aberto) return null;
  return (
    <div class="modal-fundo" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div class={`modal modal-${largura}`} role="dialog" aria-modal="true">
        <div class="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" class="btn btn-fantasma btn-icone" onClick={onFechar} aria-label="Fechar">
            <Icon nome="fechar" />
          </button>
        </div>
        <div class="modal-corpo">{children}</div>
        {rodape && <div class="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Confirmação

export interface PedidoConfirmacao {
  titulo: string;
  /** Resumo do que vai acontecer (uma linha por efeito). */
  itens?: ComponentChildren[];
  texto?: ComponentChildren;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
}

type Pendente = PedidoConfirmacao & { resolver: (ok: boolean) => void };
let pendente: Pendente | null = null;
let ouvinteConfirmacao: ((p: Pendente | null) => void) | null = null;

/** Mostra o resumo do que vai acontecer e pede confirmação. */
export function confirmar(p: PedidoConfirmacao): Promise<boolean> {
  return new Promise((resolver) => {
    pendente?.resolver(false);
    pendente = { ...p, resolver };
    if (ouvinteConfirmacao) ouvinteConfirmacao(pendente);
    else resolver(globalThis.confirm ? globalThis.confirm(p.titulo) : true);
  });
}

function HostConfirmacao() {
  const [p, setP] = useState<Pendente | null>(null);
  useEffect(() => {
    ouvinteConfirmacao = setP;
    return () => {
      ouvinteConfirmacao = null;
    };
  }, []);
  if (!p) return null;
  const fechar = (ok: boolean) => {
    p.resolver(ok);
    pendente = null;
    setP(null);
  };
  return (
    <Modal
      aberto
      titulo={p.titulo}
      onFechar={() => fechar(false)}
      rodape={
        <>
          <Botao variante="fantasma" onClick={() => fechar(false)}>
            {p.cancelar ?? 'Voltar'}
          </Botao>
          <Botao variante={p.perigo ? 'perigo' : 'primario'} onClick={() => fechar(true)}>
            {p.confirmar ?? 'Confirmar'}
          </Botao>
        </>
      }
    >
      {p.texto && <div class="confirmacao-texto">{p.texto}</div>}
      {p.itens && p.itens.length > 0 && (
        <ul class="confirmacao-itens">
          {p.itens.map((i, k) => (
            <li key={k}>{i}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Toasts

interface Toast {
  id: number;
  texto: string;
  tom: 'ok' | 'ruim' | 'info' | 'atencao';
  /** Botão no aviso (ex.: "Desfazer"). O aviso com ação fica mais tempo na tela. */
  acao?: { rotulo: string; onClick: () => void };
}
let seq = 0;
let ouvinteToast: ((t: Toast) => void) | null = null;

export function avisar(texto: string, tom: Toast['tom'] = 'ok', acao?: Toast['acao']) {
  const t: Toast = { id: ++seq, texto, tom, acao };
  if (ouvinteToast) ouvinteToast(t);
  else console.log(texto);
}

function HostToasts() {
  const [lista, setLista] = useState<Toast[]>([]);
  useEffect(() => {
    ouvinteToast = (t) => {
      setLista((l) => [...l, t]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== t.id)), t.acao ? 8000 : t.tom === 'ruim' ? 6000 : 3200);
    };
    return () => {
      ouvinteToast = null;
    };
  }, []);
  return (
    <div class="toasts" aria-live="polite">
      {lista.map((t) => (
        <div key={t.id} class={`toast toast-${t.tom}`}>
          <Icon nome={t.tom === 'ok' ? 'check' : t.tom === 'info' ? 'info' : 'alerta'} tamanho={18} />
          <span class="toast-texto">{t.texto}</span>
          {t.acao && (
            <button
              type="button"
              class="toast-acao"
              onClick={() => {
                t.acao?.onClick();
                setLista((l) => l.filter((x) => x.id !== t.id));
              }}
            >
              {t.acao.rotulo}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Coloque uma vez na raiz do app. */
export function HostOverlays() {
  return (
    <>
      <HostConfirmacao />
      <HostToasts />
    </>
  );
}

/** Copia texto para a área de transferência. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    avisar('Texto copiado');
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    avisar(ok ? 'Texto copiado' : 'Não foi possível copiar', ok ? 'ok' : 'ruim');
    return ok;
  }
}

/** Baixa um arquivo gerado no aparelho (backup, CSV). */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/plain;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
