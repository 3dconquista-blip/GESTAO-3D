// Detalhe do produto: dados, ficha técnica e custo, simulador de preço, saldo por local e histórico.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_TIPO_MOV } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { composicaoProduto, custoProduto, materiaisAtivos, nomeMaterial, saldosDoProduto } from '../../data/selectors.ts';
import type { LocalId, MovEstoque, Produto } from '../../data/types.ts';
import { CASA, parceiroDoLocal } from '../../data/types.ts';
import { simular } from '../../domain/pricing.ts';
import { formatBRL, formatData, formatDuracao, formatGramas, formatQtd, formatReais } from '../../lib/format.ts';
import { alertaLicenca, arquivarProduto, duplicarParaOutraCor, nomeParaCor, salvarProduto } from '../../services/produtos.ts';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Escolha,
  Grade,
  Indicador,
  Linha,
  Modal,
  Pagina,
  Resumo,
  Selo,
  Tabela,
  Texto,
  Vazio,
  avisar,
  confirmar,
  type Coluna,
} from '../../ui/index.ts';
import { ComposicaoCustoView, SimuladorPreco } from '../precos/componentes.tsx';
import { FotoProduto, SeloMargem } from './ProdutosLista.tsx';

/** Nome do local: 'Casa' ou o nome do parceiro. */
export function nomeLocal(local: LocalId | null): string {
  if (!local) return '—';
  if (local === CASA) return 'Casa';
  const pid = parceiroDoLocal(local);
  return (pid && db.get('parceiros', pid)?.nome) || 'Parceiro';
}

