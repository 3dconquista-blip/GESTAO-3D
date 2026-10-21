// Detalhe do produto, enxuto (decisão 86): estoque e preço no topo, "Registrar produção" como ação principal;
// ficha, custo, preço por canal, saldo por local, histórico e ações raras em blocos recolhidos.
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_TIPO_MOV } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { composicaoProduto, custoProduto, custosDoProduto, margemDoProduto, minimoDoProduto, nomeMaterial, saldosDoProduto } from '../../data/selectors.ts';
import type { LocalId, MovEstoque } from '../../data/types.ts';
import { CASA, parceiroDoLocal } from '../../data/types.ts';
import { tipoDoSlot } from '../../domain/filamento.ts';
import { simular } from '../../domain/pricing.ts';
import { formatBRL, formatData, formatDuracao, formatGramas, formatPct, formatQtd, formatReais } from '../../lib/format.ts';
import { alertaLicenca, arquivarProduto, copiarProduto, excluirProduto, previaExclusao, salvarProduto } from '../../services/produtos.ts';
import { Aviso, Botao, Cartao, Indicador, Linha, MaisDetalhes, Pagina, Resumo, Selo, Tabela, Vazio, avisar, confirmar, type Coluna } from '../../ui/index.ts';
import { ComposicaoCustoView, SimuladorPreco } from '../precos/componentes.tsx';
import { FotoProduto, SeloMargem } from './ProdutosLista.tsx';

/** Nome do local: 'Casa' ou o nome do parceiro. */
export function nomeLocal(local: LocalId | null): string {
  if (!local) return '—';
  if (local === CASA) return 'Casa';
  const pid = parceiroDoLocal(local);
  return (pid && db.get('parceiros', pid)?.nome) || 'Parceiro';
}

