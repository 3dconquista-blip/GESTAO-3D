// Gráficos simples em SVG (sem dependências): barras empilhadas e barra horizontal de composição.
import { formatBRL } from '../lib/format.ts';

/** Paleta de séries (azuis e neutros; verde/amarelo/vermelho ficam só para status). */
export const CORES_SERIES = ['#2B4A6B', '#5E86AE', '#9DB8D3', '#18283A', '#7C8A99', '#C9D6E3', '#A47E3B'];

export interface Serie {
  id: string;
  rotulo: string;
  cor?: string;
}

/** Barras verticais empilhadas. Valores em centavos (ou `formatar` próprio). */
export function GraficoBarras({ grupos, series, altura = 200, formatar = formatBRL }: {
  grupos: { rotulo: string; valores: Record<string, number> }[];
  series: Serie[];
  altura?: number;
  formatar?: (v: number) => string;
}) {
  const totais = grupos.map((g) => series.reduce((s, se) => s + Math.max(0, g.valores[se.id] || 0), 0));
  const max = Math.max(1, ...totais);
  const largura = 100 / Math.max(1, grupos.length);
  const cores = series.map((s, i) => s.cor ?? CORES_SERIES[i % CORES_SERIES.length]);
  return (
    <div class="grafico">
      <div class="grafico-area" style={{ height: `${altura}px` }}>
        {grupos.map((g, gi) => {
          let acumulado = 0;
          return (
            <div key={g.rotulo} class="grafico-coluna" style={{ width: `${largura}%` }} title={`${g.rotulo}: ${formatar(totais[gi])}`}>
              <span class="grafico-total">{totais[gi] ? formatar(totais[gi]) : ''}</span>
              <div class="grafico-pilha">
                {series.map((s, si) => {
                  const v = Math.max(0, g.valores[s.id] || 0);
                  if (!v) return null;
                  acumulado += v;
                  return <div key={s.id} class="grafico-seg" style={{ height: `${(v / max) * 100}%`, background: cores[si] }} title={`${s.rotulo}: ${formatar(v)}`} />;
                })}
              </div>
              <span class="grafico-rotulo">{g.rotulo}</span>
            </div>
          );
        })}
      </div>
      {series.length > 1 && (
        <div class="legenda">
          {series.map((s, i) => (
            <span key={s.id} class="legenda-item">
              <span class="legenda-cor" style={{ background: cores[i] }} />
              {s.rotulo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barra horizontal empilhada (ex.: composição do custo por peça). */
export function BarraComposicao({ partes, formatar }: { partes: { rotulo: string; valor: number; cor?: string }[]; formatar: (v: number) => string }) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  return (
    <div class="composicao">
      <div class="composicao-barra" role="img" aria-label="Composição">
        {partes.map((p, i) =>
          p.valor > 0 ? (
            <span key={p.rotulo} style={{ width: `${(p.valor / (total || 1)) * 100}%`, background: p.cor ?? CORES_SERIES[i % CORES_SERIES.length] }} title={`${p.rotulo}: ${formatar(p.valor)}`} />
          ) : null,
        )}
      </div>
      <div class="legenda">
        {partes.map((p, i) => (
          <span key={p.rotulo} class="legenda-item">
            <span class="legenda-cor" style={{ background: p.cor ?? CORES_SERIES[i % CORES_SERIES.length] }} />
            {p.rotulo} <strong>{formatar(p.valor)}</strong>
            {total > 0 && <small> ({Math.round((p.valor / total) * 100)}%)</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra de progresso simples (ex.: % do limite do MEI, giro). */
export function Progresso({ valor, max, tom }: { valor: number; max: number; tom?: 'ok' | 'atencao' | 'ruim' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  return (
    <div class={`progresso ${tom ? `progresso-${tom}` : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
