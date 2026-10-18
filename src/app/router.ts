// Roteador por hash: '#/estoque/produtos/abc?aba=custo'.
import { useEffect, useState } from 'preact/hooks';

export interface LocalAtual {
  caminho: string;
  query: URLSearchParams;
}

/** Props recebidas por toda tela. */
export interface TelaProps {
  params: Record<string, string>;
  query: URLSearchParams;
}

export function lerLocal(): LocalAtual {
  const hash = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
  const [caminho, qs] = (hash || '/').split('?');
  return { caminho: caminho || '/', query: new URLSearchParams(qs || '') };
}

/** Vai para uma rota: navegar('/pedidos/123') ou navegar('/estoque?x=1', { substituir: true }). */
export function navegar(caminho: string, opts?: { substituir?: boolean }) {
  const alvo = `#${caminho.startsWith('/') ? caminho : '/' + caminho}`;
  if (opts?.substituir) {
    history.replaceState(null, '', alvo);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = alvo;
  }
}

export function voltar(fallback = '/') {
  if (history.length > 1) history.back();
  else navegar(fallback);
}

export function useLocal(): LocalAtual {
  const [local, setLocal] = useState(lerLocal);
  useEffect(() => {
    const aoMudar = () => setLocal(lerLocal());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return local;
}

/** Casa '/parceiros/:id/acerto' com '/parceiros/abc/acerto' -> { id: 'abc' }. */
export function casar(padrao: string, caminho: string): Record<string, string> | null {
  const a = padrao.split('/').filter(Boolean);
  const b = caminho.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
