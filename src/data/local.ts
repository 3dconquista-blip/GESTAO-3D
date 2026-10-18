// Armazenamento só deste aparelho (localStorage): rascunhos de acerto, preferências.
// Nunca guarde aqui dados que precisam ir para o backup ou para a nuvem.
const PREFIXO = 'octa:';

export function lerLocal<T>(chave: string): T | null {
  try {
    const s = localStorage.getItem(PREFIXO + chave);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}

export function salvarLocal(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* sem espaço ou bloqueado: ignora */
  }
}

export function apagarLocal(chave: string): void {
  try {
    localStorage.removeItem(PREFIXO + chave);
  } catch {
    /* ignora */
  }
}

/** Lista chaves (sem o prefixo) que começam com `inicio`. */
export function chavesLocais(inicio: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO + inicio)) out.push(k.slice(PREFIXO.length));
    }
  } catch {
    /* ignora */
  }
  return out;
}
