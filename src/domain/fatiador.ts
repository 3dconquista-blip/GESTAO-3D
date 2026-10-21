// "Importar do fatiador" (decisão 103): lê do arquivo que o dono já salva para imprimir o tempo, as gramas, as
// peças por mesa e o tipo de filamento, para não digitar nada disso no cadastro. Funções puras (texto -> dados):
// - .3mf fatiado da Bambu Studio / OrcaSlicer: Metadata/slice_info.config (uma <plate> por mesa);
// - .gcode da Bambu, Orca, PrusaSlicer e Cura: comentários com o tempo estimado e o filamento usado.
import type { TipoFilamento } from '../data/types.ts';

export interface MesaImportada {
  /** Peças na mesa (objetos fatiados). */
  pecas: number;
  /** Tempo estimado da mesa inteira, em minutos. */
  tempoMin: number;
  filamentos: { tipo: TipoFilamento; gramas: number }[];
}

export interface Importacao {
  /** Nome sugerido para o produto (do primeiro objeto ou do arquivo). */
  nome?: string;
  mesas: MesaImportada[];
  /** O que o dono deve conferir (ex.: peças não encontradas no arquivo). */
  avisos: string[];
}

/** Gramas por metro de filamento de 1,75 mm de PLA (densidade 1,24 g/cm³), para fatiadores que só dão metros. */
export const GRAMAS_POR_METRO = 2.98;

/** Tipo do app a partir do nome do fatiador ("PLA Basic", "PETG-CF", "PLA-S"...). */
export function tipoDoFatiador(t: string | undefined): TipoFilamento {
  const s = (t ?? '').trim().toUpperCase();
  if (s.startsWith('PLA')) return 'PLA';
  if (s.startsWith('PETG') || s.startsWith('PET')) return 'PETG';
  if (s.startsWith('TPU') || s.startsWith('FLEX')) return 'TPU';
  if (s.startsWith('ABS')) return 'ABS';
  if (s.startsWith('ASA')) return 'ASA';
  return s ? 'Outro' : 'PLA';
}

