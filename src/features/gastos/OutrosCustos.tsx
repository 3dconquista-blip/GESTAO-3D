// "Outros custos e despesas" (decisão 111): os gastos do mês (entregador, gasolina, embalagem...) com o total que
// entra no lucro. Mês a mês com as setas; "Desfazer" cancela um lançamento.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Gasto } from '../../data/types.ts';
import { addMeses, hojeISO, inicioDoMes, rotuloMes } from '../../lib/dates.ts';
import { formatBRL, formatData } from '../../lib/format.ts';
import { cancelarGasto, gastosDoMes } from '../../services/gastos.ts';
import { Botao, Cartao, Indicador, Pagina, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';

const colunas: Coluna<Gasto>[] = [
  { id: 'desc', rotulo: 'Com o que foi', render: (g) => g.descricao, principal: true },
  { id: 'data', rotulo: 'Data', render: (g) => formatData(g.data) },
  { id: 'valor', rotulo: 'Valor', render: (g) => formatBRL(g.valorCentavos), alinhar: 'dir' },
  {
    id: 'acao',
    rotulo: '',
    alinhar: 'dir',
    render: (g) => (
      <Botao pequeno variante="fantasma" onClick={() => executar(() => cancelarGasto(g.id), 'Lançamento desfeito')}>
        Desfazer
      </Botao>
    ),
  },
];

export function OutrosCustos(_props: TelaProps) {
  useDb();
  const esteMes = inicioDoMes(hojeISO());
  const [mes, setMes] = useState(esteMes);
  const m = gastosDoMes(mes);
  const rotulo = rotuloMes(mes.slice(0, 7));
  const fixos = db.config.custos.custosFixosMensaisCentavos || 0;

  return (
    <Pagina
      titulo="Outros custos e despesas"
      subtitulo="Entregador, gasolina, embalagem... Entram no lucro do mês."
      largura="estreita"
      acoes={
        <Botao variante="primario" icone="plus" href="/gastos/novo">
          Lançar
        </Botao>
      }
    >
      <div class="gastos-mes">
        <Botao pequeno variante="fantasma" icone="voltar" onClick={() => setMes(addMeses(mes, -1))} title="Mês anterior" />
        <strong>{rotulo}</strong>
        <Botao pequeno variante="fantasma" icone="seta" onClick={() => setMes(addMeses(mes, 1))} disabled={mes >= esteMes} title="Próximo mês" />
      </div>
      <div class="indicadores">
        <Indicador rotulo={`Total de ${rotulo}`} valor={formatBRL(m.totalCentavos)} detalhe={`${m.gastos.length} lançamento(s)`} />
      </div>
      <Cartao>
        {m.gastos.length ? (
          <Tabela colunas={colunas} linhas={m.gastos} chave={(g) => g.id} />
        ) : (
          <Vazio icone="dinheiro" titulo={`Nenhum custo lançado em ${rotulo}`} texto="Lance aqui o entregador, a gasolina das entregas e outras despesas." acao={{ rotulo: 'Lançar custo', href: '/gastos/novo' }} />
        )}
      </Cartao>
      {fixos > 0 && (
        <p class="muted">
          Os custos fixos mensais ({formatBRL(fixos)}, em Configurações &gt; Custos e preços) também entram no lucro do mês.
        </p>
      )}
    </Pagina>
  );
}
