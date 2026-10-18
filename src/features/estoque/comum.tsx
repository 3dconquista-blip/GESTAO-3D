// Peças compartilhadas da área de Estoque.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Botao, Campo, Modal, Texto, avisar } from '../../ui/index.ts';

/** Roda uma gravação mostrando o erro de regra para o dono. Retorna true se deu certo. */
export function executar(fn: () => void, sucesso?: string): boolean {
  try {
    fn();
    if (sucesso) avisar(sucesso);
    return true;
  } catch (e) {
    avisar(e instanceof Error ? e.message : String(e), 'ruim');
    return false;
  }
}

/** Janela de confirmação que pede um motivo (estornos, cancelamentos). */
export function ModalMotivo({
  aberto,
  titulo,
  children,
  rotuloConfirmar = 'Confirmar',
  rotuloMotivo = 'Motivo',
  sugestao,
  perigo,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  children?: ComponentChildren;
  rotuloConfirmar?: string;
  rotuloMotivo?: string;
  sugestao?: string;
  perigo?: boolean;
  onFechar: () => void;
  /** Devolve true para fechar a janela. */
  onConfirmar: (motivo: string) => boolean;
}) {
  const [motivo, setMotivo] = useState(sugestao ?? '');
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} disabled={!motivo.trim()} onClick={() => onConfirmar(motivo.trim()) && onFechar()}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      {children}
      <Campo rotulo={rotuloMotivo} obrigatorio>
        <Texto value={motivo} onInput={setMotivo} autoFocus />
      </Campo>
    </Modal>
  );
}
