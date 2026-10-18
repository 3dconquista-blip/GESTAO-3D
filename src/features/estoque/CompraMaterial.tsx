// "Compra de material" (7.3): soma ao saldo e recalcula o custo médio.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { materiaisAtivos, saldoMaterial } from '../../data/selectors.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatBRL, formatData, formatReais } from '../../lib/format.ts';
import { resumoCompra, unidadeCompra } from '../../domain/materiais.ts';
import { comprarMaterial } from '../../services/materiais.ts';
import { Botao, Campo, Cartao, Data, Dinheiro, Escolha, Numero, Pagina, Resumo, Vazio, confirmar } from '../../ui/index.ts';
import { executar } from './comum.tsx';
import { textoSaldo } from './MateriaisLista.tsx';

export function CompraMaterial({ query }: TelaProps) {
  useDb();
  const materiais = materiaisAtivos();
  const [materialId, setMaterialId] = useState<string | null>(query.get('material') ?? materiais[0]?.id ?? null);
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeISO());

  if (!materiais.length) {
    return (
      <Pagina titulo="Compra de material" voltarPara="/estoque/materiais">
        <Vazio icone="rolo" titulo="Nenhum material cadastrado" texto="Cadastre o filamento ou insumo antes de lançar a compra." acao={{ rotulo: 'Cadastrar material', href: '/estoque/materiais/novo' }} />
      </Pagina>
    );
  }

  const m = materiais.find((x) => x.id === materialId);
  const un = m ? unidadeCompra(m) : '';
  const r = m && quantidade && quantidade > 0 && valor != null ? resumoCompra(m, saldoMaterial(m.id), quantidade, valor) : null;
  const custoTxt = (v: number) => (m?.tipo === 'filamento' ? `${formatReais(v)}/kg` : `${formatReais(v, v < 1 ? 4 : 2)}/${m?.unidade}`);

  const registrar = async () => {
    if (!m || !r || !quantidade || valor == null) return;
    const ok = await confirmar({
      titulo: 'Registrar a compra?',
      itens: [
        `${m.nome}: ${textoSaldo(m, r.saldoAntes)} → ${textoSaldo(m, r.saldoDepois)}`,
        `Valor pago: ${formatBRL(valor)} em ${formatData(data)}`,
        `Custo médio: ${custoTxt(r.custoAtual)} → ${custoTxt(r.custoNovo)}`,
        'O custo dos produtos que usam este material é recalculado. O preço de etiqueta não muda sozinho.',
      ],
      confirmar: 'Registrar compra',
    });
    if (!ok) return;
    if (executar(() => comprarMaterial({ materialId: m.id, quantidade, valorTotalCentavos: valor, data }), 'Compra registrada')) {
      navegar(`/estoque/materiais/${m.id}`, { substituir: true });
    }
  };

  return (
    <Pagina titulo="Compra de material" voltarPara={m ? `/estoque/materiais/${m.id}` : '/estoque/materiais'} largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Material">
            <Escolha
              value={materialId}
              onChange={setMaterialId}
              opcoes={materiais.map((x) => ({ valor: x.id, rotulo: `${x.nome}${x.tipo === 'insumo' ? ' (insumo)' : ''}` }))}
            />
          </Campo>
          <div class="campos-2">
            <Campo rotulo={m?.tipo === 'filamento' ? 'Quantidade comprada (kg)' : `Quantidade comprada (${un})`} dica={m?.tipo === 'filamento' ? 'Ex.: 1 carretel de 1 kg = 1' : undefined}>
              <Numero value={quantidade} onChange={setQuantidade} decimais={m?.tipo === 'filamento' ? 3 : 0} min={0} sufixo={un} />
            </Campo>
            <Campo rotulo="Valor total pago" dica="Com frete">
              <Dinheiro value={valor} onChange={setValor} />
            </Campo>
          </div>
          <Campo rotulo="Data da compra">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
        </div>
      </Cartao>
      {m && (
        <Cartao titulo="O que vai acontecer">
          <Resumo
            linhas={[
              { rotulo: 'Saldo', valor: r ? `${textoSaldo(m, r.saldoAntes)} → ${textoSaldo(m, r.saldoDepois)}` : textoSaldo(m, saldoMaterial(m.id)) },
              { rotulo: 'Custo desta compra', valor: r && Number.isFinite(r.custoCompra) ? custoTxt(r.custoCompra) : '—' },
              { rotulo: 'Custo médio atual', valor: custoTxt(m.custoMedio) },
              { rotulo: 'Novo custo médio', valor: r && Number.isFinite(r.custoNovo) ? custoTxt(r.custoNovo) : '—', destaque: true },
            ]}
          />
          <p class="muted" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
            Novo custo = (saldo × custo atual + quantidade comprada × custo da compra) ÷ (saldo + quantidade comprada). Com saldo zero ou negativo, vale o custo da compra.
          </p>
        </Cartao>
      )}
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!r} onClick={registrar}>
          Registrar compra
        </Botao>
      </div>
    </Pagina>
  );
}
