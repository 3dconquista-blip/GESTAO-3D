// Leitor mínimo de .zip (o .3mf): um arquivo guardado sem compactar e outro com deflate.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { entradasDoZip, lerTextoDoZip } from './zip.ts';

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Monta um zip simples (sem CRC conferido pelo leitor) com os arquivos dados. */
async function montarZip(arquivos: { nome: string; texto: string; compactar: boolean }[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const bruto = enc.encode(a.texto);
    const dados = a.compactar ? await deflate(bruto) : bruto;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, a.compactar ? 8 : 0, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, bruto.length, true);
    local.setUint16(26, nome.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, a.compactar ? 8 : 0, true);
    cd.setUint32(20, dados.length, true);
    cd.setUint32(24, bruto.length, true);
    cd.setUint16(28, nome.length, true);
    cd.setUint32(42, offset, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);
    central.push(new Uint8Array(cd.buffer), nome);
    offset += 30 + nome.length + dados.length;
  }
  const tamanhoCentral = central.reduce((s, x) => s + x.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, offset, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(tudo.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of tudo) {
    out.set(x, p);
    p += x.length;
  }
  return out.buffer;
}

describe('zip', () => {
  it('lista os arquivos e lê o guardado e o compactado', async () => {
    const zip = await montarZip([
      { nome: '3D/3dmodel.model', texto: '<model/>', compactar: false },
      { nome: 'Metadata/slice_info.config', texto: '<config><plate>ção</plate></config>', compactar: true },
    ]);
    const entradas = entradasDoZip(zip);
    assert.deepEqual(entradas.map((e) => e.nome), ['3D/3dmodel.model', 'Metadata/slice_info.config']);
    assert.equal(await lerTextoDoZip(zip, entradas[0]), '<model/>');
    assert.equal(await lerTextoDoZip(zip, entradas[1]), '<config><plate>ção</plate></config>');
  });

  it('arquivo que não é zip é recusado', () => {
    assert.throws(() => entradasDoZip(new TextEncoder().encode('não sou um zip, sou um texto qualquer').buffer), /não é um \.3mf válido/);
  });
});
