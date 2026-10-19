// Cadastro e edição de produto (7.1) com ficha técnica, custo e preço (6.3, 6.4).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { materiaisAtivos } from '../../data/selectors.ts';
import type { Cents, LicencaVenda } from '../../data/types.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { custosComMargem, etiquetaSugerida } from '../../domain/pricing.ts';
import { formatBRL, formatPct } from '../../lib/format.ts';
import { salvarProduto } from '../../services/produtos.ts';
import { Aviso, Botao, Campo, Cartao, Dinheiro, Escolha, Foto, Grade, Numero, Pagina, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { ComposicaoCustoView, FichaTecnicaEditor, PrecosSugeridos, TabelaSimulador, fichaVazia, useComposicao } from '../precos/componentes.tsx';

interface Dados {
  nome: string;
  modelo: string;
  cor: string;
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

export function ProdutoForm({ params }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('produtos', params.id) : undefined;
  const [d, setD] = useState<Dados>(() => ({
    nome: atual?.nome ?? '',
    modelo: atual?.modelo ?? '',
    cor: atual?.cor ?? '',
    categoria: atual?.categoria ?? db.config.categorias[0] ?? 'Outro',
    fotoDataUrl: atual?.fotoDataUrl,
    estoqueMinimo: atual?.estoqueMinimo ?? 0,
    origemModelo: atual?.origemModelo ?? 'proprio',
    linkModelo: atual?.linkModelo ?? '',
    licencaVenda: atual?.licencaVenda ?? 'nao_sei',
    precoEtiquetaCentavos: atual?.precoEtiquetaCentavos ?? null,
    margemPct: atual?.margemPct ?? null,
  }));
  const [ficha, setFicha] = useState<FichaTecnica>(() =>
    atual ? { mesas: atual.mesas.map((m) => ({ ...m, filamentos: m.filamentos.map((f) => ({ ...f })) })), componentes: atual.componentes.map((c) => ({ ...c })), maoDeObraMin: atual.maoDeObraMin } : fichaVazia(),
  );
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
  const sugerida = comp.total > 0 ? etiquetaSugerida(comp.total, db.config.canais, custosComMargem(db.config.custos, d.margemPct)) : null;
  const precoUsado = d.precoEtiquetaCentavos ?? sugerida;

  const salvar = () => {
    try {
      const p = salvarProduto({
        id: atual?.id,
        nome: d.nome,
        modelo: d.modelo || d.nome,
        cor: d.cor,
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

  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo produto'} subtitulo={atual?.codigo} voltarPara={atual ? `/estoque/produtos/${atual.id}` : '/estoque/produtos'} largura="larga">
      {(semImpressora || semFilamento) && (
        <Aviso tom="atencao" titulo="Falta cadastro para calcular o custo">
          {semImpressora && (
            <div>
              Nenhuma impressora ativa — <a href="#/config/impressoras/novo">cadastrar impressora</a>.
            </div>
          )}
          {semFilamento && (
            <div>
              Nenhum filamento — <a href="#/estoque/materiais/novo?tipo=filamento">cadastrar filamento</a>.
            </div>
          )}
        </Aviso>
      )}
      <Grade colunas={2}>
        <div class="pilha pilha-m">
          <Cartao titulo="Dados">
            <div class="formulario">
              <Campo rotulo="Nome" obrigatorio>
                <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Chaveiro Kettlebell Preto" autoFocus={!atual} />
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Modelo" dica="Agrupa as cores do mesmo produto">
                  <Texto value={d.modelo} onInput={(v) => mudar({ modelo: v })} placeholder="Ex.: Chaveiro Kettlebell" />
                </Campo>
                <Campo rotulo="Cor">
                  <Texto value={d.cor} onInput={(v) => mudar({ cor: v })} placeholder="Ex.: Preto" />
                </Campo>
                <Campo rotulo="Categoria">
                  <Escolha value={d.categoria} onChange={(v) => mudar({ categoria: v })} opcoes={db.config.categorias.map((c) => ({ valor: c, rotulo: c }))} />
                </Campo>
                <Campo rotulo="Estoque mínimo em Casa" dica="Abaixo disso aparece em &quot;O que imprimir&quot;">
                  <Numero value={d.estoqueMinimo} onChange={(v) => mudar({ estoqueMinimo: Math.max(0, v ?? 0) })} decimais={0} min={0} stepper />
                </Campo>
              </div>
              <Campo rotulo="Foto (opcional)">
                <Foto value={d.fotoDataUrl} onChange={(v) => mudar({ fotoDataUrl: v })} />
              </Campo>
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
              {d.origemModelo === 'terceiro' && d.licencaVenda !== 'sim' && (
                <Aviso tom="atencao">Confira se a licença do modelo permite vender as peças antes de colocar à venda.</Aviso>
              )}
            </div>
          </Cartao>
          <Cartao titulo="Ficha técnica">
            <FichaTecnicaEditor valor={ficha} onChange={setFicha} />
          </Cartao>
        </div>

        <div class="pilha pilha-m">
          <Cartao titulo="Custo por peça">
            <ComposicaoCustoView composicao={comp} />
          </Cartao>
          <Cartao titulo="Preço">
            <div class="pilha pilha-m">
              <Campo
                rotulo="Margem de lucro deste produto"
                dica={
                  d.margemPct == null
                    ? `Vazio = margem padrão (${formatPct(margemPadrao, 0)}, em Configurações > Custos e preços)`
                    : 'Os preços sugeridos e a cor da margem usam esta margem'
                }
              >
                <Numero value={d.margemPct} onChange={(v) => mudar({ margemPct: v })} min={0} max={99} decimais={1} sufixo="%" placeholder={`${margemPadrao} (padrão)`} />
              </Campo>
              {comp.total > 0 ? (
                <PrecosSugeridos custoUnit={comp.total} onUsar={(c) => mudar({ precoEtiquetaCentavos: c })} margemPct={d.margemPct} />
              ) : (
                <p class="muted">Preencha a ficha técnica para ver o preço sugerido.</p>
              )}
              <Campo
                rotulo="Preço de etiqueta"
                dica={d.precoEtiquetaCentavos == null && sugerida ? `Vazio = etiqueta sugerida (${formatBRL(sugerida)})` : 'Um preço por produto vale para todos os canais'}
              >
                <Dinheiro value={d.precoEtiquetaCentavos} onChange={(v) => mudar({ precoEtiquetaCentavos: v })} placeholder={sugerida ? (sugerida / 100).toFixed(2).replace('.', ',') : '0,00'} />
              </Campo>
              {precoUsado != null && precoUsado > 0 && comp.total > 0 && <TabelaSimulador custoUnit={comp.total} precoCentavos={precoUsado} margemPct={d.margemPct} />}
            </div>
          </Cartao>
        </div>
      </Grade>
      <div class="barra-acoes-fixa">
        <Botao variante="fantasma" href={atual ? `/estoque/produtos/${atual.id}` : '/estoque/produtos'}>
          Cancelar
        </Botao>
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar produto
        </Botao>
      </div>
    </Pagina>
  );
}
