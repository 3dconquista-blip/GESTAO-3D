// Estoque > Produtos (7.1): foto, nome, em Casa, nos parceiros, total, custo, preço e margem com cor de status.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { custoProduto, saldosDoProduto, statusMargemProduto } from '../../data/selectors.ts';
import type { Produto } from '../../data/types.ts';
import { simular, type StatusMargem } from '../../domain/pricing.ts';
import { combinaBusca, formatBRL, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { valorParadoEmEstoque } from '../../services/ajustes.ts';
import { alertaLicenca } from '../../services/produtos.ts';
import { Botao, Busca, Cartao, Chave, Escolha, Icon, Pagina, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { alertasAtuais } from '../../services/consultas.ts';
import { ResumoAlertas } from './Alertas.tsx';
import { EstoqueAbas } from './EstoqueAbas.tsx';

const TOM_MARGEM: Record<StatusMargem, 'ok' | 'atencao' | 'ruim' | 'neutro'> = { ok: 'ok', atencao: 'atencao', prejuizo: 'ruim', sem_preco: 'neutro' };

/** Selo da margem do produto: menor margem entre os canais ativos, com a cor do status. */
export function SeloMargem({ p }: { p: Produto }) {
  const st = statusMargemProduto(p);
  if (st === 'sem_preco') return <Selo tom="neutro">Sem preço</Selo>;
  const sim = simular(p.precoEtiquetaCentavos, custoProduto(p.id), db.config.canais, db.config.custos);
  return <Selo tom={TOM_MARGEM[st]}>{Number.isFinite(sim.piorMargemPct) ? formatPct(sim.piorMargemPct) : '—'}</Selo>;
}

export function FotoProduto({ p, tamanho = 40 }: { p: Produto; tamanho?: number }) {
  return p.fotoDataUrl ? (
    <img class="est-foto" src={p.fotoDataUrl} alt="" style={{ width: `${tamanho}px`, height: `${tamanho}px` }} />
  ) : (
    <span class="est-foto" style={{ width: `${tamanho}px`, height: `${tamanho}px` }}>
      <Icon nome="estoque" tamanho={tamanho * 0.5} />
    </span>
  );
}

export function ProdutosLista(_props: TelaProps) {
  useDb();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [modelo, setModelo] = useState('');
  const [arquivados, setArquivados] = useState(false);

  const todos = db.all('produtos');
  const visiveis = todos.filter((p) => (arquivados ? p.arquivado : !p.arquivado));
  const modelos = Array.from(new Set(visiveis.map((p) => p.modelo))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const lista = visiveis
    .filter((p) => (!categoria || p.categoria === categoria) && (!modelo || p.modelo === modelo))
    .filter((p) => combinaBusca(busca, p.nome, p.codigo, p.modelo, p.cor, p.categoria))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const parado = valorParadoEmEstoque();

  const colunas: Coluna<Produto>[] = [
    {
      id: 'nome',
      rotulo: 'Produto',
      principal: true,
      render: (p) => (
        <span class="est-nome">
          <FotoProduto p={p} />
          <span class="est-nome-textos">
            <strong>{p.nome}</strong>
            <small>
              {p.codigo} · {p.categoria}
              {alertaLicenca(p) && ' · licença a conferir'}
            </small>
          </span>
        </span>
      ),
    },
    {
      id: 'casa',
      rotulo: 'Em Casa',
      alinhar: 'dir',
      render: (p) => {
        const s = saldosDoProduto(p.id).casa;
        return <span class={s < 0 ? 'txt-ruim negrito' : s < p.estoqueMinimo ? 'txt-atencao negrito' : ''}>{formatQtd(s)}</span>;
      },
    },
    { id: 'parceiros', rotulo: 'Nos parceiros', alinhar: 'dir', render: (p) => formatQtd(saldosDoProduto(p.id).parceiros) },
    { id: 'total', rotulo: 'Total', alinhar: 'dir', render: (p) => <strong>{formatQtd(saldosDoProduto(p.id).total)}</strong> },
    { id: 'custo', rotulo: 'Custo', alinhar: 'dir', render: (p) => formatReais(custoProduto(p.id)) },
    { id: 'preco', rotulo: 'Preço', alinhar: 'dir', render: (p) => formatBRL(p.precoEtiquetaCentavos) },
    { id: 'margem', rotulo: 'Margem', alinhar: 'dir', render: (p) => <SeloMargem p={p} /> },
  ];

  return (
    <Pagina
      titulo="Estoque"
      acoes={
        <>
          <Botao variante="secundario" icone="impressora" href="/producao/nova">
            Produção
          </Botao>
          <Botao variante="primario" icone="plus" href="/estoque/produtos/novo">
            Novo produto
          </Botao>
        </>
      }
    >
      <EstoqueAbas ativa="produtos" />
      <ResumoAlertas alertas={alertasAtuais()} />
      {todos.length > 0 && (
        <div class="est-parado">
          <span>Valor parado em estoque (a custo):</span>
          <span>
            em Casa <strong>{formatReais(parado.casa)}</strong>
          </span>
          <span>
            nos parceiros <strong>{formatReais(parado.parceiros)}</strong>
          </span>
        </div>
      )}
      <div class="est-filtros">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar produto ou código..." />
        <Escolha value={categoria} onChange={setCategoria} opcoes={[{ valor: '', rotulo: 'Todas as categorias' }, ...db.config.categorias.map((c) => ({ valor: c, rotulo: c }))]} />
        <Escolha value={modelo} onChange={setModelo} opcoes={[{ valor: '', rotulo: 'Todos os modelos' }, ...modelos.map((m) => ({ valor: m, rotulo: m }))]} />
        <Chave checked={arquivados} onChange={setArquivados}>
          Arquivados
        </Chave>
      </div>
      {lista.length === 0 ? (
        todos.length === 0 ? (
          <Vazio
            icone="estoque"
            titulo="Nenhum produto cadastrado"
            texto="Cadastre um produto com a ficha técnica do fatiador e o app calcula o custo e o preço em cada canal."
            acao={{ rotulo: 'Cadastrar o primeiro produto', href: '/estoque/produtos/novo' }}
          />
        ) : (
          <Vazio icone="busca" titulo="Nenhum produto encontrado" texto="Mude a busca ou os filtros." />
        )
      ) : (
        <Cartao>
          <Tabela
            colunas={colunas}
            linhas={lista}
            chave={(p) => p.id}
            onClickLinha={(p) => navegar(`/estoque/produtos/${p.id}`)}
            tomLinha={(p) => (statusMargemProduto(p) === 'prejuizo' ? 'ruim' : undefined)}
          />
        </Cartao>
      )}
    </Pagina>
  );
}
