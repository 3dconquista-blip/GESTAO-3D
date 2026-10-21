// "Importar do fatiador" (decisão 103): .3mf fatiado da Bambu/Orca e .gcode da Bambu, Orca, Prusa e Cura.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lerGcode, lerSliceInfo, nomeLimpo, resumoImportacao, segundosDoTexto, tipoDoFatiador } from './fatiador.ts';

const SLICE_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="14400"/>
    <metadata key="weight" value="64.00"/>
    <object identify_id="101" name="Chaveiro_Kettlebell.stl" skipped="false" />
    <object identify_id="102" name="Chaveiro_Kettlebell.stl" skipped="false" />
    <object identify_id="103" name="Chaveiro_Kettlebell.stl" skipped="true" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="21.48" used_g="64.00" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="0"/>
  </plate>
</config>`;

const BAMBU_GCODE = `; HEADER_BLOCK_START
; BambuStudio 01.09.00.70
; model printing time: 3h 52m 10s; total estimated time: 4h 0m 2s
; total layer number: 40
; total filament weight [g] : 64.00
; HEADER_BLOCK_END
; filament_type = PLA
; start printing object, unique label id: 15
G1 X10
; stop printing object, unique label id: 15
; start printing object, unique label id: 16
; start printing object, unique label id: 15
`;

const PRUSA_GCODE = `;TYPE:Perimeter
; printing object Vaso.stl id:0 copy 0
; stop printing object Vaso.stl id:0 copy 0
; printing object Vaso.stl id:0 copy 1
; filament used [mm] = 9000.00, 1200.00
; filament used [g] = 26.80, 3.60
; estimated printing time (normal mode) = 1d 2h 3m 4s
; filament_type = PETG;PLA
`;

const CURA_GCODE = `;FLAVOR:Marlin
;TIME:5400
;Filament used: 10m
;MESH:Suporte.stl
;MESH:NONMESH
;MESH:Suporte.stl
`;

describe('importar do fatiador', () => {
  it('nomes, tipos e tempos', () => {
    assert.equal(nomeLimpo('C:\\Impressoes\\Chaveiro_Kettlebell.gcode.3mf'), 'Chaveiro Kettlebell');
    assert.equal(nomeLimpo('Vaso.stl'), 'Vaso');
    assert.deepEqual(['PLA Basic', 'PETG-CF', 'TPU 95A', 'ABS', 'ASA', 'PA-CF', undefined].map(tipoDoFatiador), ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro', 'PLA']);
    assert.equal(segundosDoTexto('1d 2h 3m 4s'), 93784);
    assert.equal(segundosDoTexto('4h 0m 2s'), 14402);
    assert.equal(segundosDoTexto('45m 10s'), 2710);
  });

  it('.3mf da Bambu/Orca: peças (sem as puladas), tempo, gramas e tipo; mesa vazia é ignorada', () => {
    const imp = lerSliceInfo(SLICE_INFO);
    assert.equal(imp.nome, 'Chaveiro Kettlebell');
    assert.deepEqual(imp.mesas, [{ pecas: 2, tempoMin: 240, filamentos: [{ tipo: 'PLA', gramas: 64 }] }]);
    assert.deepEqual(imp.avisos, []);
    assert.equal(resumoImportacao(imp), '2 peça(s) · 4 h · 64 g de PLA');
    assert.throws(() => lerSliceInfo('<config><plate><metadata key="prediction" value="0"/></plate></config>'), /não tem mesa fatiada/);
  });

  it('.gcode da Bambu: tempo total, peso total e peças pelos objetos', () => {
    const imp = lerGcode(BAMBU_GCODE, 'Kettlebell.gcode');
    assert.deepEqual(imp.mesas, [{ pecas: 2, tempoMin: 240, filamentos: [{ tipo: 'PLA', gramas: 64 }] }]);
    assert.equal(imp.nome, 'Kettlebell');
  });

  it('.gcode da Prusa/Orca: duas extrusoras viram dois filamentos, cada um com seu tipo', () => {
    const imp = lerGcode(PRUSA_GCODE);
    assert.equal(imp.nome, 'Vaso');
    assert.deepEqual(imp.mesas, [
      {
        pecas: 2,
        tempoMin: 1563,
        filamentos: [
          { tipo: 'PETG', gramas: 26.8 },
          { tipo: 'PLA', gramas: 3.6 },
        ],
      },
    ]);
  });

  it('.gcode do Cura: tempo em segundos e gramas estimadas pelos metros (com aviso)', () => {
    const imp = lerGcode(CURA_GCODE);
    assert.equal(imp.nome, 'Suporte');
    assert.deepEqual(imp.mesas, [{ pecas: 1, tempoMin: 90, filamentos: [{ tipo: 'PLA', gramas: 29.8 }] }]);
    assert.match(imp.avisos.join(' '), /estimadas para PLA/);
  });

  it('arquivo sem nada do fatiador é recusado; sem peças, avisa para conferir', () => {
    assert.throws(() => lerGcode('G1 X10 Y10\nG1 X20'), /Não achei o tempo nem o filamento/);
    const imp = lerGcode('; total estimated time: 1h\n; total filament weight [g] : 10');
    assert.equal(imp.mesas[0].pecas, 1);
    assert.match(imp.avisos.join(' '), /confira quantas saem por mesa/);
  });
});
