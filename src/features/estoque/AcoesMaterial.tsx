// Ações do material: "Pesei o carretel", ajuste e perda (seção 7.3).
import { useState } from 'preact/hooks';
import { saldoMaterial } from '../../data/selectors.ts';
import type { Material } from '../../data/types.ts';
import { gramasRestantes } from '../../domain/materiais.ts';
import { formatGramas, formatQtd } from '../../lib/format.ts';
import { ajustarMaterial, pesarCarretel, registrarPerdaMaterial } from '../../services/materiais.ts';
import { Aviso, Botao, Campo, Modal, Numero, Resumo, Segmentado, Texto } from '../../ui/index.ts';
import { executar } from './comum.tsx';

function qtd(m: Material, q: number): string {
  return m.tipo === 'filamento' ? formatGramas(q) : `${formatQtd(q)} ${m.unidade}`;
}

/** "Pesei o carretel": peso na balança − peso do carretel vazio = gramas restantes. Gera um ajuste. */
export function ModalPesagem({ material, onFechar }: { material: Material; onFechar: () => void }) {
  const [peso, setPeso] = useState<number | null>(null);
  const saldo = saldoMaterial(material.id);
  const tara = material.taraCarretelG || 0;
  const restantes = peso != null ? gramasRestantes(peso, tara) : null;
  const delta = restantes != null ? Math.round((restantes - saldo) * 100) / 100 : null;
  const confirmar = () => {
    if (peso == null) return;
    if (executar(() => pesarCarretel({ materialId: material.id, pesoBalancaG: peso }), delta ? 'Saldo ajustado pela pesagem' : 'O saldo já estava certo')) onFechar();
  };
  return (
    <Modal
      aberto
      titulo={`Pesei o carretel — ${material.nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" disabled={peso == null} onClick={confirmar}>
            Ajustar saldo
          </Botao>
        </>
      }
    >
      <Campo rotulo="Peso na balança (carretel com filamento)">
        <Numero value={peso} onChange={setPeso} decimais={0} min={0} sufixo="g" autoFocus />
      </Campo>
      {!tara && <Aviso tom="atencao">O peso do carretel vazio está em 0 g (refil). Se for carretel, informe a tara no cadastro do material.</Aviso>}
      <Resumo
        linhas={[
          { rotulo: 'Carretel vazio', valor: formatGramas(tara) },
          { rotulo: 'Gramas restantes', valor: restantes != null ? formatGramas(restantes) : '—' },
          { rotulo: 'Saldo no sistema', valor: formatGramas(saldo) },
          {
            rotulo: 'Ajuste que será lançado',
            valor: delta == null ? '—' : delta === 0 ? 'nenhum' : `${delta > 0 ? '+' : ''}${formatGramas(delta)}`,
            destaque: true,
            tom: delta != null && delta < 0 ? 'ruim' : undefined,
          },
        ]}
      />
    </Modal>
  );
}

/** Ajuste manual (+/−) ou perda de material, com motivo obrigatório. */
export function ModalAjusteMaterial({ material, modo, onFechar }: { material: Material; modo: 'ajuste' | 'perda'; onFechar: () => void }) {
  const [sentido, setSentido] = useState<'entra' | 'sai'>('sai');
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const saldo = saldoMaterial(material.id);
  const sinal = modo === 'perda' || sentido === 'sai' ? -1 : 1;
  const depois = quantidade != null ? saldo + sinal * quantidade : null;
  const unidade = material.tipo === 'filamento' ? 'g' : material.unidade;
  const confirmar = () => {
    if (!quantidade) return;
    const ok = executar(
      () =>
        modo === 'perda'
          ? registrarPerdaMaterial({ materialId: material.id, quantidade, motivo })
          : ajustarMaterial({ materialId: material.id, quantidade: sinal * quantidade, motivo }),
      modo === 'perda' ? 'Perda registrada' : 'Ajuste registrado',
    );
    if (ok) onFechar();
  };
  return (
    <Modal
      aberto
      titulo={`${modo === 'perda' ? 'Perda' : 'Ajuste'} — ${material.nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" disabled={!quantidade || !motivo.trim()} onClick={confirmar}>
            Confirmar
          </Botao>
        </>
      }
    >
      {modo === 'ajuste' && (
        <Segmentado
          bloco
          value={sentido}
          onChange={setSentido}
          opcoes={[
            { valor: 'sai', rotulo: 'Tirar do saldo' },
            { valor: 'entra', rotulo: 'Somar ao saldo' },
          ]}
        />
      )}
      <Campo rotulo="Quantidade">
        <Numero value={quantidade} onChange={setQuantidade} decimais={material.tipo === 'filamento' ? 1 : 0} min={0} sufixo={unidade} autoFocus />
      </Campo>
      <Campo rotulo="Motivo" obrigatorio>
        <Texto value={motivo} onInput={setMotivo} placeholder={modo === 'perda' ? 'Ex.: filamento úmido, quebrou' : 'Ex.: contagem'} />
      </Campo>
      <Resumo
        linhas={[
          { rotulo: 'Saldo agora', valor: qtd(material, saldo) },
          { rotulo: 'Saldo depois', valor: depois != null ? qtd(material, depois) : '—', destaque: true, tom: depois != null && depois < 0 ? 'ruim' : undefined },
        ]}
      />
    </Modal>
  );
}
