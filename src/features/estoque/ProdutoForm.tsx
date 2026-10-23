// Cadastro e edição de produto, simples (decisão 107): nome, custo por peça, gramas de filamento por peça e preço.
// O custo detalhado (mesas, tempo, impressora, energia, mão de obra) é feito na Calculadora, que manda o custo e as
// gramas para cá (?custo=&gramas=&tipo=&tempo=&nome=). O produto não tem cor: a cor é escolhida em cada produção
// (decisão 85). Categoria, mínimo, margem, foto, tempo, insumos, licença e preço por canal ficam em "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { contextoCusto, custoProduto, minimoDoProduto } from '../../data/selectors.ts';
import type { Cents, LicencaVenda, Mesa, Produto, TipoFilamento } from '../../data/types.ts';
import { TIPO_PADRAO, TIPOS_FILAMENTO, tipoDoSlot } from '../../domain/filamento.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { custosComMargem, etiquetaSugerida, gramasPorPeca, simular, tempoPorPeca } from '../../domain/pricing.ts';
import { formatBRL, formatPct, formatReais } from '../../lib/format.ts';
import { round4 } from '../../lib/money.ts';
import { salvarProduto } from '../../services/produtos.ts';
import { Aviso, Botao, Campo, Cartao, Dinheiro, Escolha, Foto, MaisDetalhes, Numero, Pagina, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { ComponentesEditor, PrecosSugeridos, TabelaSimulador, tiposDisponiveis } from '../precos/componentes.tsx';

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

/** Ficha "simples": uma mesa de 1 peça com um filamento (gramas por peça). As outras vêm do cadastro detalhado antigo. */
function fichaSimples(p: Pick<Produto, 'mesas'>): boolean {
  return p.mesas.length === 1 && p.mesas[0].pecasPorMesa === 1 && p.mesas[0].filamentos.length <= 1;
}

const numeroDaQuery = (v: string | null): number | null => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function ProdutoForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('produtos', params.id) : undefined;
  const material = (id: string) => db.get('materiais', id);
  // Valores que vieram da Calculadora (ou do produto atual).
  const daCalculadora = query.get('custo') != null;
  const tipos = tiposDisponiveis();
  const [d, setD] = useState<Dados>(() => ({
    nome: atual?.nome ?? query.get('nome') ?? '',
    categoria: atual?.categoria ?? categoriaSugerida(),
    fotoDataUrl: atual?.fotoDataUrl,
    estoqueMinimo: atual?.estoqueMinimo ?? 0,
    origemModelo: atual?.origemModelo ?? 'proprio',
    linkModelo: atual?.linkModelo ?? '',
    licencaVenda: atual?.licencaVenda ?? 'nao_sei',
    precoEtiquetaCentavos: atual?.precoEtiquetaCentavos ?? null,
    margemPct: atual?.margemPct ?? null,
  }));
  const [custo, setCusto] = useState<number | null>(() => numeroDaQuery(query.get('custo')) ?? (atual ? round4(atual.custoInformado ?? custoProduto(atual.id)) : null));
  const [gramas, setGramas] = useState<number | null>(() => numeroDaQuery(query.get('gramas')) ?? (atual ? gramasPorPeca(atual) : null));
  const [tempo, setTempo] = useState<number | null>(() => numeroDaQuery(query.get('tempo')) ?? (atual ? tempoPorPeca(atual) || null : null));
  const [tipo, setTipo] = useState<TipoFilamento>(() => {
    const t = query.get('tipo') as TipoFilamento | null;
    if (t && TIPOS_FILAMENTO.includes(t)) return t;
    const f = atual?.mesas[0]?.filamentos[0];
    return f ? tipoDoSlot(f, material) : (tipos[0] ?? TIPO_PADRAO);
  });
  // Insumos que saem do estoque a cada peça (argola, saquinho); o custo deles já está no custo por peça.
  const [ficha, setFicha] = useState<FichaTecnica>(() => ({ mesas: [], componentes: atual?.componentes.map((c) => ({ ...c })) ?? [], maoDeObraMin: atual?.maoDeObraMin ?? 0 }));
  // Produto antigo com ficha detalhada: só troca a ficha se as gramas, o tipo ou o tempo mudarem.
  const detalhada = !!atual && !fichaSimples(atual);
  const [mudouFicha, setMudouFicha] = useState(daCalculadora);
  const [mudouCusto, setMudouCusto] = useState(daCalculadora || !!atual?.custoInformado);

  if ((params.id && !atual) || atual?.excluido) {
    return (
      <Pagina titulo="Produto" voltarPara="/estoque/produtos">
        <Vazio titulo={atual?.excluido ? 'Este produto foi excluído' : 'Produto não encontrado'} />
      </Pagina>
    );
  }

  const mudar = (patch: Partial<Dados>) => setD({ ...d, ...patch });
  const margemPadrao = db.config.custos.margemDesejadaPct;
  const minimoAuto = atual ? minimoDoProduto({ id: atual.id, estoqueMinimo: 0 }).minimo : 0;
  // Sem custo digitado: só o filamento (gramas × média do kg do tipo), como estimativa mínima.
  const custoKg = contextoCusto().custoKgTipo?.(tipo);
  const soFilamento = gramas && custoKg ? round4((gramas * custoKg) / 1000) : null;
  const custoEfetivo = custo ?? soFilamento ?? 0;
  const custos = custosComMargem(db.config.custos, d.margemPct);
  const sugerida = custoEfetivo > 0 ? etiquetaSugerida(custoEfetivo, db.config.canais, custos) : null;
  const precoUsado = d.precoEtiquetaCentavos ?? sugerida;
  const sim = precoUsado && custoEfetivo > 0 ? simular(precoUsado, round4(custoEfetivo), db.config.canais, custos) : null;
  const abaixoMinima = sim ? sim.linhas.filter((l) => l.abaixoMinima && !l.prejuizo).map((l) => l.canal.nome) : [];

  const salvar = () => {
    try {
      const manterFicha = detalhada && !mudouFicha;
      const mesas: Mesa[] = manterFicha
        ? atual!.mesas
        : [{ id: atual?.mesas[0]?.id ?? '', pecasPorMesa: 1, tempoMin: tempo ?? 0, impressoraId: atual?.mesas[0]?.impressoraId ?? '', filamentos: [{ tipo, gramas: gramas ?? 0 }] }];
      // Ficha detalhada antiga com o custo sem mexer: continua calculando pela ficha.
      const custoInformado = manterFicha && !mudouCusto ? null : custoEfetivo;
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
        mesas,
        componentes: ficha.componentes,
        custoInformado,
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
    tempo ? `${tempo} min por peça` : '',
    ficha.componentes.length ? `${ficha.componentes.length} insumo(s)` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo produto'} subtitulo={atual?.codigo} voltarPara={atual ? `/estoque/produtos/${atual.id}` : '/estoque/produtos'} largura="estreita">
      {daCalculadora && <Aviso tom="info">Custo e gramas vieram da Calculadora. Confira e salve.</Aviso>}
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Nome" obrigatorio>
            <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Chaveiro Kettlebell (sem a cor)" autoFocus={!atual && !d.nome} />
          </Campo>
          <div class="campos-2">
            <Campo
              rotulo="Custo por peça"
              dica={
                <>
                  {custo == null && soFilamento ? `Vazio = só o filamento (${formatReais(soFilamento)}). ` : ''}
                  <a href="#/calculadora">Calcular na Calculadora</a>
                </>
              }
            >
              <Numero
                value={custo}
                onChange={(v) => {
                  setCusto(v);
                  setMudouCusto(true);
                }}
                decimais={2}
                min={0}
                prefixo="R$"
                placeholder={soFilamento ? soFilamento.toFixed(2).replace('.', ',') : '0,00'}
              />
            </Campo>
            <Campo rotulo="Gramas de filamento por peça" dica={detalhada && !mudouFicha ? `Da ficha detalhada (${atual!.mesas.length} mesa(s)); mudar troca a ficha por gramas por peça` : 'Sai do carretel a cada peça produzida'}>
              <Numero
                value={gramas}
                onChange={(v) => {
                  setGramas(v);
                  setMudouFicha(true);
                }}
                decimais={1}
                min={0}
                sufixo={tipos.length > 1 ? 'g' : `g de ${tipo}`}
              />
            </Campo>
          </div>
          {tipos.length > 1 && (
            <Campo rotulo="Tipo de filamento">
              <Segmentado
                value={tipo}
                onChange={(v) => {
                  setTipo(v);
                  setMudouFicha(true);
                }}
                opcoes={tipos.map((t) => ({ valor: t, rotulo: t }))}
              />
            </Campo>
          )}

          <div class="prod-preco">
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

      <MaisDetalhes resumo={resumoDetalhes || undefined}>
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
          <Campo rotulo="Tempo de impressão por peça" dica="Opcional: só para estimar o tempo em &quot;O que imprimir&quot;">
            <Numero
              value={tempo}
              onChange={(v) => {
                setTempo(v);
                setMudouFicha(true);
              }}
              decimais={0}
              min={0}
              sufixo="min"
            />
          </Campo>
          <Campo rotulo="Foto">
            <Foto value={d.fotoDataUrl} onChange={(v) => mudar({ fotoDataUrl: v })} />
          </Campo>
        </div>

        <strong>Insumos que saem do estoque a cada peça</strong>
        <small class="muted">Ex.: argola e saquinho. O custo deles já está no custo por peça; aqui é só para baixar do estoque.</small>
        <ComponentesEditor valor={ficha} onChange={setFicha} mostrarMaoDeObra={false} />

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

        {custoEfetivo > 0 && (
          <>
            <strong>Preço por canal</strong>
            <PrecosSugeridos custoUnit={custoEfetivo} margemPct={d.margemPct} />
            {precoUsado != null && precoUsado > 0 && <TabelaSimulador custoUnit={custoEfetivo} precoCentavos={precoUsado} margemPct={d.margemPct} />}
          </>
        )}
      </MaisDetalhes>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar} disabled={!d.nome.trim() || !(gramas && gramas > 0) || custoEfetivo <= 0}>
          Salvar produto
        </Botao>
      </div>
    </Pagina>
  );
}
