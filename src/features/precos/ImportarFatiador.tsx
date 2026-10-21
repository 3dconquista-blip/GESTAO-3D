// Botão "Importar do fatiador" (decisão 103): o dono escolhe o .3mf fatiado (Bambu Studio / OrcaSlicer) ou o
// .gcode e a ficha é preenchida sozinha (peças por mesa, tempo, gramas e tipo de filamento).
import { useState } from 'preact/hooks';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { lerGcode, lerSliceInfo, nomeLimpo, resumoImportacao, type Importacao } from '../../domain/fatiador.ts';
import { entradasDoZip, lerTextoDoZip } from '../../lib/zip.ts';
import { Icon, avisar } from '../../ui/index.ts';
import { novaMesa } from './componentes.tsx';

/** Do .gcode bastam o começo e o fim (onde os fatiadores escrevem o resumo); evita ler arquivos enormes inteiros. */
const PEDACO = 1_000_000;

export async function lerArquivoFatiador(arquivo: File): Promise<Importacao> {
  if (/\.3mf$/i.test(arquivo.name)) {
    const dados = await arquivo.arrayBuffer();
    const entradas = entradasDoZip(dados);
    const info = entradas.find((e) => /(^|\/)slice_info\.config$/i.test(e.nome));
    const gcode = entradas.find((e) => /Metadata\/plate_\d+\.gcode$/i.test(e.nome));
    const imp = info ? lerSliceInfo(await lerTextoDoZip(dados, info)) : gcode ? lerGcode(await lerTextoDoZip(dados, gcode), arquivo.name) : null;
    if (!imp) throw new Error('Este .3mf não tem mesa fatiada. Fatie no programa e exporte a mesa fatiada (.gcode.3mf), ou use o .gcode.');
    return { ...imp, nome: imp.nome || nomeLimpo(arquivo.name) };
  }
  const cabeca = await arquivo.slice(0, PEDACO).text();
  const cauda = arquivo.size > PEDACO ? await arquivo.slice(Math.max(PEDACO, arquivo.size - PEDACO)).text() : '';
  return lerGcode(`${cabeca}\n${cauda}`, arquivo.name);
}

/** Ficha com as mesas do arquivo (impressora padrão); componentes e mão de obra continuam os da ficha atual. */
export function fichaDaImportacao(imp: Importacao, atual: FichaTecnica): FichaTecnica {
  return {
    ...atual,
    mesas: imp.mesas.map((m) => ({ ...novaMesa(), pecasPorMesa: m.pecas, tempoMin: m.tempoMin, filamentos: m.filamentos.map((f) => ({ tipo: f.tipo, gramas: f.gramas })) })),
  };
}

export function ImportarFatiador({ onImportar }: { onImportar: (imp: Importacao) => void }) {
  const [lendo, setLendo] = useState(false);
  const escolher = async (arquivo: File) => {
    setLendo(true);
    try {
      const imp = await lerArquivoFatiador(arquivo);
      onImportar(imp);
      avisar(`Importado: ${resumoImportacao(imp)}`);
      for (const a of imp.avisos) avisar(a, 'atencao');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    } finally {
      setLendo(false);
    }
  };
  return (
    <label class="btn btn-secundario importar-fatiador">
      <Icon nome="arquivo" tamanho={18} />
      <span>{lendo ? 'Lendo o arquivo...' : 'Importar do fatiador (.3mf ou .gcode)'}</span>
      <input
        type="file"
        accept=".3mf,.gcode,.gco,.g"
        hidden
        disabled={lendo}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) escolher(f);
        }}
      />
    </label>
  );
}
