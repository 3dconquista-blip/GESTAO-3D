// Cadastro e edição de produto (7.1), enxuto (decisão 86): nome, ficha (peças, tempo, tipo de filamento e gramas)
// e preço. O produto não tem cor: a cor é escolhida em cada produção (decisão 85). O resto (categoria, mínimo,
// margem, foto, componentes, mão de obra, licença, composição do custo e tabela por canal) fica em "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { materiaisAtivos, minimoDoProduto } from '../../data/selectors.ts';
import type { Cents, LicencaVenda } from '../../data/types.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { custosComMargem, etiquetaSugerida, simular } from '../../domain/pricing.ts';
import { formatBRL, formatPct, formatReais } from '../../lib/format.ts';
import { round4 } from '../../lib/money.ts';
import { salvarProduto } from '../../services/produtos.ts';
import { Aviso, Botao, Campo, Cartao, Dinheiro, Escolha, Foto, MaisDetalhes, Numero, Pagina, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { ComponentesEditor, ComposicaoCustoView, FichaTecnicaEditor, PrecosSugeridos, TabelaSimulador, fichaVazia, useComposicao } from '../precos/componentes.tsx';
import { ImportarFatiador, fichaDaImportacao } from '../precos/ImportarFatiador.tsx';

interface Dados {
  nome: string;
  categoria: string;
  fotoDataUrl?: string;
  estoqueMinimo: number;
  origemModelo: 'proprio' | 'terceiro';
  linkModelo: string;
  licencaVenda: LicencaVenda;
  precoEtiquetaCentavos: Cents | null;
  /** Margem própria do produto (%); null = margem padrão da configuração. */
  margemPct: number | null;
}

/** Categoria sugerida para um produto novo: a do último cadastrado (ou a primeira da lista). */
function categoriaSugerida(): string {
  const ultimo = db
    .all('produtos')
    .filter((p) => !p.excluido)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0];
  return ultimo?.categoria || db.config.categorias[0] || 'Outro';
}

