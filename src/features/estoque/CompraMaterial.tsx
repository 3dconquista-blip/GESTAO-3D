// "Compra de material" (7.3): soma ao saldo e recalcula o custo médio. Enxuta (decisão 86): dá para cadastrar uma
// cor nova de filamento aqui mesmo ("+ Nova cor"), e registrar não abre janela: o aviso traz "Desfazer".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { materiaisAtivos, saldoMaterial } from '../../data/selectors.ts';
import type { TipoFilamento } from '../../data/types.ts';
import { hexDaCor, TIPOS_FILAMENTO } from '../../domain/filamento.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatQtd, formatReais } from '../../lib/format.ts';
import { resumoCompra, unidadeCompra } from '../../domain/materiais.ts';
import { comprarMaterial, estornarMovMaterial, salvarMaterial } from '../../services/materiais.ts';
import { Botao, Campo, Cartao, Data, Dinheiro, Escolha, MaisDetalhes, Numero, Pagina, Segmentado, Texto, avisar } from '../../ui/index.ts';
import { AmostraCor } from './EstoqueAbas.tsx';
import { executar } from './comum.tsx';
import { textoSaldo } from './MateriaisLista.tsx';

/** Valor do seletor para "+ Nova cor de filamento". */
const NOVA_COR = '__nova_cor__';

export function CompraMaterial({ query }: TelaProps) {
  useDb();
  const materiais = materiaisAtivos();
  // "?nova=PLA" (vindo do Registrar produção) já abre na cor nova daquele tipo.
  const tipoPedido = TIPOS_FILAMENTO.find((t) => t === query.get('nova'));
  const [materialId, setMaterialId] = useState<string | null>(tipoPedido ? NOVA_COR : (query.get('material') ?? materiais[0]?.id ?? NOVA_COR));
  const [tipoNovo, setTipoNovo] = useState<TipoFilamento>(tipoPedido ?? 'PLA');
  const [corNova, setCorNova] = useState('');
  const [quantidade, setQuantidade] = useState<number | null>(materialId === NOVA_COR ? 1 : null);
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hojeISO());

  const nova = materialId === NOVA_COR;
  const m = nova ? undefined : materiais.find((x) => x.id === materialId);
  const ehFilamento = nova || m?.tipo === 'filamento';
  const un = m ? unidadeCompra(m) : 'kg';
  const r = m && quantidade && quantidade > 0 && valor != null ? resumoCompra(m, saldoMaterial(m.id), quantidade, valor) : null;
  const custoTxt = (v: number) => (ehFilamento ? `${formatReais(v)}/kg` : `${formatReais(v, v < 1 ? 4 : 2)}/${m?.unidade}`);
  const pronto = !!quantidade && quantidade > 0 && valor != null && (nova ? !!corNova.trim() : !!m);

  const registrar = () => {
    if (!pronto || !quantidade || valor == null) return;
    try {
      const alvo = nova ? salvarMaterial({ tipo: 'filamento', material: tipoNovo, corNome: corNova.trim(), custoMedio: 0 }) : m!;
      const res = comprarMaterial({ materialId: alvo.id, quantidade, valorTotalCentavos: valor, data });
      avisar(`Compra registrada: ${alvo.nome} (${textoSaldo(res.material, saldoMaterial(alvo.id))})`, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => executar(() => estornarMovMaterial(res.mov.id, 'Desfeito logo após registrar'), 'Compra desfeita'),
      });
      navegar(`/estoque/materiais/${alvo.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo="Compra de material" voltarPara={m ? `/estoque/materiais/${m.id}` : '/estoque/materiais'} largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Material">
            <Escolha
              value={materialId}
              onChange={(v) => {
                setMaterialId(v);
                if (v === NOVA_COR && quantidade == null) setQuantidade(1);
              }}
              opcoes={[
                ...materiais.map((x) => ({ valor: x.id, rotulo: `${x.nome}${x.tipo === 'insumo' ? ' (insumo)' : ''}` })),
                { valor: NOVA_COR, rotulo: '+ Nova cor de filamento' },
              ]}
            />
          </Campo>
          {nova && (
            <>
              <Campo rotulo="Tipo">
                <Segmentado value={tipoNovo} onChange={setTipoNovo} opcoes={TIPOS_FILAMENTO.map((t) => ({ valor: t, rotulo: t }))} />
              </Campo>
              <Campo rotulo="Cor" obrigatorio>
                <div class="cfg-cor">
                  <AmostraCor hex={hexDaCor(corNova)} tamanho={28} />
                  <Texto value={corNova} onInput={setCorNova} placeholder="Ex.: Azul" autoFocus />
                </div>
              </Campo>
            </>
          )}
          <div class="campos-2">
            <Campo rotulo={ehFilamento ? 'Quantidade comprada (kg)' : `Quantidade comprada (${un})`} dica={ehFilamento ? '1 carretel de 1 kg = 1' : undefined}>
              <Numero value={quantidade} onChange={setQuantidade} decimais={ehFilamento ? 3 : 0} min={0} sufixo={ehFilamento ? 'kg' : un} />
            </Campo>
            <Campo rotulo="Valor total pago" dica="Com frete">
              <Dinheiro value={valor} onChange={setValor} />
            </Campo>
          </div>
          {r && (
            <p class="muted prod-baixa">
              Saldo {textoSaldo(m!, r.saldoAntes)} → {textoSaldo(m!, r.saldoDepois)} · custo médio {custoTxt(r.custoAtual)} → <strong>{Number.isFinite(r.custoNovo) ? custoTxt(r.custoNovo) : '—'}</strong>
            </p>
          )}
          {nova && quantidade && valor != null && quantidade > 0 && (
            <p class="muted prod-baixa">
              Cor nova com custo de {formatReais(valor / 100 / quantidade)}/kg e {formatQtd(quantidade * 1000)} g em estoque.
            </p>
          )}
        </div>
      </Cartao>
      <MaisDetalhes resumo={data !== hojeISO() ? data.split('-').reverse().join('/') : undefined}>
        <Campo rotulo="Data da compra">
          <Data value={data} onInput={setData} max={hojeISO()} />
        </Campo>
        <p class="muted" style={{ fontSize: '0.85rem' }}>
          Novo custo médio = (saldo × custo atual + quantidade comprada × custo da compra) ÷ (saldo + quantidade comprada). Com saldo zero ou negativo, vale o
          custo da compra.
        </p>
      </MaisDetalhes>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!pronto} onClick={registrar}>
          Registrar compra
        </Botao>
      </div>
    </Pagina>
  );
}