function DuplicarCor({ p, aberto, onFechar }: { p: Produto; aberto: boolean; onFechar: () => void }) {
  const filamentosDoProduto = Array.from(new Set(p.mesas.flatMap((m) => m.filamentos.map((f) => f.materialId))));
  const [cor, setCor] = useState('');
  const [de, setDe] = useState(filamentosDoProduto[0] ?? '');
  const [para, setPara] = useState('');
  const nome = cor.trim() ? nomeParaCor(p.nome, p.cor, cor) : '';
  const duplicar = () => {
    try {
      const novo = duplicarParaOutraCor(p.id, { cor, trocarFilamento: de && para ? { de, para } : undefined });
      avisar(`Criado ${novo.nome} (${novo.codigo})`);
      onFechar();
      navegar(`/estoque/produtos/${novo.id}`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };
  return (
    <Modal
      aberto={aberto}
      titulo="Duplicar para outra cor"
      onFechar={onFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={onFechar}>
            Voltar
          </Botao>
          <Botao variante="primario" onClick={duplicar} disabled={!cor.trim()}>
            Duplicar
          </Botao>
        </>
      }
    >
      <p class="muted">Cria outro produto com a mesma ficha técnica e preço. Cada cor é um item de estoque separado.</p>
      <Campo rotulo="Nova cor" obrigatorio>
        <Texto value={cor} onInput={setCor} placeholder="Ex.: Rosa" autoFocus />
      </Campo>
      {filamentosDoProduto.length > 0 && (
        <div class="campos-2">
          <Campo rotulo="Trocar o filamento">
            <Escolha value={de} onChange={setDe} opcoes={filamentosDoProduto.map((id) => ({ valor: id, rotulo: nomeMaterial(id) }))} />
          </Campo>
          <Campo rotulo="Pelo filamento">
            <Escolha
              value={para || null}
              onChange={setPara}
              placeholder="Manter o mesmo"
              opcoes={materiaisAtivos('filamento')
                .filter((m) => m.id !== de)
                .map((m) => ({ valor: m.id, rotulo: m.nome }))}
            />
          </Campo>
        </div>
      )}
      {nome && (
        <p>
          Nome do novo produto: <strong>{nome}</strong>
        </p>
      )}
    </Modal>
  );
}

export function ProdutoDetalhe({ params }: TelaProps) {
  useDb();
  const [duplicando, setDuplicando] = useState(false);
  const p = db.get('produtos', params.id);
  if (!p) {
    return (
      <Pagina titulo="Produto" voltarPara="/estoque/produtos">
        <Vazio titulo="Produto não encontrado" acao={{ rotulo: 'Ver produtos', href: '/estoque/produtos' }} />
      </Pagina>
    );
  }
  const custo = custoProduto(p.id);
  const comp = composicaoProduto(p.id);
  const saldos = saldosDoProduto(p.id);
  const sim = p.precoEtiquetaCentavos ? simular(p.precoEtiquetaCentavos, custo, db.config.canais, db.config.custos) : null;
  const abaixo = sim ? sim.linhas.filter((l) => l.abaixoMinima || l.prejuizo).map((l) => l.canal.nome) : [];
  const movs = db
    .all('movEstoque')
    .filter((m) => m.produtoId === p.id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const locais = Array.from(saldos.porLocal.entries()).filter(([l, q]) => l === CASA || q !== 0);
  if (!saldos.porLocal.has(CASA)) locais.unshift([CASA, 0]);

  const usarPreco = async (c: number) => {
    const ok = await confirmar({ titulo: 'Trocar o preço de etiqueta?', itens: [`De ${formatBRL(p.precoEtiquetaCentavos)} para ${formatBRL(c)}.`, 'Vale para todos os canais. Vendas já feitas não mudam.'] });
    if (!ok) return;
    try {
      salvarProduto({ id: p.id, nome: p.nome, categoria: p.categoria, mesas: p.mesas, precoEtiquetaCentavos: c });
      avisar('Preço de etiqueta atualizado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const arquivar = async () => {
    if (!p.arquivado) {
      const ok = await confirmar({
        titulo: `Arquivar "${p.nome}"?`,
        itens: ['Some das listas, da venda rápida e dos mixes novos.', 'O histórico continua guardado. Dá para reativar depois.', saldos.total ? `Ainda há ${formatQtd(saldos.total)} peça(s) em estoque.` : ''].filter(Boolean),
        confirmar: 'Arquivar',
      });
      if (!ok) return;
    }
    try {
      arquivarProduto(p.id, !p.arquivado);
      avisar(p.arquivado ? 'Produto reativado' : 'Produto arquivado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const colunasMov: Coluna<MovEstoque>[] = [
    { id: 'data', rotulo: 'Data', render: (m) => formatData(m.data), principal: true },
    { id: 'tipo', rotulo: 'Tipo', render: (m) => ROTULO_TIPO_MOV[m.tipo] ?? m.tipo },
    { id: 'de', rotulo: 'De → Para', render: (m) => `${nomeLocal(m.origem)} → ${nomeLocal(m.destino)}` },
    { id: 'qtd', rotulo: 'Qtd.', alinhar: 'dir', render: (m) => formatQtd(m.quantidade) },
    { id: 'motivo', rotulo: 'Motivo', render: (m) => m.motivo ?? '', esconderNoCelular: true },
  ];

  return (
    <Pagina
      titulo={p.nome}
      subtitulo={[p.codigo, p.categoria, p.modelo !== p.nome ? p.modelo : '', p.arquivado ? 'Arquivado' : ''].filter(Boolean).join(' · ')}
      voltarPara="/estoque/produtos"
      acoes={
        <Botao variante="primario" icone="editar" href={`/estoque/produtos/${p.id}/editar`}>
          Editar
        </Botao>
      }
    >
      {abaixo.length > 0 && (
        <Aviso tom="ruim" titulo="Margem abaixo da mínima">
          Com o preço de etiqueta atual ({formatBRL(p.precoEtiquetaCentavos)}): {abaixo.join(', ')}. Confira o simulador abaixo.
        </Aviso>
      )}
      {alertaLicenca(p) && <Aviso tom="atencao">Modelo de terceiro: confira se a licença permite vender.{p.linkModelo && <> <a href={p.linkModelo} target="_blank" rel="noopener">Abrir o modelo</a></>}</Aviso>}

      <div class="indicadores">
        <Indicador rotulo="Custo por peça" valor={formatReais(custo)} detalhe={formatReais(custo, 4)} />
        <Indicador rotulo="Preço de etiqueta" valor={formatBRL(p.precoEtiquetaCentavos)} detalhe={<SeloMargem p={p} />} />
        <Indicador rotulo="Em Casa" valor={formatQtd(saldos.casa)} tom={saldos.casa < 0 ? 'ruim' : saldos.casa < p.estoqueMinimo ? 'atencao' : undefined} detalhe={`mínimo ${formatQtd(p.estoqueMinimo)}`} />
        <Indicador rotulo="Total" valor={formatQtd(saldos.total)} detalhe={`${formatQtd(saldos.parceiros)} nos parceiros`} />
      </div>

      <Grade colunas={2}>
        <Cartao titulo="Ficha técnica" acoes={<FotoProduto p={p} tamanho={48} />}>
          <div class="est-mesas">
            {p.mesas.map((m, i) => (
              <div key={m.id} class="est-mesa">
                <strong>Mesa {i + 1}</strong>: {m.pecasPorMesa} peça(s) · {formatDuracao(m.tempoMin)} · {db.get('impressoras', m.impressoraId)?.nome ?? 'impressora removida'}
                <br />
                {m.filamentos.map((f) => `${nomeMaterial(f.materialId)} ${formatGramas(f.gramas)}`).join(' + ') || 'sem filamento'}
              </div>
            ))}
            <Resumo
              linhas={[
                { rotulo: 'Componentes por peça', valor: p.componentes.length ? p.componentes.map((c) => `${formatQtd(c.quantidade)} ${nomeMaterial(c.materialId)}`).join(', ') : 'nenhum' },
                { rotulo: 'Mão de obra por peça', valor: `${formatQtd(p.maoDeObraMin, 1)} min` },
              ]}
            />
          </div>
        </Cartao>
        <Cartao titulo="Composição do custo">{comp && <ComposicaoCustoView composicao={comp} />}</Cartao>
      </Grade>

      <Cartao titulo="Simulador de preço">
        {/* Custo com precisão total, como no Exemplo A (preço exato 4,9747; os centavos não mudam). */}
        <SimuladorPreco key={`${p.id}-${p.precoEtiquetaCentavos}-${custo}`} custoUnit={comp?.total ?? custo} precoInicial={p.precoEtiquetaCentavos} onUsarPreco={usarPreco} />
      </Cartao>

      <Grade colunas={2}>
        <Cartao titulo="Saldo por local">
          <Resumo linhas={[...locais.map(([l, q]) => ({ rotulo: nomeLocal(l), valor: <span class={q < 0 ? 'txt-ruim' : ''}>{formatQtd(q)}</span> })), { rotulo: 'Total', valor: formatQtd(saldos.total), destaque: true }]} />
        </Cartao>
        <Cartao titulo="Dados">
          <Resumo
            linhas={[
              { rotulo: 'Código', valor: p.codigo },
              { rotulo: 'Modelo', valor: p.modelo },
              p.cor ? { rotulo: 'Cor', valor: p.cor } : null,
              { rotulo: 'Categoria', valor: p.categoria },
              { rotulo: 'Origem do modelo', valor: p.origemModelo === 'proprio' ? 'Próprio' : 'De terceiro' },
              { rotulo: 'Situação', valor: p.arquivado ? <Selo>Arquivado</Selo> : <Selo tom="ok">Ativo</Selo> },
            ]}
          />
        </Cartao>
      </Grade>

      <Cartao
        titulo="Histórico"
        acoes={
          movs.length > 0 ? (
            <Botao pequeno variante="fantasma" href={`/estoque/movimentacoes?produto=${p.id}`}>
              Ver em Movimentações
            </Botao>
          ) : undefined
        }
      >
        <Tabela colunas={colunasMov} linhas={movs.slice(0, 15)} chave={(m) => m.id} vazio={<p class="muted">Nenhuma movimentação ainda. A produção e as vendas aparecem aqui.</p>} />
      </Cartao>

      {!p.arquivado && (
        <Linha>
          <Botao variante="secundario" icone="impressora" href={`/producao/nova?produto=${p.id}`}>
            Registrar produção
          </Botao>
          <Botao variante="secundario" icone="editar" href={`/estoque/ajuste?produto=${p.id}`}>
            Ajuste ou perda
          </Botao>
        </Linha>
      )}

      <Linha>
        <Botao icone="copiar" onClick={() => setDuplicando(true)}>
          Duplicar para outra cor
        </Botao>
        <Botao variante="fantasma" icone={p.arquivado ? 'atualizar' : 'arquivar'} onClick={arquivar}>
          {p.arquivado ? 'Reativar produto' : 'Arquivar produto'}
        </Botao>
      </Linha>
      {duplicando && <DuplicarCor p={p} aberto={duplicando} onFechar={() => setDuplicando(false)} />}
    </Pagina>
  );
}
