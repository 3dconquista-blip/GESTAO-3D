// "Venda rápida" (seção 10), enxuta (decisão 86): em 3 toques — produtos, forma de pagamento e Registrar.
// Grade de produtos com foto e busca; tocar adiciona 1. Sai do estoque de Casa e grava receita, taxa, custo do
// momento e lucro. Sem janela de confirmação: o aviso traz "Desfazer" (cancela a venda e devolve o carrinho à tela).
// Canal, cliente, data, desconto e preço de cada item ficam em "Mais detalhes".
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_CANAL_VENDA, ROTULO_FORMA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { lerLocal, salvarLocal } from '../../data/local.ts';
import { nomeCliente, nomeProduto, produtosAtivos, saldoCasa } from '../../data/selectors.ts';
import type { CanalVenda, Cents, FormaPagamento } from '../../data/types.ts';
import { hojeISO } from '../../lib/dates.ts';
import { combinaBusca, formatBRL, formatData, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { CANAIS_VENDA, FORMAS_PAGAMENTO, calcularVenda, desfazerVenda, registrarVenda, type CalculoVenda } from '../../services/vendas.ts';
import { Aviso, Botao, Busca, Campo, Cartao, Data, Dinheiro, Escolha, Icon, MaisDetalhes, Numero, Pagina, Resumo, Segmentado, Vazio, avisar } from '../../ui/index.ts';
import { executar } from '../estoque/comum.tsx';
import { FotoProduto } from '../estoque/ProdutosLista.tsx';
import './vendas.css';

interface Linha {
  produtoId: string;
  quantidade: number;
  precoUnitCentavos: Cents;
}

/** Última forma e último canal usados neste aparelho (só preferência, não vai para o backup). */
const CHAVE_FORMA = 'venda:forma';
const CHAVE_CANAL = 'venda:canal';

function formaSalva(): FormaPagamento {
  const f = lerLocal<string>(CHAVE_FORMA);
  return FORMAS_PAGAMENTO.find((x) => x === f) ?? 'pix';
}

function canalSalvo(): CanalVenda {
  const c = lerLocal<string>(CHAVE_CANAL);
  return CANAIS_VENDA.find((x) => x === c) ?? 'presencial';
}

export function VendaRapida(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState<Linha[]>([]);
  const [descTipo, setDescTipo] = useState<'reais' | 'pct'>('reais');
  const [descValor, setDescValor] = useState<number | null>(null);
  const [forma, setForma] = useState<FormaPagamento>(formaSalva);
  const [canal, setCanal] = useState<CanalVenda>(canalSalvo);
  const [clienteId, setClienteId] = useState<string>('');
  const [data, setData] = useState(hojeISO());
  // Trava contra toque duplo em "Registrar": solta quando a tela é redesenhada com o carrinho novo.
  const registrando = useRef(false);
  useEffect(() => {
    registrando.current = false;
  }, [carrinho]);
  // Para o "Desfazer": só devolve a venda à tela se ela ainda estiver aberta e sem outra venda em andamento.
  const carrinhoAtual = useRef(carrinho);
  carrinhoAtual.current = carrinho;
  const montada = useRef(true);
  useEffect(
    () => () => {
      montada.current = false;
    },
    [],
  );

  const hoje = hojeISO();
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
  const tirarUm = (produtoId: string) =>
    setCarrinho((c) => c.flatMap((l) => (l.produtoId !== produtoId ? [l] : l.quantidade > 1 ? [{ ...l, quantidade: l.quantidade - 1 }] : [])));
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

  const registrar = () => {
    if (!calc || pecas === 0 || registrando.current) return;
    registrando.current = true;
    // O que estava na tela, para o "Desfazer" devolver e o dono corrigir e registrar de novo.
    const antes = { carrinho, descTipo, descValor, forma, canal, clienteId, data };
    try {
      const v = registrarVenda({ itens: carrinho, desconto, forma, canal, clienteId: clienteId || null, data });
      salvarLocal(CHAVE_FORMA, forma);
      salvarLocal(CHAVE_CANAL, canal);
      avisar(`Venda de ${formatBRL(v.totalCentavos)} registrada · ${ROTULO_FORMA[forma]}`, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => {
          if (!executar(() => desfazerVenda(v.id))) return;
          // Já começou outra venda (ou saiu da tela): não troca o carrinho que está sendo montado.
          if (!montada.current || carrinhoAtual.current.length > 0) {
            avisar(montada.current ? 'Venda desfeita. O carrinho atual foi mantido.' : 'Venda desfeita');
            return;
          }
          avisar('Venda desfeita');
          setCarrinho(antes.carrinho);
          setDescTipo(antes.descTipo);
          setDescValor(antes.descValor);
          setForma(antes.forma);
          setCanal(antes.canal);
          setClienteId(antes.clienteId);
          setData(antes.data);
        },
      });
      // Próxima venda: forma e canal continuam; o resto volta ao padrão.
      setCarrinho([]);
      setDescValor(null);
      setClienteId('');
      setData(hojeISO());
    } catch (e) {
      registrando.current = false;
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const textoDesconto = !descValor
    ? ''
    : `desconto ${calc ? formatBRL(calc.descontoCentavos) : descTipo === 'pct' ? `${formatQtd(descValor)}%` : formatBRL(descValor)}`;
  const resumoDetalhes = [ROTULO_CANAL_VENDA[canal], nomeCliente(clienteId || null), !data || data === hoje ? 'hoje' : formatData(data), textoDesconto]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pagina
      titulo="Venda rápida"
      voltarPara={true}
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
                  <div key={p.id} class={`venda-produto ${q ? 'no-carrinho' : ''}`}>
                    <button
                      type="button"
                      class="venda-produto-add"
                      onClick={() => adicionar(p.id)}
                      aria-label={`Adicionar 1 ${p.nome}, ${formatBRL(p.precoEtiquetaCentavos)}, Casa: ${formatQtd(casa)}${q ? `, ${q} na venda` : ''}`}
                    >
                      <FotoProduto p={p} tamanho={56} />
                      <span class="venda-nome">{p.nome}</span>
                      <span class="venda-preco">{formatBRL(p.precoEtiquetaCentavos)}</span>
                      <span class={`venda-saldo ${casa <= 0 ? 'txt-ruim' : ''}`}>Casa: {formatQtd(casa)}</span>
                    </button>
                    {q > 0 && (
                      <>
                        <span class="venda-qtd" aria-hidden="true">
                          {q}
                        </span>
                        <button type="button" class="venda-produto-menos" onClick={() => tirarUm(p.id)} aria-label={`Tirar 1 ${p.nome}`} title="Tirar 1">
                          <Icon nome="minus" tamanho={18} />
                        </button>
                      </>
                    )}
                  </div>
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
                    <strong class="venda-linha-nome">{nomeProduto(l.produtoId)}</strong>
                    <strong class="venda-linha-total">{formatBRL(l.quantidade * l.precoUnitCentavos)}</strong>
                    <Numero
                      value={l.quantidade}
                      onChange={(v) => (v === 0 ? remover(l.produtoId) : mudar(l.produtoId, { quantidade: Math.max(0, v ?? 1) }))}
                      decimais={0}
                      min={0}
                      stepper
                      ariaLabel={`Quantidade de ${nomeProduto(l.produtoId)}`}
                    />
                    <small class="muted venda-linha-unit">{formatBRL(l.precoUnitCentavos)} cada</small>
                  </div>
                ))}
              </div>
            )}
          </Cartao>

          {calc && calc.faltas.length > 0 && (
            <Aviso tom="atencao">
              {calc.faltas.map((f) => `${nomeProduto(f.produtoId)}: faltam ${f.falta} em Casa`).join(' · ')}. O saldo fica negativo até o próximo ajuste.
            </Aviso>
          )}
          {erro && <Aviso tom="ruim">{erro}</Aviso>}

          <MaisDetalhes resumo={resumoDetalhes}>
            <Campo rotulo="Canal">
              <Segmentado value={canal} onChange={setCanal} opcoes={CANAIS_VENDA.map((c) => ({ valor: c, rotulo: ROTULO_CANAL_VENDA[c] }))} />
            </Campo>
            <div class="campos-2">
              <Campo rotulo="Cliente">
                <Escolha value={clienteId} onChange={setClienteId} opcoes={[{ valor: '', rotulo: 'Cliente avulso' }, ...clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))]} />
              </Campo>
              <Campo rotulo="Data">
                <Data value={data} onInput={setData} max={hoje} />
              </Campo>
            </div>
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
            {carrinho.length > 0 && (
              <>
                <strong>Preço de cada item</strong>
                <div class="campos-2">
                  {carrinho.map((l) => {
                    const etiqueta = db.get('produtos', l.produtoId)?.precoEtiquetaCentavos;
                    return (
                      <Campo key={l.produtoId} rotulo={nomeProduto(l.produtoId)} dica={etiqueta != null && etiqueta !== l.precoUnitCentavos ? `Etiqueta: ${formatBRL(etiqueta)}` : undefined}>
                        <Dinheiro value={l.precoUnitCentavos} onChange={(v) => mudar(l.produtoId, { precoUnitCentavos: v ?? 0 })} />
                      </Campo>
                    );
                  })}
                </div>
              </>
            )}
            {calc && (
              <Resumo
                linhas={[
                  { rotulo: 'Subtotal', valor: formatBRL(calc.subtotalCentavos) },
                  calc.descontoCentavos ? { rotulo: 'Desconto', valor: `− ${formatBRL(calc.descontoCentavos)}` } : null,
                  { rotulo: 'Total', valor: formatBRL(calc.totalCentavos), destaque: true },
                  calc.taxaCentavos ? { rotulo: 'Taxa do cartão', valor: `− ${formatBRL(calc.taxaCentavos)}` } : null,
                  { rotulo: 'Custo dos produtos', valor: `− ${formatReais(calc.custoTotal)}` },
                  { rotulo: 'Lucro estimado', valor: formatBRL(calc.lucroCentavos), tom: calc.lucroCentavos < 0 ? 'ruim' : 'ok' },
                ]}
              />
            )}
          </MaisDetalhes>
        </div>
      </div>

      <div class="barra-acoes-fixa">
        <div class="venda-barra">
          <div class="venda-barra-forma" role="group" aria-label="Forma de pagamento">
            <Segmentado bloco value={forma} onChange={setForma} opcoes={FORMAS_PAGAMENTO.map((f) => ({ valor: f, rotulo: ROTULO_FORMA[f] }))} />
            {forma === 'cartao' && (
              <small class="muted venda-barra-taxa">
                taxa do cartão {calc ? formatBRL(calc.taxaCentavos) : formatPct(db.config.custos.taxaCartaoPct)}
              </small>
            )}
          </div>
          <Botao variante="primario" icone="check" disabled={!calc || pecas === 0} onClick={registrar}>
            {calc ? `Registrar · ${formatBRL(calc.totalCentavos)}` : 'Registrar'}
          </Botao>
        </div>
      </div>
    </Pagina>
  );
}
