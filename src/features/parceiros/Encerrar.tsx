// "Encerrar parceria" (8.10): acerto final com recolhimento de tudo, expositor volta para Casa, situação "encerrado".
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { formatBRL } from '../../lib/format.ts';
import { pendenciasDoParceiro } from '../../services/acertos.ts';
import { encerrarParceria, previaEncerramento } from '../../services/parceiros.ts';
import { Aviso, Botao, Cartao, Pagina, avisar, confirmar } from '../../ui/index.ts';
import { ParceiroNaoEncontrado } from './comum.tsx';

export function EncerrarParceria({ params }: TelaProps) {
  useDb();
  const p = db.get('parceiros', params.id);
  if (!p) return <ParceiroNaoEncontrado />;
  const prev = previaEncerramento(p.id);
  const pend = pendenciasDoParceiro(p.id).saldo;

  const encerrar = async () => {
    if (!(await confirmar({ titulo: prev.titulo, itens: prev.itens, confirmar: 'Encerrar parceria', perigo: true }))) return;
    try {
      encerrarParceria(p.id);
      avisar('Parceria encerrada');
      navegar(`/parceiros/${p.id}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo={`Encerrar parceria — ${p.nome}`} voltarPara={`/parceiros/${p.id}`} largura="estreita">
      <Cartao titulo="1. Acerto final">
        {prev.pecasNoParceiro > 0 ? (
          <div class="pilha pilha-m">
            <p>
              Ainda há <strong>{prev.pecasNoParceiro} peça(s)</strong> no expositor. Faça o acerto final: conte, acerte as vendas e recolha tudo para Casa.
            </p>
            <div>
              <Botao variante="primario" icone="check" href={`/parceiros/${p.id}/acerto?final=1`}>
                Fazer o acerto final
              </Botao>
            </div>
          </div>
        ) : (
          <Aviso tom="ok">Nenhuma peça no expositor.</Aviso>
        )}
      </Cartao>
      <Cartao titulo="2. Encerrar">
        <div class="pilha pilha-m">
          <ul class="confirmacao-itens">
            {prev.itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          {pend && pend.aReceber > 0 && <Aviso tom="atencao">Pendência de {formatBRL(pend.aReceber)} continua a receber depois do encerramento.</Aviso>}
          {prev.bloqueio && prev.pecasNoParceiro === 0 && <Aviso tom="ruim">{prev.bloqueio}</Aviso>}
          <div>
            <Botao variante="perigo" icone="sair" disabled={!!prev.bloqueio} onClick={encerrar}>
              Encerrar parceria
            </Botao>
          </div>
        </div>
      </Cartao>
    </Pagina>
  );
}
