// Selos de status, estados vazios e avisos.
// Cores: verde = em dia, amarelo = atenção, vermelho = atrasado ou prejuízo.
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon.tsx';
import { Botao } from './controls.tsx';

export type Tom = 'ok' | 'atencao' | 'ruim' | 'neutro' | 'info';

export function Selo({ tom = 'neutro', children, icone }: { tom?: Tom; children: ComponentChildren; icone?: string }) {
  return (
    <span class={`selo selo-${tom}`}>
      {icone && <Icon nome={icone} tamanho={14} />}
      {children}
    </span>
  );
}

/** Estado vazio: explicação curta e botão para criar o primeiro item. */
export function Vazio({ icone = 'info', titulo, texto, acao }: { icone?: string; titulo: ComponentChildren; texto?: ComponentChildren; acao?: { rotulo: string; href?: string; onClick?: () => void } }) {
  return (
    <div class="vazio">
      <span class="vazio-icone">
        <Icon nome={icone} tamanho={28} />
      </span>
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {acao && (
        <Botao variante="primario" icone="plus" href={acao.href} onClick={acao.onClick ? () => acao.onClick?.() : undefined}>
          {acao.rotulo}
        </Botao>
      )}
    </div>
  );
}

export function Aviso({ tom = 'info', titulo, children, acao }: { tom?: Tom; titulo?: ComponentChildren; children?: ComponentChildren; acao?: ComponentChildren }) {
  const icone = tom === 'ruim' || tom === 'atencao' ? 'alerta' : tom === 'ok' ? 'check' : 'info';
  return (
    <div class={`aviso aviso-${tom}`} role={tom === 'ruim' ? 'alert' : 'status'}>
      <Icon nome={icone} tamanho={20} />
      <div class="aviso-texto">
        {titulo && <strong>{titulo}</strong>}
        {children && <div>{children}</div>}
      </div>
      {acao && <div class="aviso-acao">{acao}</div>}
    </div>
  );
}

/** Dica fixa em tom discreto. */
export function Dica({ children }: { children: ComponentChildren }) {
  return (
    <p class="dica">
      <Icon nome="info" tamanho={16} />
      <span>{children}</span>
    </p>
  );
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div class="carregando">
      <span class="spinner" aria-hidden="true" />
      {texto}
    </div>
  );
}