/** "Chaveiro_Kettlebell.gcode.3mf" -> "Chaveiro Kettlebell"; "Kettlebell.stl" -> "Kettlebell". */
export function nomeLimpo(arquivo: string): string {
  const base = arquivo.split(/[\\/]/).pop() ?? arquivo;
  return base
    .replace(/\.(gcode\.3mf|3mf|gcode|gco|g|stl|obj|step|stp)$/i, '')
    .replace(/\.(gcode|3mf|stl)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "1d 2h 3m 4s" / "2h 05m" / "45m 10s" -> segundos. */
export function segundosDoTexto(texto: string): number {
  let s = 0;
  const pega = (re: RegExp) => Number(texto.match(re)?.[1] ?? 0);
  s += pega(/(\d+)\s*d/i) * 86400;
  s += pega(/(\d+)\s*h/i) * 3600;
  s += pega(/(\d+)\s*m(?!s)/i) * 60;
  s += pega(/(\d+)\s*s/i);
  return s;
}

function atributos(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const minutos = (segundos: number) => Math.max(1, Math.round(segundos / 60));
const gramas2 = (g: number) => Math.round(g * 100) / 100;

/** Somente as mesas que têm algo (tempo ou filamento). */
function mesasValidas<T extends MesaImportada>(mesas: T[]): T[] {
  return mesas.filter((m) => m.filamentos.some((f) => f.gramas > 0));
}

/** Lê o Metadata/slice_info.config do .3mf fatiado (Bambu Studio / OrcaSlicer). */
export function lerSliceInfo(xml: string): Importacao {
  const avisos: string[] = [];
  let nome: string | undefined;
  const mesas: (MesaImportada & { semObjetos: boolean })[] = [];
  for (const bloco of xml.match(/<plate\b[\s\S]*?<\/plate>/g) ?? []) {
    const meta: Record<string, string> = {};
    for (const m of bloco.matchAll(/<metadata\b([^>]*)\/?>/g)) {
      const a = atributos(m[1]);
      if (a.key) meta[a.key] = a.value ?? '';
    }
    const objetos = Array.from(bloco.matchAll(/<object\b([^>]*)\/?>/g))
      .map((m) => atributos(m[1]))
      .filter((a) => a.skipped !== 'true');
    if (!nome && objetos[0]?.name) nome = nomeLimpo(objetos[0].name);
    const filamentos = Array.from(bloco.matchAll(/<filament\b([^>]*)\/?>/g))
      .map((m) => atributos(m[1]))
      .map((a) => ({ tipo: tipoDoFatiador(a.type), gramas: gramas2(Number(a.used_g ?? 0)) }))
      .filter((f) => f.gramas > 0);
    if (!filamentos.length && Number(meta.weight) > 0) filamentos.push({ tipo: 'PLA', gramas: gramas2(Number(meta.weight)) });
    mesas.push({ pecas: Math.max(1, objetos.length), tempoMin: minutos(Number(meta.prediction ?? 0)), filamentos, semObjetos: !objetos.length });
  }
  const validas = mesasValidas(mesas).map(({ semObjetos, ...m }) => {
    if (semObjetos) avisos.push('Não achei as peças no arquivo: confira quantas saem por mesa.');
    return m;
  });
  if (!validas.length) throw new Error('Este .3mf não tem mesa fatiada. Fatie no programa e exporte a mesa fatiada (.gcode.3mf), ou use o .gcode.');
  if (validas.length > 1) avisos.push(`O arquivo tem ${validas.length} mesas fatiadas: cada uma virou uma mesa da ficha. Se alguma for de outro produto, tire-a.`);
  return { nome, mesas: validas, avisos: Array.from(new Set(avisos)) };
}

/** Lê os comentários de um .gcode (início e fim do arquivo bastam). */
export function lerGcode(texto: string, nomeArquivo?: string): Importacao {
  const avisos: string[] = [];
  const primeiro = (res: RegExp[]) => {
    for (const re of res) {
      const m = texto.match(re);
      if (m) return m[1].trim();
    }
    return undefined;
  };

  // Tempo: o total estimado (Bambu), o modo normal (Prusa/Orca) ou ;TIME: em segundos (Cura).
  const tempoTexto = primeiro([/;\s*total estimated time\s*[:=]\s*([^;\n]+)/i, /;\s*estimated printing time \(normal mode\)\s*=\s*([^\n]+)/i, /;\s*model printing time\s*[:=]\s*([^;\n]+)/i]);
  let segundos = tempoTexto ? segundosDoTexto(tempoTexto) : 0;
  if (!segundos) segundos = Number(texto.match(/^;TIME:(\d+)/m)?.[1] ?? 0);

  // Tipos de filamento (lista por extrusora).
  const tipos = (primeiro([/;\s*filament_type\s*=\s*([^\n]+)/i]) ?? '').split(/[;,]/).map((t) => t.trim()).filter(Boolean);

  // Gramas: total (Bambu/Orca) ou por extrusora (Prusa/Orca); Cura só dá metros.
  let porExtrusora: number[] = [];
  const total = primeiro([/;\s*total filament weight \[g\]\s*[:=]\s*([\d.]+)/i, /;\s*total filament used \[g\]\s*[:=]\s*([\d.]+)/i]);
  const lista = primeiro([/;\s*filament used \[g\]\s*[:=]\s*([\d., ]+)/i]);
  if (lista) porExtrusora = lista.split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  if (!porExtrusora.some((g) => g > 0) && total) porExtrusora = [Number(total)];
  if (!porExtrusora.some((g) => g > 0)) {
    const metros = Number(texto.match(/^;Filament used:\s*([\d.]+)\s*m/m)?.[1] ?? 0);
    if (metros > 0) {
      porExtrusora = [metros * GRAMAS_POR_METRO];
      avisos.push('O arquivo só tem os metros de filamento: as gramas foram estimadas para PLA de 1,75 mm. Confira.');
    }
  }
  const filamentos = porExtrusora
    .map((g, i) => ({ tipo: tipoDoFatiador(tipos[i] ?? tipos[0]), gramas: gramas2(g) }))
    .filter((f) => f.gramas > 0);

  // Peças: objetos marcados no gcode (Orca/Bambu, Prusa e Cura).
  const ids = new Set<string>();
  for (const m of texto.matchAll(/;\s*start printing object, unique label id:\s*(\d+)/gi)) ids.add(`o${m[1]}`);
  for (const m of texto.matchAll(/^;\s*printing object\s+(.+)$/gim)) ids.add(`p${m[1].trim()}`);
  for (const m of texto.matchAll(/^;MESH:(.+)$/gm)) if (!/^NONMESH/i.test(m[1])) ids.add(`c${m[1].trim()}`);
  if (!ids.size) avisos.push('Não achei as peças no arquivo: confira quantas saem por mesa.');

  const nomeObjeto = texto.match(/^;\s*printing object\s+(.+?)(?:\s+id:\d+.*)?$/im)?.[1] ?? texto.match(/^;MESH:(?!NONMESH)(.+)$/m)?.[1];
  const nome = nomeObjeto ? nomeLimpo(nomeObjeto) : nomeArquivo ? nomeLimpo(nomeArquivo) : undefined;

  if (!segundos && !filamentos.length) throw new Error('Não achei o tempo nem o filamento neste .gcode. Ele foi gerado por um fatiador (Bambu, Orca, Prusa ou Cura)?');
  if (!segundos) avisos.push('Não achei o tempo de impressão: preencha à mão.');
  if (!filamentos.length) avisos.push('Não achei as gramas de filamento: preencha à mão.');
  return { nome, mesas: [{ pecas: Math.max(1, ids.size), tempoMin: segundos ? minutos(segundos) : 0, filamentos }], avisos };
}

/** Resumo para o aviso: "8 peças · 4 h · 64 g de PLA". */
export function resumoImportacao(imp: Importacao): string {
  const pecas = imp.mesas.reduce((s, m) => s + m.pecas, 0);
  const min = imp.mesas.reduce((s, m) => s + m.tempoMin, 0);
  const porTipo = new Map<TipoFilamento, number>();
  for (const m of imp.mesas) for (const f of m.filamentos) porTipo.set(f.tipo, (porTipo.get(f.tipo) || 0) + f.gramas);
  const tempo = min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
  const fil = Array.from(porTipo, ([t, g]) => `${gramas2(g)} g de ${t}`).join(' + ');
  return [`${pecas} peça(s)`, tempo, fil].filter(Boolean).join(' · ');
}
