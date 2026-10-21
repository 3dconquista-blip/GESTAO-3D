// Leitura mínima de arquivos .zip (o .3mf do fatiador é um zip), sem dependências: lê o diretório central e
// descompacta só o arquivo pedido (deflate com DecompressionStream, presente no navegador e no Node).

const SIG_FIM = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface EntradaZip {
  nome: string;
  metodo: number;
  tamanhoCompactado: number;
  inicioLocal: number;
}

/** Lista os arquivos do zip. Lança erro se não for um zip válido. */
export function entradasDoZip(dados: ArrayBuffer): EntradaZip[] {
  const v = new DataView(dados);
  let fim = -1;
  for (let i = dados.byteLength - 22; i >= Math.max(0, dados.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === SIG_FIM) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('O arquivo não é um .3mf válido.');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const texto = new TextDecoder();
  const out: EntradaZip[] = [];
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== SIG_CENTRAL) break;
    const metodo = v.getUint16(p + 10, true);
    const tamanhoCompactado = v.getUint32(p + 20, true);
    const n = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comentario = v.getUint16(p + 32, true);
    const inicioLocal = v.getUint32(p + 42, true);
    const nome = texto.decode(new Uint8Array(dados, p + 46, n));
    out.push({ nome, metodo, tamanhoCompactado, inicioLocal });
    p += 46 + n + extra + comentario;
  }
  return out;
}

async function inflar(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Conteúdo (texto UTF-8) de um arquivo do zip. */
export async function lerTextoDoZip(dados: ArrayBuffer, e: EntradaZip): Promise<string> {
  const v = new DataView(dados);
  if (v.getUint32(e.inicioLocal, true) !== SIG_LOCAL) throw new Error('O arquivo .3mf está corrompido.');
  const n = v.getUint16(e.inicioLocal + 26, true);
  const extra = v.getUint16(e.inicioLocal + 28, true);
  const inicio = e.inicioLocal + 30 + n + extra;
  const bytes = new Uint8Array(dados, inicio, e.tamanhoCompactado);
  if (e.metodo === 0) return new TextDecoder().decode(bytes);
  if (e.metodo === 8) return new TextDecoder().decode(await inflar(bytes));
  throw new Error('O arquivo .3mf usa uma compactação que o app não lê.');
}
