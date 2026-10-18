// Links do WhatsApp (wa.me) e modelos de mensagem com variáveis entre chaves.
// Seção 9.4: número só com dígitos, 55 + DDD + número; texto com encodeURIComponent.

export interface NumeroWhatsApp {
  /** Só dígitos, com código do país (ex.: '5571999998888'), ou null se inválido. */
  numero: string | null;
  erro: string | null;
}

/**
 * Normaliza o número: remove espaços, parênteses, hífens, '+' e zeros à esquerda.
 * Sem código de país (10 ou 11 dígitos) -> prefixa 55. Número que já começa com
 * outro código de país fica como está. Valida de 10 a 13 dígitos.
 */
export function normalizarWhatsApp(entrada: string | null | undefined): NumeroWhatsApp {
  const bruto = String(entrada ?? '').trim();
  if (!bruto) return { numero: null, erro: 'Informe o número com DDD.' };
  const internacional = bruto.startsWith('+') || bruto.startsWith('00');
  let d = bruto.replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return { numero: null, erro: 'Número inválido.' };
  if (!internacional && (d.length === 10 || d.length === 11)) d = '55' + d;
  if (d.length < 10 || d.length > 13) {
    return { numero: null, erro: 'O número precisa ter de 10 a 13 dígitos (código do país + DDD + número).' };
  }
  return { numero: d, erro: null };
}

/** Link https://wa.me/NUMERO?text=TEXTO (texto codificado). Sem número válido, abre só com o texto. */
export function linkWhatsApp(numero: string | null | undefined, texto?: string): string {
  const n = normalizarWhatsApp(numero).numero;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return n ? `https://wa.me/${n}${q}` : `https://wa.me/${q}`;
}

/**
 * Preenche um modelo: '{cliente}' -> valor. Linhas cujas variáveis estejam vazias
 * (null, undefined ou '') são removidas — assim "{se houver: ...}" vira automático.
 * Variáveis desconhecidas ficam como estão (para o dono perceber o erro no modelo).
 */
export function preencherModelo(modelo: string, vars: Record<string, string | number | null | undefined>): string {
  const linhas = modelo.split('\n');
  const out: string[] = [];
  for (const linha of linhas) {
    const usadas = Array.from(linha.matchAll(/\{([a-z0-9_]+)\}/gi)).map((m) => m[1]);
    const vazia = usadas.some((v) => v in vars && (vars[v] == null || vars[v] === ''));
    if (vazia) continue;
    out.push(linha.replace(/\{([a-z0-9_]+)\}/gi, (inteiro, v: string) => (v in vars ? String(vars[v]) : inteiro)));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Valor em reais sem o 'R$ ' (os modelos já trazem 'R$ {valor}'): 12345 -> '123,45' */
export function valorMensagem(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${int},${(abs % 100).toString().padStart(2, '0')}`;
}
