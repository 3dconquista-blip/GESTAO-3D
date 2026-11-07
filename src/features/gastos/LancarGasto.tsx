// "Lançar custo ou despesa" (decisões 106 e 111): o que foi e quanto custou. As descrições usadas por último e as
// comuns (entregador, gasolina) viram atalhos (um toque preenche). A data fica em "Mais detalhes" (padrão: hoje).
// Sem janela: o aviso traz "Desfazer".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData } from '../../lib/format.ts';
import { atalhosGasto, cancelarGasto, lancarGasto } from '../../services/gastos.ts';
import { Botao, Campo, Cartao, Data, Dinheiro, MaisDetalhes, Pagina, Texto, avisar } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';

export function LancarGasto(_props: TelaProps) {
  useDb();
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeISO());
  const recentes = atalhosGasto();
  const pronto = !!descricao.trim() && !!valor && valor > 0;

  const lancar = () => {
    if (!pronto || !valor) return;
    try {
      const g = lancarGasto({ descricao, valorCentavos: valor, data });
      avisar(`${formatBRL(g.valorCentavos)} lançado · ${g.descricao}`, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => executar(() => cancelarGasto(g.id), 'Lançamento desfeito'),
      });
      if (history.length > 1) history.back();
      else navegar('/gastos', { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo="Lançar custo ou despesa" subtitulo="Entregador, gasolina, embalagem... Entra no lucro do mês." voltarPara={true} largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Com o que foi">
            <Texto value={descricao} onInput={setDescricao} placeholder="Ex.: Entregador" autoFocus />
          </Campo>
          {recentes.length > 0 && (
            <div class="gasto-recentes">
              {recentes.map((r) => (
                <button key={r} type="button" class={`gasto-chip ${r === descricao ? 'ativo' : ''}`} onClick={() => setDescricao(r)}>
                  {r}
                </button>
              ))}
            </div>
          )}
          <Campo rotulo="Quanto custou">
            <Dinheiro value={valor} onChange={setValor} />
          </Campo>
        </div>
      </Cartao>
      <MaisDetalhes titulo="Data" resumo={data === hojeISO() ? 'hoje' : formatData(data)}>
        <Campo rotulo="Data">
          <Data value={data} onInput={setData} max={hojeISO()} />
        </Campo>
      </MaisDetalhes>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!pronto} onClick={lancar}>
          {valor ? `Lançar · ${formatBRL(valor)}` : 'Lançar'}
        </Botao>
      </div>
    </Pagina>
  );
}
