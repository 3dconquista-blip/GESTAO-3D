// "Registrar produção" (7.4): peças boas entram em Casa; filamento e componentes são baixados.
// Atalho por mesas: "2 mesas de 8" = 16 peças.
import { useMemo, useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeMaterial, nomeProduto, produtosAtivos } from '../../data/selectors.ts';
import type { MesaFilamento, Producao } from '../../data/types.ts';
import { consumoFicha, pecasPorMesas } from '../../domain/consumo.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatData, formatGramas, formatQtd, formatReais } from '../../lib/format.ts';
import { estornarProducao, previaProducao, registrarProducao, type PreviaProducao } from '../../services/producao.ts';
import { Aviso, Botao, Campo, Cartao, Data, Escolha, Marcador, Numero, Pagina, Resumo, Segmentado, Tabela, Vazio, confirmar, type Coluna } from '../../ui/index.ts';
import { ModalMotivo, executar } from './comum.tsx';

function qtdConsumo(c: PreviaProducao['consumo'][number], q: number): string {
  return c.tipo === 'filamento' ? formatGramas(q) : `${formatQtd(q)} ${c.unidade}`;
}

export function RegistrarProducao({ query }: TelaProps) {
  useDb();
  const produtos = produtosAtivos().filter((p) => p.mesas.length > 0);
  const [produtoId, setProdutoId] = useState<string | null>(query.get('produto') ?? produtos[0]?.id ?? null);
  const produto = produtos.find((p) => p.id === produtoId);
  const [modo, setModo] = useState<'mesas' | 'pecas'>('mesas');
  const [mesas, setMesas] = useState<number | null>(1);
  const [porMesa, setPorMesa] = useState<number | null>(produto?.mesas[0]?.pecasPorMesa ?? 1);
  const [boasDireto, setBoasDireto] = useState<number | null>(null);
  const [perdidas, setPerdidas] = useState<number | null>(0);
  const [data, setData] = useState(hojeISO());
  const [usarReais, setUsarReais] = useState(false);
  const [reais, setReais] = useState<Record<string, number | null>>({});
  const [estornando, setEstornando] = useState<Producao | null>(null);

  const trocarProduto = (id: string) => {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    setPorMesa(p?.mesas[0]?.pecasPorMesa ?? 1);
    setReais({});
    setUsarReais(false);
  };

  const total = modo === 'mesas' ? pecasPorMesas(mesas ?? 0, porMesa ?? 0) : (boasDireto ?? 0) + (perdidas ?? 0);
  const qtdPerdida = Math.max(0, perdidas ?? 0);
  const qtdBoa = modo === 'mesas' ? Math.max(0, total - qtdPerdida) : Math.max(0, boasDireto ?? 0);

  // Gramas calculadas pela ficha (padrão das "gramas reais").
  const calculado = useMemo(() => (produto ? consumoFicha(produto, qtdBoa, qtdPerdida).filamentos : []), [produto, qtdBoa, qtdPerdida]);
  const gramasReais: MesaFilamento[] | undefined = usarReais
    ? calculado.map((f) => ({ materialId: f.materialId, gramas: reais[f.materialId] ?? f.gramas }))
    : undefined;

  let previa: PreviaProducao | null = null;
  let erro: string | null = null;
  if (produto && qtdBoa + qtdPerdida > 0) {
    try {
      previa = previaProducao({ produtoId: produto.id, qtdBoa, qtdPerdida, gramasReais });
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }

  const recentes = db
    .all('producoes')
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm))
    .slice(0, 10);

  if (!produtos.length) {
    return (
      <Pagina titulo="Registrar produção" voltarPara="/estoque/produtos">
        <Vazio icone="impressora" titulo="Nenhum produto com ficha técnica" texto="Cadastre um produto com a ficha técnica para registrar a produção." acao={{ rotulo: 'Cadastrar produto', href: '/estoque/produtos/novo' }} />
      </Pagina>
    );
  }

  const registrar = async () => {
    if (!produto || !previa) return;
    const ok = await confirmar({
      titulo: 'Registrar a produção?',
      itens: [
        `${previa.entramEmCasa} ${previa.nomeProduto} entram em Casa (${formatQtd(previa.saldoCasaAntes)} → ${formatQtd(previa.saldoCasaDepois)})`,
        qtdPerdida ? `${qtdPerdida} peça(s) perdida(s) em falhas` : '',
        ...previa.consumo.map((c) => `Baixa de ${qtdConsumo(c, c.quantidade)} de ${c.nome} (${qtdConsumo(c, c.saldoAntes)} → ${qtdConsumo(c, c.saldoDepois)})${c.suficiente ? '' : ' — vai ficar negativo'}`),
      ].filter(Boolean),
      confirmar: 'Registrar produção',
    });
    if (!ok) return;
    if (executar(() => registrarProducao({ produtoId: produto.id, qtdBoa, qtdPerdida, data, gramasReais }), 'Produção registrada')) {
      navegar(`/estoque/produtos/${produto.id}`);
    }
  };

  const colunas: Coluna<Producao>[] = [
    { id: 'data', rotulo: 'Data', render: (p) => formatData(p.data), principal: true },
    { id: 'produto', rotulo: 'Produto', render: (p) => nomeProduto(p.produtoId) },
    { id: 'boas', rotulo: 'Boas', alinhar: 'dir', render: (p) => formatQtd(p.qtdBoa) },
    { id: 'perdidas', rotulo: 'Perdidas', alinhar: 'dir', render: (p) => formatQtd(p.qtdPerdida) },
    {
      id: 'acao',
      rotulo: '',
      alinhar: 'dir',
      render: (p) =>
        p.estornada ? (
          <small class="muted">Estornada</small>
        ) : (
          <Botao pequeno variante="fantasma" onClick={() => setEstornando(p)}>
            Estornar
          </Botao>
        ),
    },
  ];

  return (
    <Pagina titulo="Registrar produção" voltarPara="/estoque/produtos" largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Produto">
            <Escolha value={produtoId} onChange={trocarProduto} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
          </Campo>
          <Segmentado
            bloco
            value={modo}
            onChange={setModo}
            opcoes={[
              { valor: 'mesas', rotulo: 'Por mesas' },
              { valor: 'pecas', rotulo: 'Por peças' },
            ]}
          />
          {modo === 'mesas' ? (
            <>
              <div class="campos-2">
                <Campo rotulo="Mesas impressas">
                  <Numero value={mesas} onChange={setMesas} decimais={0} min={0} stepper />
                </Campo>
                <Campo rotulo="Peças por mesa" dica={produto ? `Ficha: ${produto.mesas[0]?.pecasPorMesa ?? 1} por mesa` : undefined}>
                  <Numero value={porMesa} onChange={setPorMesa} decimais={0} min={1} stepper />
                </Campo>
              </div>
              <p class="prod-total">
                {formatQtd(mesas ?? 0)} mesa(s) de {formatQtd(porMesa ?? 0)} = <strong>{formatQtd(total)} peças</strong>
              </p>
              <Campo rotulo="Perdidas em falhas" dica="Das peças impressas, quantas não prestaram">
                <Numero value={perdidas} onChange={setPerdidas} decimais={0} min={0} max={total} stepper />
              </Campo>
            </>
          ) : (
            <div class="campos-2">
              <Campo rotulo="Quantidade boa">
                <Numero value={boasDireto} onChange={setBoasDireto} decimais={0} min={0} stepper />
              </Campo>
              <Campo rotulo="Perdidas em falhas">
                <Numero value={perdidas} onChange={setPerdidas} decimais={0} min={0} stepper />
              </Campo>
            </div>
          )}
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
          <Marcador checked={usarReais} onChange={setUsarReais}>
            Informar gramas reais (substitui o cálculo pela ficha)
          </Marcador>
          {usarReais && (
            <div class="campos-2">
              {calculado.map((f) => (
                <Campo key={f.materialId} rotulo={nomeMaterial(f.materialId)} dica={`Pela ficha: ${formatGramas(f.gramas)}`}>
                  <Numero value={reais[f.materialId] ?? f.gramas} onChange={(v) => setReais({ ...reais, [f.materialId]: v })} decimais={1} min={0} sufixo="g" />
                </Campo>
              ))}
            </div>
          )}
        </div>
      </Cartao>

      {erro && <Aviso tom="ruim">{erro}</Aviso>}
      {previa && (
        <Cartao titulo="O que vai acontecer">
          <Resumo
            linhas={[
              { rotulo: `Entram em Casa`, valor: `${formatQtd(previa.entramEmCasa)} (${formatQtd(previa.saldoCasaAntes)} → ${formatQtd(previa.saldoCasaDepois)})`, destaque: true },
              ...previa.consumo.map((c) => ({
                rotulo: `Baixa de ${c.nome}`,
                valor: `${qtdConsumo(c, c.quantidade)} (fica ${qtdConsumo(c, c.saldoDepois)})`,
                tom: c.suficiente ? undefined : ('ruim' as const),
              })),
              { rotulo: 'Custo por peça (fica gravado)', valor: formatReais(previa.custoUnit, 4) },
            ]}
          />
          {previa.faltaMaterial && (
            <div style={{ marginTop: '10px' }}>
              <Aviso tom="atencao">Algum material vai ficar com saldo negativo. A produção é registrada mesmo assim; depois pese o carretel ou lance a compra.</Aviso>
            </div>
          )}
          <p class="muted" style={{ marginTop: '8px', fontSize: '0.85rem' }}>
            A falha real não muda o custo do produto (o custo já tem a taxa de falha). A taxa de falha real aparece em Relatórios.
          </p>
        </Cartao>
      )}

      <Cartao titulo="Últimas produções">
        <Tabela colunas={colunas} linhas={recentes} chave={(p) => p.id} vazio={<p class="muted">Nenhuma produção registrada ainda.</p>} />
      </Cartao>

      {estornando && (
        <ModalMotivo
          aberto
          titulo="Estornar esta produção?"
          rotuloConfirmar="Estornar produção"
          perigo
          onFechar={() => setEstornando(null)}
          onConfirmar={(motivo) => executar(() => estornarProducao(estornando.id, motivo), 'Produção estornada')}
        >
          <p>
            {formatData(estornando.data)}: {estornando.qtdBoa} {nomeProduto(estornando.produtoId)} saem de Casa e os materiais baixados voltam ao saldo.
          </p>
        </ModalMotivo>
      )}

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="impressora" disabled={!previa} onClick={registrar}>
          Registrar produção
        </Botao>
      </div>
    </Pagina>
  );
}
