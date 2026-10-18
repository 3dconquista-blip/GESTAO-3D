// Configurações > Parcerias e Pedidos (padrões).
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { atualizarParcerias, atualizarPedidosConfig } from '../../services/config.ts';
import { Botao, Campo, Cartao, Dinheiro, Numero, Pagina, Segmentado } from '../../ui/index.ts';
import { BarraSalvar, tentar } from './comum.tsx';

export function ConfigParcerias() {
  const [p, setP] = useState(() => ({ ...db.config.parcerias, divisoes: [...db.config.parcerias.divisoes] }));
  const [nova, setNova] = useState<number | null>(null);
  const freqPadrao = p.frequenciaPadraoDias === 15 || p.frequenciaPadraoDias === 30;
  return (
    <Pagina titulo="Parcerias" voltarPara="/config" largura="estreita">
      <Cartao titulo="Divisões disponíveis" acoes={<small class="muted">% do parceiro sobre o total vendido</small>}>
        <div class="pilha pilha-m">
          <div class="cfg-chips">
            {p.divisoes.map((d) => (
              <span key={d} class="cfg-chip">
                Você {100 - d}% / Parceiro {d}%
                <button type="button" aria-label="Remover divisão" onClick={() => setP({ ...p, divisoes: p.divisoes.filter((x) => x !== d) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div class="linha">
            <Numero value={nova} onChange={setNova} min={1} max={99} sufixo="% do parceiro" placeholder="Ex.: 25" />
            <Botao
              icone="plus"
              disabled={!nova}
              onClick={() => {
                if (nova && !p.divisoes.includes(nova)) setP({ ...p, divisoes: [...p.divisoes, nova] });
                setNova(null);
              }}
            >
              Adicionar
            </Botao>
          </div>
        </div>
      </Cartao>
      <Cartao titulo="Acertos">
        <div class="formulario">
          <Campo rotulo="Frequência padrão do acerto">
            <Segmentado
              value={freqPadrao ? p.frequenciaPadraoDias : 0}
              onChange={(v) => setP({ ...p, frequenciaPadraoDias: v || p.frequenciaPadraoDias })}
              opcoes={[
                { valor: 15, rotulo: 'A cada 15 dias' },
                { valor: 30, rotulo: 'A cada 30 dias' },
              ]}
            />
          </Campo>
          <div class="campos-2">
            <Campo rotulo="Avisar quando faltar" dica="Na agenda, o acerto fica amarelo">
              <Numero value={p.diasAviso} onChange={(v) => setP({ ...p, diasAviso: v ?? 0 })} decimais={0} min={0} sufixo="dias" stepper />
            </Campo>
            <Campo rotulo="Limite de baixo desempenho" dica="Sua parte por mês abaixo disso em 2 acertos seguidos gera alerta">
              <Dinheiro value={p.limiteBaixoDesempenhoCentavos} onChange={(v) => setP({ ...p, limiteBaixoDesempenhoCentavos: v ?? 0 })} />
            </Campo>
          </div>
        </div>
      </Cartao>
      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={() => tentar(() => atualizarParcerias(p))}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}

export function ConfigPedidos() {
  const [p, setP] = useState(() => ({ ...db.config.pedidos }));
  const mudar = (patch: Partial<typeof p>) => setP({ ...p, ...patch });
  return (
    <Pagina titulo="Pedidos" subtitulo="Padrões do orçamento de pedidos personalizados" voltarPara="/config" largura="estreita">
      <Cartao>
        <div class="campos-2">
          <Campo rotulo="Pedido mínimo">
            <Dinheiro value={p.pedidoMinimoCentavos} onChange={(v) => mudar({ pedidoMinimoCentavos: v ?? 0 })} />
          </Campo>
          <Campo rotulo="Validade do orçamento">
            <Numero value={p.validadeDias} onChange={(v) => mudar({ validadeDias: v ?? 7 })} decimais={0} min={1} sufixo="dias" />
          </Campo>
          <Campo rotulo="Urgência (quando marcada)">
            <Numero value={p.urgenciaPct} onChange={(v) => mudar({ urgenciaPct: v ?? 0 })} min={0} max={100} sufixo="%" />
          </Campo>
          <Campo rotulo="Sinal">
            <Numero value={p.sinalPct} onChange={(v) => mudar({ sinalPct: v ?? 0 })} min={0} max={100} sufixo="%" />
          </Campo>
          <Campo rotulo="Desconto por quantidade (sugerido)">
            <Numero value={p.descontoQtdPct} onChange={(v) => mudar({ descontoQtdPct: v ?? 0 })} min={0} max={99} sufixo="%" />
          </Campo>
          <Campo rotulo="A partir de">
            <Numero value={p.descontoQtdAPartir} onChange={(v) => mudar({ descontoQtdAPartir: v ?? 1 })} decimais={0} min={1} sufixo="unidades" />
          </Campo>
        </div>
      </Cartao>
      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={() => tentar(() => atualizarPedidosConfig(p))}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}