export function ProdutoDetalhe({ params }: TelaProps) {
  useDb();
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
  const minimo = minimoDoProduto(p);
  const sim = p.precoEtiquetaCentavos ? simular(p.precoEtiquetaCentavos, custo, db.config.canais, custosDoProduto(p)) : null;
  const abaixo = sim ? sim.linhas.filter((l) => l.abaixoMinima || l.prejuizo).map((l) => l.canal.nome) : [];
  const movs = db
    .all('movEstoque')
    .filter((m) => m.produtoId === p.id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const locais = Array.from(saldos.porLocal.entries()).filter(([l, q]) => l === CASA || q !== 0);
  if (!saldos.porLocal.has(CASA)) locais.unshift([CASA, 0]);
  const material = (id: string) => db.get('materiais', id);

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

  const copiar = () => {
    try {
      const novo = copiarProduto(p.id);
      avisar(`Cópia criada: ${novo.nome} (${novo.codigo})`);
      navegar(`/estoque/produtos/${novo.id}/editar`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const excluir = async () => {
    const pr = previaExclusao(p.id);
    if (pr.bloqueio) return avisar(pr.bloqueio, 'ruim');
    const ok = await confirmar({
      titulo: `Excluir "${p.nome}"?`,
      itens: [
        'Some de vez das listas, da venda rápida e dos relatórios de produtos. Não dá para reativar.',
        pr.emCasa > 0 ? `As ${formatQtd(pr.emCasa)} peça(s) em Casa saem do estoque (ajuste "Produto excluído", não conta como perda).` : '',
        pr.emCasa < 0 ? `O saldo negativo em Casa (${formatQtd(pr.emCasa)}) é zerado com um ajuste "Produto excluído".` : '',
        pr.mixes.length ? `Sai do mix de: ${pr.mixes.join(', ')}.` : '',
        'O histórico continua guardado: movimentações, vendas e acertos antigos mostram o produto como "(excluído)".',
        'Se só quer tirar das listas por um tempo, use "Arquivar".',
      ].filter(Boolean),
      confirmar: 'Excluir produto',
      perigo: true,
    });
    if (!ok) return;
    try {
      excluirProduto(p.id);
      avisar('Produto excluído');
      navegar('/estoque/produtos', { substituir: true });
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
      subtitulo={[p.codigo, p.categoria, p.excluido ? 'Excluído' : p.arquivado ? 'Arquivado' : ''].filter(Boolean).join(' · ')}
      voltarPara="/estoque/produtos"
      acoes={
        p.excluido ? undefined : (
          <>
            <Botao variante="secundario" icone="editar" href={`/estoque/produtos/${p.id}/editar`}>
              Editar
            </Botao>
            {!p.arquivado && (
              <Botao variante="primario" icone="impressora" href={`/producao/nova?produto=${p.id}`}>
                Registrar produção
              </Botao>
            )}
          </>
        )
      }
    >
      {p.excluido && (
        <Aviso tom="info" titulo="Produto excluído">
          Excluído{p.excluidoEm ? ` em ${formatData(p.excluidoEm)}` : ''}. Não aparece mais nas listas; o histórico continua guardado.
        </Aviso>
      )}
      {!p.excluido && abaixo.length > 0 && (
        <Aviso tom="ruim" titulo="Margem abaixo da mínima">
          Com o preço de etiqueta atual ({formatBRL(p.precoEtiquetaCentavos)}): {abaixo.join(', ')}. Veja "Preço por canal" abaixo.
        </Aviso>
      )}
      {alertaLicenca(p) && <Aviso tom="atencao">Modelo de terceiro: confira se a licença permite vender.{p.linkModelo && <> <a href={p.linkModelo} target="_blank" rel="noopener">Abrir o modelo</a></>}</Aviso>}

      <div class="indicadores">
        <Indicador
          rotulo="Em Casa"
          valor={formatQtd(saldos.casa)}
          tom={saldos.casa < 0 ? 'ruim' : saldos.casa < minimo.minimo ? 'atencao' : undefined}
          detalhe={minimo.minimo ? `mínimo ${formatQtd(minimo.minimo)}${minimo.automatico ? ' (automático)' : ''}` : undefined}
        />
        <Indicador rotulo="Nos parceiros" valor={formatQtd(saldos.parceiros)} detalhe={`total ${formatQtd(saldos.total)}`} />
        <Indicador rotulo="Preço de etiqueta" valor={formatBRL(p.precoEtiquetaCentavos)} detalhe={<SeloMargem p={p} />} />
        <Indicador rotulo="Custo por peça" valor={formatReais(custo)} />
      </div>

      {!p.excluido && (
        <Linha>
          <Botao icone="copiar" onClick={copiar}>
            Copiar produto
          </Botao>
          {!p.arquivado && (
            <Botao icone="editar" href={`/estoque/ajuste?produto=${p.id}`}>
              Ajuste ou perda
            </Botao>
          )}
        </Linha>
      )}

      <MaisDetalhes titulo="Ficha, custo e preço por canal" resumo={`${p.mesas.length} mesa(s) · margem ${formatPct(margemDoProduto(p), 0)}`}>
        <div class="est-ficha-topo">
          <FotoProduto p={p} tamanho={48} />
          <div class="est-mesas">
            {p.mesas.map((m, i) => (
              <div key={m.id} class="est-mesa">
                <strong>{p.mesas.length > 1 ? `Mesa ${i + 1}: ` : ''}</strong>
                {m.pecasPorMesa} peça(s) · {formatDuracao(m.tempoMin)} · {m.filamentos.map((f) => `${formatGramas(f.gramas)} de ${tipoDoSlot(f, material)}`).join(' + ') || 'sem filamento'}
                {db.all('impressoras').filter((x) => x.ativa).length > 1 && ` · ${db.get('impressoras', m.impressoraId)?.nome ?? 'impressora removida'}`}
              </div>
            ))}
          </div>
        </div>
        <Resumo
          linhas={[
            { rotulo: 'Componentes por peça', valor: p.componentes.length ? p.componentes.map((c) => `${formatQtd(c.quantidade)} ${nomeMaterial(c.materialId)}`).join(', ') : 'nenhum' },
            { rotulo: 'Mão de obra por peça', valor: `${formatQtd(p.maoDeObraMin, 1)} min` },
            { rotulo: 'Margem de lucro', valor: p.margemPct != null ? `${formatPct(p.margemPct)} (deste produto)` : `${formatPct(margemDoProduto(p))} (padrão)` },
          ]}
        />
        {comp && <ComposicaoCustoView composicao={comp} />}
        {/* Custo com precisão total, como no Exemplo A (preço exato 4,9747; os centavos não mudam). */}
        <SimuladorPreco
          key={`${p.id}-${p.precoEtiquetaCentavos}-${custo}-${p.margemPct}`}
          custoUnit={comp?.total ?? custo}
          precoInicial={p.precoEtiquetaCentavos}
          onUsarPreco={p.excluido ? undefined : usarPreco}
          margemPct={p.margemPct}
        />
      </MaisDetalhes>

      <MaisDetalhes titulo="Onde estão as peças e histórico" resumo={`${movs.length} movimentação(ões)`}>
        <Cartao titulo="Saldo por local" compacto>
          <Resumo linhas={[...locais.map(([l, q]) => ({ rotulo: nomeLocal(l), valor: <span class={q < 0 ? 'txt-ruim' : ''}>{formatQtd(q)}</span> })), { rotulo: 'Total', valor: formatQtd(saldos.total), destaque: true }]} />
        </Cartao>
        <Tabela colunas={colunasMov} linhas={movs.slice(0, 15)} chave={(m) => m.id} vazio={<p class="muted">Nenhuma movimentação ainda. A produção e as vendas aparecem aqui.</p>} />
        {movs.length > 0 && (
          <div>
            <Botao pequeno variante="fantasma" href={`/estoque/movimentacoes?produto=${p.id}`}>
              Ver todas as movimentações
            </Botao>
          </div>
        )}
      </MaisDetalhes>

      {!p.excluido && (
        <MaisDetalhes titulo="Mais ações" resumo={p.arquivado ? 'Arquivado' : undefined}>
          <Linha>
            <Botao variante="secundario" icone={p.arquivado ? 'atualizar' : 'arquivar'} onClick={arquivar}>
              {p.arquivado ? 'Reativar produto' : 'Arquivar produto'}
            </Botao>
            <Botao variante="perigo" icone="lixeira" onClick={excluir}>
              Excluir produto
            </Botao>
          </Linha>
          <small class="muted">
            Código {p.codigo} · {p.origemModelo === 'proprio' ? 'modelo próprio' : 'modelo de terceiro'} · situação{' '}
            {p.arquivado ? <Selo>Arquivado</Selo> : <Selo tom="ok">Ativo</Selo>}
          </small>
        </MaisDetalhes>
      )}
    </Pagina>
  );
}
