// Estrutura de página, cartões, abas, grades e indicadores.
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon.tsx';
import { voltar } from '../app/router.ts';

export function Pagina({ titulo, subtitulo, voltarPara, acoes, children, largura = 'normal' }: {
  titulo: ComponentChildren;
  subtitulo?: ComponentChildren;
  /** Rota do botão voltar; `true` = histórico. */
  voltarPara?: string | boolean;
  /** Ação principal (normalmente um <Botao variante="primario">). */
  acoes?: ComponentChildren;
  children?: ComponentChildren;
  largura?: 'normal' | 'estreita' | 'larga';
}) {
  return (
    <div class={`pagina pagina-${largura}`}>
      <header class="pagina-topo">
        {voltarPara && (
          typeof voltarPara === 'string' ? (
            <a class="btn btn-fantasma btn-icone pagina-voltar" href={`#${voltarPara}`} aria-label="Voltar">
              <Icon nome="voltar" />
            </a>
          ) : (
            <button type="button" class="btn btn-fantasma btn-icone pagina-voltar" onClick={() => voltar()} aria-label="Voltar">
              <Icon nome="voltar" />
            </button>
          )
        )}
        <div class="pagina-titulos">
          <h1>{titulo}</h1>
          {subtitulo && <p class="pagina-subtitulo">{subtitulo}</p>}
        </div>
        {acoes && <div class="pagina-acoes">{acoes}</div>}
      </header>
      <div class="pagina-corpo">{children}</div>
    </div>
  );
}

export function Cartao({ titulo, acoes, children, class: cls, tom, compacto }: { titulo?: ComponentChildren; acoes?: ComponentChildren; children?: ComponentChildren; class?: string; tom?: 'ok' | 'atencao' | 'ruim' | 'info'; compacto?: boolean }) {
  return (
    <section class={`cartao ${tom ? `cartao-${tom}` : ''} ${compacto ? 'cartao-compacto' : ''} ${cls ?? ''}`}>
      {(titulo || acoes) && (
        <div class="cartao-topo">
          {titulo && <h2 class="cartao-titulo">{titulo}</h2>}
          {acoes && <div class="cartao-acoes">{acoes}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface Aba {
  id: string;
  rotulo: ComponentChildren;
  /** Rota (navega ao tocar). Se ausente, usa onMudar. */
  href?: string;
  contador?: number;
}

export function Abas({ abas, ativa, onMudar }: { abas: Aba[]; ativa: string; onMudar?: (id: string) => void }) {
  return (
    <nav class="abas" role="tablist">
      {abas.map((a) =>
        a.href ? (
          <a key={a.id} role="tab" aria-selected={a.id === ativa} class={`aba ${a.id === ativa ? 'ativa' : ''}`} href={`#${a.href}`}>
            {a.rotulo}
            {a.contador ? <span class="aba-contador">{a.contador}</span> : null}
          </a>
        ) : (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === ativa} class={`aba ${a.id === ativa ? 'ativa' : ''}`} onClick={() => onMudar?.(a.id)}>
            {a.rotulo}
            {a.contador ? <span class="aba-contador">{a.contador}</span> : null}
          </button>
        ),
      )}
    </nav>
  );
}

/** Grade responsiva: 1 coluna no celular, `colunas` no computador. */
export function Grade({ colunas = 2, children, class: cls }: { colunas?: 2 | 3 | 4; children?: ComponentChildren; class?: string }) {
  return <div class={`grade grade-${colunas} ${cls ?? ''}`}>{children}</div>;
}

/** Itens lado a lado com espaçamento. */
export function Linha({ children, entre, quebra = true, class: cls }: { children?: ComponentChildren; entre?: boolean; quebra?: boolean; class?: string }) {
  return <div class={`linha ${entre ? 'linha-entre' : ''} ${quebra ? 'linha-quebra' : ''} ${cls ?? ''}`}>{children}</div>;
}

/** Itens empilhados com espaçamento. */
export function Pilha({ children, gap = 'm', class: cls }: { children?: ComponentChildren; gap?: 'p' | 'm' | 'g'; class?: string }) {
  return <div class={`pilha pilha-${gap} ${cls ?? ''}`}>{children}</div>;
}

/** Indicador numérico (KPI). */
export function Indicador({ rotulo, valor, detalhe, tom, href }: { rotulo: ComponentChildren; valor: ComponentChildren; detalhe?: ComponentChildren; tom?: 'ok' | 'atencao' | 'ruim'; href?: string }) {
  const conteudo = (
    <>
      <span class="indicador-rotulo">{rotulo}</span>
      <span class={`indicador-valor ${tom ? `txt-${tom}` : ''}`}>{valor}</span>
      {detalhe && <span class="indicador-detalhe">{detalhe}</span>}
    </>
  );
  return href ? (
    <a class="indicador indicador-link" href={`#${href}`}>
      {conteudo}
    </a>
  ) : (
    <div class="indicador">{conteudo}</div>
  );
}

/** Lista de pares rótulo: valor (ex.: composição do custo, resumo do acerto). */
export function Resumo({ linhas }: { linhas: ({ rotulo: ComponentChildren; valor: ComponentChildren; destaque?: boolean; tom?: 'ok' | 'atencao' | 'ruim' } | null | false)[] }) {
  return (
    <dl class="resumo">
      {linhas.filter(Boolean).map((l, i) => {
        const linha = l as { rotulo: ComponentChildren; valor: ComponentChildren; destaque?: boolean; tom?: 'ok' | 'atencao' | 'ruim' };
        return (
          <div key={i} class={`resumo-linha ${linha.destaque ? 'resumo-destaque' : ''} ${linha.tom ? `txt-${linha.tom}` : ''}`}>
            <dt>{linha.rotulo}</dt>
            <dd>{linha.valor}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Item de lista tocável (celular). */
export function ItemLista({ titulo, subtitulo, direita, href, onClick, icone, tom, imagem }: { titulo: ComponentChildren; subtitulo?: ComponentChildren; direita?: ComponentChildren; href?: string; onClick?: () => void; icone?: string; tom?: 'ok' | 'atencao' | 'ruim'; imagem?: string }) {
  const conteudo = (
    <>
      {imagem ? <img class="item-imagem" src={imagem} alt="" /> : icone ? <span class="item-icone"><Icon nome={icone} /></span> : null}
      <span class="item-textos">
        <span class="item-titulo">{titulo}</span>
        {subtitulo && <span class="item-subtitulo">{subtitulo}</span>}
      </span>
      {direita && <span class="item-direita">{direita}</span>}
      {(href || onClick) && <Icon nome="seta" tamanho={18} class="item-seta" />}
    </>
  );
  const cls = `item-lista ${tom ? `item-${tom}` : ''}`;
  if (href) return <a class={cls} href={`#${href}`}>{conteudo}</a>;
  if (onClick) return <button type="button" class={cls} onClick={onClick}>{conteudo}</button>;
  return <div class={cls}>{conteudo}</div>;
}

export function Lista({ children }: { children?: ComponentChildren }) {
  return <div class="lista">{children}</div>;
}

export function Secao({ titulo, children, acoes }: { titulo: ComponentChildren; children?: ComponentChildren; acoes?: ComponentChildren }) {
  return (
    <div class="secao">
      <div class="secao-topo">
        <h3 class="secao-titulo">{titulo}</h3>
        {acoes}
      </div>
      {children}
    </div>
  );
}