export function ProdutoForm({ params }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('produtos', params.id) : undefined;
  const [d, setD] = useState<Dados>(() => ({
    nome: atual?.nome ?? '',
    categoria: atual?.categoria ?? categoriaSugerida(),
    fotoDataUrl: atual?.fotoDataUrl,
    estoqueMinimo: atual?.estoqueMinimo ?? 0,
    origemModelo: atual?.origemModelo ?? 'proprio',
    linkModelo: atual?.linkModelo ?? '',
    licencaVenda: atual?.licencaVenda ?? 'nao_sei',
    precoEtiquetaCentavos: atual?.precoEtiquetaCentavos ?? null,
    margemPct: atual?.margemPct ?? null,
  }));
  const [ficha, setFicha] = useState<FichaTecnica>(() =>
    atual
      ? { mesas: atual.mesas.map((m) => ({ ...m, filamentos: m.filamentos.map((f) => ({ ...f })) })), componentes: atual.componentes.map((c) => ({ ...c })), maoDeObraMin: atual.maoDeObraMin }
      : fichaVazia('produto'),
  );
  // Peça multicolor ou em várias mesas: mostra os botões de mais mesas/cores na ficha.
  const [fichaAvancada, setFichaAvancada] = useState(() => !!atual && (atual.mesas.length > 1 || atual.mesas.some((m) => m.filamentos.length > 1)));
  const comp = useComposicao(ficha);

  if ((params.id && !atual) || atual?.excluido) {
    return (
      <Pagina titulo="Produto" voltarPara="/estoque/produtos">
        <Vazio titulo={atual?.excluido ? 'Este produto foi excluído' : 'Produto não encontrado'} />
      </Pagina>
    );
  }

  const mudar = (patch: Partial<Dados>) => setD({ ...d, ...patch });
  const semImpressora = db.all('impressoras').filter((i) => i.ativa).length === 0;
  const semFilamento = materiaisAtivos('filamento').length === 0;
  const margemPadrao = db.config.custos.margemDesejadaPct;
  // Mínimo automático de hoje (produto novo não tem vendas: 0).
  const minimoAuto = atual ? minimoDoProduto({ id: atual.id, estoqueMinimo: 0 }).minimo : 0;
  const custos = custosComMargem(db.config.custos, d.margemPct);
  const sugerida = comp.total > 0 ? etiquetaSugerida(comp.total, db.config.canais, custos) : null;
  const precoUsado = d.precoEtiquetaCentavos ?? sugerida;
  const sim = precoUsado && comp.total > 0 ? simular(precoUsado, round4(comp.total), db.config.canais, custos) : null;
  const abaixoMinima = sim ? sim.linhas.filter((l) => l.abaixoMinima && !l.prejuizo).map((l) => l.canal.nome) : [];

  const salvar = () => {
    try {
      const p = salvarProduto({
        id: atual?.id,
        nome: d.nome,
        categoria: d.categoria,
        fotoDataUrl: d.fotoDataUrl,
        estoqueMinimo: d.estoqueMinimo,
        origemModelo: d.origemModelo,
        linkModelo: d.origemModelo === 'terceiro' ? d.linkModelo : undefined,
        licencaVenda: d.origemModelo === 'terceiro' ? d.licencaVenda : undefined,
        precoEtiquetaCentavos: d.precoEtiquetaCentavos ?? undefined,
        margemPct: d.margemPct,
        maoDeObraMin: ficha.maoDeObraMin,
        mesas: ficha.mesas,
        componentes: ficha.componentes,
      });
      avisar(atual ? 'Produto salvo' : `Produto cadastrado (${p.codigo})`);
      navegar(`/estoque/produtos/${p.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const resumoDetalhes = [
    d.categoria,
    d.estoqueMinimo ? `mínimo ${d.estoqueMinimo}` : '',
    d.margemPct != null ? `margem ${formatPct(d.margemPct, 0)}` : '',
    ficha.componentes.length ? `${ficha.componentes.length} componente(s)` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo produto'} subtitulo={atual?.codigo} voltarPara={atual ? `/estoque/produtos/${atual.id}` : '/estoque/produtos'} largura="estreita">
      {(semImpressora || semFilamento) && (
        <Aviso tom="atencao" titulo="Falta cadastro para calcular o custo">
          {semImpressora && (
            <div>
              Nenhuma impressora — <a href="#/config/impressoras/novo">cadastrar impressora</a>.
            </div>
          )}
          {semFilamento && (
            <div>
              Nenhum filamento — <a href="#/estoque/materiais/novo?tipo=filamento">cadastrar filamento</a>.
            </div>
          )}
        </Aviso>
      )}

      <Cartao>
        <div class="formulario">
          <Campo rotulo="Nome" obrigatorio>
            <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Chaveiro Kettlebell (sem a cor)" autoFocus={!atual} />
          </Campo>
          <ImportarFatiador
            onImportar={(imp) => {
              setFicha(fichaDaImportacao(imp, ficha));
              if (imp.mesas.length > 1 || imp.mesas.some((m) => m.filamentos.length > 1)) setFichaAvancada(true);
              if (!d.nome.trim() && imp.nome) mudar({ nome: imp.nome });
            }}
          />
          <FichaTecnicaEditor valor={ficha} onChange={setFicha} modo="produto" mostrarExtras={fichaAvancada} />

          <div class="prod-preco">
            <div class="prod-custo">
              <span>Custo por peça</span>
              <strong>{comp.total > 0 ? formatReais(comp.total) : '—'}</strong>
            </div>
            {comp.avisos.map((a) => (
              <Aviso key={a} tom="atencao">
                {a}
              </Aviso>
            ))}
            {sugerida != null && (
              <div class="precos-etiqueta">
                <span>
                  Preço sugerido: <strong>{formatBRL(sugerida)}</strong>
                </span>
                {d.precoEtiquetaCentavos !== sugerida && (
                  <Botao pequeno variante="secundario" onClick={() => mudar({ precoEtiquetaCentavos: sugerida })}>
                    Usar
                  </Botao>
                )}
              </div>
            )}
            <Campo rotulo="Preço de etiqueta" dica={d.precoEtiquetaCentavos == null && sugerida ? `Vazio = o sugerido (${formatBRL(sugerida)})` : undefined}>
              <Dinheiro value={d.precoEtiquetaCentavos} onChange={(v) => mudar({ precoEtiquetaCentavos: v })} placeholder={sugerida ? (sugerida / 100).toFixed(2).replace('.', ',') : '0,00'} />
            </Campo>
            {sim && sim.perdeEm.length > 0 && <Aviso tom="ruim">Com este preço você perde dinheiro em: {sim.perdeEm.join(', ')}.</Aviso>}
            {sim && sim.perdeEm.length === 0 && abaixoMinima.length > 0 && (
              <Aviso tom="atencao">Margem abaixo da mínima em: {abaixoMinima.join(', ')}.</Aviso>
            )}
          </div>
        </div>
      </Cartao>

      <MaisDetalhes resumo={resumoDetalhes}>
        <div class="campos-2">
          <Campo rotulo="Categoria">
            <Escolha value={d.categoria} onChange={(v) => mudar({ categoria: v })} opcoes={db.config.categorias.map((c) => ({ valor: c, rotulo: c }))} />
          </Campo>
          <Campo rotulo="Estoque mínimo em Casa" dica={d.estoqueMinimo ? 'Abaixo disso aparece em "O que imprimir"' : `Vazio = automático: o que você vende em 15 dias${minimoAuto ? ` (hoje: ${minimoAuto})` : ''}`}>
            <Numero value={d.estoqueMinimo || null} onChange={(v) => mudar({ estoqueMinimo: Math.max(0, v ?? 0) })} decimais={0} min={0} placeholder="Automático" />
          </Campo>
          <Campo rotulo="Margem de lucro deste produto" dica={d.margemPct == null ? `Vazio = a padrão (${formatPct(margemPadrao, 0)})` : 'Os preços sugeridos usam esta margem'}>
            <Numero value={d.margemPct} onChange={(v) => mudar({ margemPct: v })} min={0} max={99} decimais={1} sufixo="%" placeholder={`${margemPadrao} (padrão)`} />
          </Campo>
          <Campo rotulo="Foto">
            <Foto value={d.fotoDataUrl} onChange={(v) => mudar({ fotoDataUrl: v })} />
          </Campo>
        </div>

        {!fichaAvancada && (
          <div>
            <Botao pequeno variante="fantasma" icone="camadas" onClick={() => setFichaAvancada(true)}>
              Peça multicolor ou em mais de uma mesa
            </Botao>
          </div>
        )}
        <ComponentesEditor valor={ficha} onChange={setFicha} />

        <Campo rotulo="Origem do modelo">
          <Segmentado
            value={d.origemModelo}
            onChange={(v) => mudar({ origemModelo: v })}
            opcoes={[
              { valor: 'proprio', rotulo: 'Próprio' },
              { valor: 'terceiro', rotulo: 'De terceiro' },
            ]}
          />
        </Campo>
        {d.origemModelo === 'terceiro' && (
          <div class="campos-2">
            <Campo rotulo="Link do modelo">
              <Texto type="url" inputMode="url" value={d.linkModelo} onInput={(v) => mudar({ linkModelo: v })} placeholder="https://makerworld.com/..." />
            </Campo>
            <Campo rotulo="Licença permite venda?">
              <Segmentado
                value={d.licencaVenda}
                onChange={(v) => mudar({ licencaVenda: v })}
                opcoes={[
                  { valor: 'sim', rotulo: 'Sim' },
                  { valor: 'nao', rotulo: 'Não' },
                  { valor: 'nao_sei', rotulo: 'Não sei' },
                ]}
              />
            </Campo>
          </div>
        )}

        {comp.total > 0 && (
          <>
            <strong>Composição do custo</strong>
            <ComposicaoCustoView composicao={comp} />
            <strong>Preço por canal</strong>
            <PrecosSugeridos custoUnit={comp.total} margemPct={d.margemPct} />
            {precoUsado != null && precoUsado > 0 && <TabelaSimulador custoUnit={comp.total} precoCentavos={precoUsado} margemPct={d.margemPct} />}
          </>
        )}
      </MaisDetalhes>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar produto
        </Botao>
      </div>
    </Pagina>
  );
}
