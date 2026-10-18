// "Venda rápida" (seção 10): grade de produtos com foto e busca; tocar adiciona 1.
// Sai do estoque de Casa e grava receita, taxa, custo do momento e lucro.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto, produtosAtivos, saldoCasa } from '../../data/selectors.ts';
import type { CanalVenda, Cents, FormaPagamento } from '../../data/types.ts';
import { hojeISO } from '../../lib/dates.ts';
import { combinaBusca, formatBRL, formatData, formatQtd, formatReais } from '../../lib/format.ts';
import { calcularVenda, registrarVenda, type CalculoVenda } from '../../services/vendas.ts';
import { Aviso, Botao, Busca, Campo, Cartao, Data, Dinheiro, Escolha, Numero, Pagina, Resumo, Segmentado, Vazio, avisar, confirmar } from '../../ui/index.ts';
import { FotoProduto } from '../estoque/ProdutosLista.tsx';
import './vendas.css';

interface Linha {
  produtoId: string;
  quantidade: number;
  precoUnitCentavos: Cents;
}

export function VendaRapida(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState<Linha[]>([]);
  const [descTipo, setDescTipo] = useState<'reais' | 'pct'>('reais');
  const [descValor, setDescValor] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [canal, setCanal] = useState<CanalVenda>('presencial');
  const [clienteId, setClienteId] = useState<string>('');
  const [data, setData] = useState(hojeISO());

  const produtos = produtosAtivos().filter((p) => combinaBusca(busca, p.nome, p.codigo, p.modelo, p.categoria));
  const clientes = db
    .all('clientes')
    .filter((c) => !c.arquivado && !c.anonimizado)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const adicionar = (produtoId: string) => {
    const p = db.get('produtos', produtoId);
    if (!p) return;
    setCarrinho((c) => {
      const i = c.findIndex((l) => l.produtoId === produtoId);
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, quantidade: l.quantidade + 1 } : l));
      return [...c, { produtoId, quantidade: 1, precoUnitCentavos: p.precoEtiquetaCentavos }];
    });
  };
  const mudar = (produtoId: string, patch: Partial<Linha>) => setCarrinho((c) => c.map((l) => (l.produtoId === produtoId ? { ...l, ...patch } : l)));
  const remover = (produtoId: string) => setCarrinho((c) => c.filter((l) => l.produtoId !== produtoId));

  const desconto = descValor ? { tipo: descTipo, valor: descValor } : null;
  let calc: CalculoVenda | null = null;
  let erro: string | null = null;
  if (carrinho.length) {
    try {
      calc = calcularVenda({ itens: carrinho, desconto, forma });
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }
  const qtdNoCarrinho = (id: string) => carrinho.find((l) => l.produtoId === id)?.quantidade ?? 0;
  const pecas = carrinho.reduce((s, l) => s + l.quantidade, 0);

  const registrar = async () => {
    if (!calc) return;
    const ok = await confirmar({
      titulo: `Registrar venda de ${formatBRL(calc.totalCentavos)}?`,
      itens: [
        ...calc.itens.filter((i) => i.quantidade > 0).map((i) => `${i.quantidade} × ${nomeProduto(i.produtoId)} a ${formatBRL(i.precoUnitCentavos)} — sai de Casa`),
        calc.descontoCentavos ? `Desconto: ${formatBRL(calc.descontoCentavos)}` : '',
        `${forma === 'pix' ? 'PIX' : forma === 'dinheiro' ? 'Dinheiro' : 'Cartão'}${calc.taxaCentavos ? ` (taxa ${formatBRL(calc.taxaCentavos)})` : ''} · ${ROTULO_CANAL_VENDA[canal]} · ${formatData(data)}`,
        `Lucro estimado: ${formatBRL(calc.lucroCentavos)}`,
        ...calc.faltas.map((f) => `Atenção: ${nomeProduto(f.produtoId)} fica negativo em Casa (faltam ${f.falta}).`),
      ].filter(Boolean),
      confirmar: 'Registrar venda',
    });
    if (!ok) return;
    try {
      const v = registrarVenda({ itens: carrinho, desconto, forma, canal, clienteId: clienteId || null, data });
      avisar(`Venda de ${formatBRL(v.totalCentavos)} registrada`);
      setCarrinho([]);
      setDescValor(null);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina
      titulo="Venda rápida"
      voltarPara="/mais"
      largura="larga"
      acoes={
        <Botao variante="secundario" icone="dinheiro" href="/vendas">
          Vendas
        </Botao>
      }
    >
      <div class="venda-layout">
        <div class="pilha pilha-m">
          <Busca value={busca} onInput={setBusca} placeholder="Buscar produto..." />
          {produtos.length === 0 ? (
            <Vazio icone="estoque" titulo={busca ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} texto={busca ? 'Tente outra busca.' : 'Cadastre produtos para vender.'} acao={busca ? undefined : { rotulo: 'Cadastrar produto', href: '/estoque/produtos/novo' }} />
          ) : (
            <div class="venda-grade">
              {produtos.map((p) => {
                const q = qtdNoCarrinho(p.id);
                const casa = saldoCasa(p.id);
                return (
                  <button key={p.id} type="button" class={`venda-produto ${q ? 'no-carrinho' : ''}`} onClick={() => adicionar(p.id)}>
                    {q > 0 && <span class="venda-qtd">{q}</span>}
                    <FotoProduto p={p} tamanho={56} />
                    <span class="venda-nome">{p.nome}</span>
                    <span class="venda-preco">{formatBRL(p.precoEtiquetaCentavos)}</span>
                    <span class={`venda-saldo ${casa <= 0 ? 'txt-ruim' : ''}`}>Casa: {formatQtd(casa)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div class="pilha pilha-m venda-lado">
          <Cartao titulo={`Venda${pecas ? ` · ${pecas} peça(s)` : ''}`}>
            {carrinho.length === 0 ? (
              <p class="muted">Toque nos produtos para adicionar.</p>
            ) : (
              <div class="pilha pilha-m">
                {carrinho.map((l) => (
                  <div key={l.produtoId} class="venda-linha">
                    <div class="venda-linha-topo">
                      <strong>{nomeProduto(l.produtoId)}</strong>
                      <Botao pequeno variante="fantasma" icone="fechar" title="Remover" onClick={() => remover(l.produtoId)} />
                    </div>
                    <div class="venda-linha-campos">
                      <Numero value={l.quantidade} onChange={(v) => (v === 0 ? remover(l.produtoId) : mudar(l.produtoId, { quantidade: Math.max(0, v ?? 1) }))} decimais={0} min={0} stepper ariaLabel="Quantidade" />
                      <Dinheiro value={l.precoUnitCentavos} onChange={(v) => mudar(l.produtoId, { precoUnitCentavos: v ?? 0 })} />
                    </div>
                    <small class="muted">
                      {l.quantidade} × {formatBRL(l.precoUnitCentavos)} = {formatBRL(l.quantidade * l.precoUnitCentavos)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </Cartao>

          <Cartao titulo="Pagamento">
            <div class="formulario">
              <Campo rotulo="Forma de pagamento">
                <Segmentado
                  bloco
                  value={forma}
                  onChange={setForma}
                  opcoes={[
                    { valor: 'pix', rotulo: 'PIX' },
                    { valor: 'dinheiro', rotulo: 'Dinheiro' },
                    { valor: 'cartao', rotulo: 'Cartão' },
                  ]}
                />
              </Campo>
              <Campo rotulo="Desconto">
                <div class="venda-desconto">
                  <Segmentado
                    value={descTipo}
                    onChange={(t) => {
                      setDescTipo(t);
                      setDescValor(null);
                    }}
                    opcoes={[
                      { valor: 'reais', rotulo: 'R$' },
                      { valor: 'pct', rotulo: '%' },
                    ]}
                  />
                  {descTipo === 'reais' ? <Dinheiro value={descValor} onChange={setDescValor} /> : <Numero value={descValor} onChange={setDescValor} min={0} max={100} sufixo="%" />}
                </div>
              </Campo>
              <Campo rotulo="Canal">
                <Segmentado
                  value={canal}
                  onChange={setCanal}
                  opcoes={(['presencial', 'whatsapp', 'instagram', 'feira'] as CanalVenda[]).map((c) => ({ valor: c, rotulo: ROTULO_CANAL_VENDA[c] }))}
                />
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Cliente (opcional)">
                  <Escolha value={clienteId} onChange={setClienteId} opcoes={[{ valor: '', rotulo: 'Cliente avulso' }, ...clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))]} />
                </Campo>
                <Campo rotulo="Data">
                  <Data value={data} onInput={setData} max={hojeISO()} />
                </Campo>
              </div>
            </div>
          </Cartao>

          {erro && <Aviso tom="ruim">{erro}</Aviso>}
          {calc && (
            <Cartao>
              <Resumo
                linhas={[
                  { rotulo: 'Subtotal', valor: formatBRL(calc.subtotalCentavos) },
                  calc.descontoCentavos ? { rotulo: 'Desconto', valor: `− ${formatBRL(calc.descontoCentavos)}` } : null,
                  { rotulo: 'Total', valor: formatBRL(calc.totalCentavos), destaque: true },
                  calc.taxaCentavos ? { rotulo: 'Taxa do cartão', valor: `− ${formatBRL(calc.taxaCentavos)}` } : null,
                  calc.impostoCentavos ? { rotulo: 'Imposto', valor: `− ${formatBRL(calc.impostoCentavos)}` } : null,
                  { rotulo: 'Custo dos produtos', valor: `− ${formatReais(calc.custoTotal)}` },
                  { rotulo: 'Lucro estimado', valor: formatBRL(calc.lucroCentavos), tom: calc.lucroCentavos < 0 ? 'ruim' : 'ok' },
                ]}
              />
              {calc.faltas.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <Aviso tom="atencao">
                    {calc.faltas.map((f) => (
                      <div key={f.produtoId}>
                        {nomeProduto(f.produtoId)}: faltam {f.falta} em Casa. A venda é registrada e o saldo fica negativo até o próximo ajuste.
                      </div>
                    ))}
                  </Aviso>
                </div>
              )}
            </Cartao>
          )}
        </div>
      </div>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!calc || calc.totalCentavos <= 0 && pecas === 0} onClick={registrar}>
          {calc ? `Registrar venda · ${formatBRL(calc.totalCentavos)}` : 'Registrar venda'}
        </Botao>
      </div>
    </Pagina>
  );
}
