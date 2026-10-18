// Alertas de estoque (7.6): abaixo do mínimo, material baixo, saldo negativo, sem venda há 60 dias.
import { useState } from 'preact/hooks';
import type { AlertaEstoque } from '../../domain/alertas.ts';
import { Icon } from '../../ui/index.ts';

export function ListaAlertas({ alertas, limite }: { alertas: AlertaEstoque[]; limite?: number }) {
  const mostrar = limite ? alertas.slice(0, limite) : alertas;
  return (
    <div class="alertas">
      {mostrar.map((a) => (
        <a key={a.id} href={`#${a.href}`} class={`alerta alerta-${a.tom} ${a.discreto ? 'alerta-discreto' : ''}`}>
          <Icon nome="alerta" tamanho={18} />
          <span class="alerta-textos">
            <strong>{a.titulo}</strong>
            <small>{a.detalhe}</small>
          </span>
          <Icon nome="seta" tamanho={16} />
        </a>
      ))}
      {limite && alertas.length > limite && <small class="muted">e mais {alertas.length - limite} alerta(s)</small>}
    </div>
  );
}

/** Cartão recolhível com os alertas (aberto quando há algo vermelho). */
export function ResumoAlertas({ alertas }: { alertas: AlertaEstoque[] }) {
  const graves = alertas.filter((a) => a.tom === 'ruim').length;
  const [aberto, setAberto] = useState(graves > 0);
  if (!alertas.length) return null;
  return (
    <div class={`alertas-resumo ${graves ? 'alertas-ruim' : 'alertas-atencao'}`}>
      <button type="button" class="alertas-topo" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <Icon nome="alerta" tamanho={18} />
        <span>
          {alertas.length} alerta(s) de estoque{graves ? ` · ${graves} urgente(s)` : ''}
        </span>
        <Icon nome={aberto ? 'cima' : 'baixo'} tamanho={18} />
      </button>
      {aberto && <ListaAlertas alertas={alertas} />}
    </div>
  );
}
