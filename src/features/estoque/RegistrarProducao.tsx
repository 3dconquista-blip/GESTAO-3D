// "Registrar produção" (7.4), enxuto (decisões 85 e 86): produto, COR de cada filamento (botões com amostra, já
// marcando a última usada) e quantas mesas. As peças boas entram em Casa e o filamento sai do carretel da cor
// escolhida. Sem janela de confirmação: o aviso traz "Desfazer" (estorna a produção). Perdidas, data, peças por
// mesa e as últimas produções ficam em "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto, produtosAtivos } from '../../data/selectors.ts';
import type { ID, Producao } from '../../data/types.ts';
import { pecasPorMesas } from '../../domain/consumo.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatData, formatGramas, formatQtd } from '../../lib/format.ts';
import { coresDaProducao, estornarProducao, previaProducao, registrarProducao, type PreviaProducao } from '../../services/producao.ts';
import { Aviso, Botao, Campo, Cartao, Data, Escolha, MaisDetalhes, Numero, Pagina, Tabela, Vazio, avisar, type Coluna } from '../../ui/index.ts';
import { ModalMotivo, executar } from './comum.tsx';
import { AmostraCor } from './EstoqueAbas.tsx';

function qtdConsumo(c: PreviaProducao['consumo'][number], q: number): string {
  return c.tipo === 'filamento' ? formatGramas(q) : `${formatQtd(q)} ${c.unidade}`;
}

export function RegistrarProducao({ query }: TelaProps) {
  useDb();
  const produtos = produtosAtivos().filter((p) => p.mesas.length > 0);
  const [produtoId, setProdutoId] = useState<string | null>(query.get('produto') ?? produtos[0]?.id ?? null);
  const produto = produtos.find((p) => p.id === produtoId);
  const [mesas, setMesas] = useState<number | null>(Number(query.get('mesas')) || 1);
  const [porMesa, setPorMesa] = useState<number | null>(produto?.mesas[0]?.pecasPorMesa ?? 1);
  const [perdidas, setPerdidas] = useState<number | null>(0);
  const [data, setData] = useState(hojeISO());
  const [escolhidas, setEscolhidas] = useState<Record<string, ID>>({});
  const [estornando, setEstornando] = useState<Producao | null>(null);

  const trocarProduto = (id: string) => {
    setProdutoId(id);
    setPorMesa(produtos.find((x) => x.id === id)?.mesas[0]?.pecasPorMesa ?? 1);
    setEscolhidas({});
  };

  const posicoes = produto ? coresDaProducao(produto.id) : [];
  const cores: Record<string, ID> = {};
  for (const p of posicoes) {
    const id = escolhidas[p.chave] ?? p.padrao;
    if (id) cores[p.chave] = id;
  }
  const total = pecasPorMesas(mesas ?? 0, porMesa ?? 0);
  const qtdPerdida = Math.min(Math.max(0, perdidas ?? 0), total);
  const qtdBoa = Math.max(0, total - qtdPerdida);

  let previa: PreviaProducao | null = null;
  let erro: string | null = null;
  if (produto && total > 0) {
    try {
      previa = previaProducao({ produtoId: produto.id, qtdBoa, qtdPerdida, cores });
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

  const registrar = () => {
    if (!produto || !previa) return;
    try {
      const nova = registrarProducao({ produtoId: produto.id, qtdBoa, qtdPerdida, data, cores });
      const filamento = previa.consumo.filter((c) => c.tipo === 'filamento').map((c) => `${formatGramas(c.quantidade)} de ${c.nome}`).join(' + ');
      avisar(`${formatQtd(qtdBoa)} ${produto.nome} em Casa${filamento ? ` · ${filamento}` : ''}`, 'ok', {
        rotulo: 'Desfazer',
        onClick: () => executar(() => estornarProducao(nova.id, 'Desfeito logo após registrar'), 'Produção desfeita'),
      });
      navegar(`/estoque/produtos/${produto.id}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
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

          {posicoes.map((p) => (
            <Campo key={p.chave} rotulo={posicoes.length > 1 ? `Cor · ${p.rotulo}` : `Cor (${p.tipo})`}>
              {p.opcoes.length === 0 ? (
                <Aviso tom="atencao">
                  Nenhum filamento {p.tipo} cadastrado. <a href={`#/compra?nova=${p.tipo}`}>Cadastrar a cor na compra de material</a>.
                </Aviso>
              ) : (
                <div class="cores" role="radiogroup">
                  {p.opcoes.map((m) => {
                    const ativo = (escolhidas[p.chave] ?? p.padrao) === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={ativo}
                        class={`cor-botao ${ativo ? 'ativo' : ''}`}
                        onClick={() => setEscolhidas({ ...escolhidas, [p.chave]: m.id })}
                      >
                        <AmostraCor hex={m.corHex} tamanho={20} />
                        {m.corNome || m.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </Campo>
          ))}

          <Campo rotulo="Mesas impressas">
            <Numero value={mesas} onChange={setMesas} decimais={0} min={0} stepper />
          </Campo>
          <p class="prod-total">
            {formatQtd(mesas ?? 0)} mesa(s) de {formatQtd(porMesa ?? 0)} = <strong>{formatQtd(total)} peças</strong>
            {qtdPerdida > 0 && ` (${formatQtd(qtdPerdida)} perdida(s), ${formatQtd(qtdBoa)} boas)`}
          </p>
          {previa && (
            <p class="muted prod-baixa">
              Entram {formatQtd(previa.entramEmCasa)} em Casa · baixa {previa.consumo.map((c) => `${qtdConsumo(c, c.quantidade)} de ${c.nome}`).join(', ')}
            </p>
          )}
          {previa?.faltaMaterial && <Aviso tom="atencao">Algum material vai ficar negativo. A produção é registrada mesmo assim; depois pese o carretel ou lance a compra.</Aviso>}
          {erro && <Aviso tom="ruim">{erro}</Aviso>}
        </div>
      </Cartao>

      <MaisDetalhes resumo={[qtdPerdida ? `${qtdPerdida} perdida(s)` : '', data !== hojeISO() ? formatData(data) : ''].filter(Boolean).join(' · ') || undefined}>
        <div class="campos-2">
          <Campo rotulo="Perdidas em falhas" dica="Das peças impressas, quantas não prestaram">
            <Numero value={perdidas} onChange={setPerdidas} decimais={0} min={0} max={total} stepper />
          </Campo>
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
          <Campo rotulo="Peças por mesa" dica={produto ? `Ficha: ${produto.mesas[0]?.pecasPorMesa ?? 1} por mesa` : undefined}>
            <Numero value={porMesa} onChange={setPorMesa} decimais={0} min={1} stepper />
          </Campo>
        </div>
        <strong>Últimas produções</strong>
        <Tabela colunas={colunas} linhas={recentes} chave={(p) => p.id} vazio={<p class="muted">Nenhuma produção registrada ainda.</p>} />
      </MaisDetalhes>

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
