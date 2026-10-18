// Tabela responsiva: tabela no computador, cartões empilhados no celular.
import type { ComponentChildren } from 'preact';

export interface Coluna<T> {
  id: string;
  rotulo: ComponentChildren;
  /** Conteúdo da célula. */
  render: (linha: T) => ComponentChildren;
  alinhar?: 'esq' | 'dir' | 'centro';
  /** Esconde no celular (ainda aparece na tabela do computador). */
  esconderNoCelular?: boolean;
  /** Primeira coluna vira título do cartão no celular. */
  principal?: boolean;
  largura?: string;
}

export function Tabela<T>({ colunas, linhas, chave, onClickLinha, tomLinha, rodape, vazio }: {
  colunas: Coluna<T>[];
  linhas: T[];
  chave: (l: T) => string;
  onClickLinha?: (l: T) => void;
  tomLinha?: (l: T) => 'ok' | 'atencao' | 'ruim' | undefined;
  /** Linha de totais (mesmas colunas). */
  rodape?: Partial<Record<string, ComponentChildren>>;
  vazio?: ComponentChildren;
}) {
  if (!linhas.length && vazio) return <>{vazio}</>;
  const principal = colunas.find((c) => c.principal) ?? colunas[0];
  return (
    <div class="tabela-wrap">
      <table class="tabela">
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.id} class={`al-${c.alinhar ?? 'esq'}`} style={c.largura ? { width: c.largura } : undefined}>
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const tom = tomLinha?.(l);
            return (
              <tr key={chave(l)} class={`${onClickLinha ? 'clicavel' : ''} ${tom ? `linha-${tom}` : ''}`} onClick={onClickLinha ? () => onClickLinha(l) : undefined}>
                {colunas.map((c) => (
                  <td key={c.id} class={`al-${c.alinhar ?? 'esq'}`}>
                    {c.render(l)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {rodape && (
          <tfoot>
            <tr>
              {colunas.map((c) => (
                <td key={c.id} class={`al-${c.alinhar ?? 'esq'}`}>
                  {rodape[c.id] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      <div class="tabela-cartoes">
        {linhas.map((l) => {
          const tom = tomLinha?.(l);
          return (
            <div key={chave(l)} class={`tabela-cartao ${onClickLinha ? 'clicavel' : ''} ${tom ? `linha-${tom}` : ''}`} onClick={onClickLinha ? () => onClickLinha(l) : undefined}>
              <div class="tabela-cartao-titulo">{principal.render(l)}</div>
              <dl>
                {colunas
                  .filter((c) => c !== principal && !c.esconderNoCelular)
                  .map((c) => (
                    <div key={c.id}>
                      <dt>{c.rotulo}</dt>
                      <dd>{c.render(l)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          );
        })}
        {rodape && (
          <div class="tabela-cartao tabela-cartao-total">
            <dl>
              {colunas
                .filter((c) => rodape[c.id] != null && rodape[c.id] !== '')
                .map((c) => (
                  <div key={c.id}>
                    <dt>{c.rotulo}</dt>
                    <dd>{rodape[c.id]}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
