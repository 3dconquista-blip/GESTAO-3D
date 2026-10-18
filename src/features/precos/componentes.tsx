// Componentes de precificação compartilhados (produto, simulador avulso, calculadora e pedidos):
// - FichaTecnicaEditor: mesas, filamentos, componentes e mão de obra (seção 6.3)
// - ComposicaoCustoView: lista + barra empilhada da composição do custo por peça
// - PrecosSugeridos: preço sugerido por canal ativo e etiqueta sugerida (6.4)
// - TabelaSimulador / SimuladorPreco: "Preço de etiqueta" e tabela Canal | Você recebe | Custo | Lucro | Margem
import { useMemo, useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { contextoCusto, materiaisAtivos } from '../../data/selectors.ts';
import type { Cents, Componente, Mesa } from '../../data/types.ts';
import {
  canaisAtivos,
  comissaoCanal,
  composicaoCusto,
  erroParametros,
  etiquetaSugerida,
  multiplicadorDireto,
  precoSugerido,
  simular,
  type ComposicaoCusto,
  type FichaTecnica,
} from '../../domain/pricing.ts';
import { custoHoraMaquina } from '../../domain/pricing.ts';
import { novoId } from '../../lib/id.ts';
import { formatBRL, formatNumero, formatPct, formatReais } from '../../lib/format.ts';
import { toCents } from '../../lib/money.ts';
import {
  Aviso,
  BarraComposicao,
  Botao,
  Campo,
  Dica,
  Dinheiro,
  Escolha,
  Icon,
  Numero,
  Resumo,
  Tabela,
  type Coluna,
} from '../../ui/index.ts';
import './precos.css';

export const DICA_FICHA =
  'Use os dados do fatiador depois de fatiar. Peças multicoloridas gastam filamento com purga; mais peças na mesma mesa diluem esse gasto.';

/** Mesa nova com padrões: 1 peça, primeira impressora ativa e primeiro filamento. */
export function novaMesa(): Mesa {
  const imp = db
    .all('impressoras')
    .filter((i) => i.ativa)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0];
  const fil = materiaisAtivos('filamento')[0];
  return {
    id: novoId(),
    pecasPorMesa: 1,
    tempoMin: 0,
    impressoraId: imp?.id ?? '',
    filamentos: fil ? [{ materialId: fil.id, gramas: 0 }] : [],
  };
}

export function fichaVazia(): FichaTecnica {
  return { mesas: [novaMesa()], componentes: [], maoDeObraMin: 2 };
}

// ---------------------------------------------------------------- Editor da ficha técnica

export function FichaTecnicaEditor({ valor, onChange, mostrarMaoDeObra = true }: { valor: FichaTecnica; onChange: (f: FichaTecnica) => void; mostrarMaoDeObra?: boolean }) {
  const impressoras = db.all('impressoras').filter((i) => i.ativa || valor.mesas.some((m) => m.impressoraId === i.id));
  const filamentos = materiaisAtivos('filamento');
  const insumos = materiaisAtivos('insumo');

  const mudarMesa = (i: number, patch: Partial<Mesa>) => {
    const mesas = valor.mesas.map((m, k) => (k === i ? { ...m, ...patch } : m));
    onChange({ ...valor, mesas });
  };
  const mudarComp = (i: number, patch: Partial<Componente>) => {
    onChange({ ...valor, componentes: valor.componentes.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  };

  return (
    <div class="ficha">
      <Dica>{DICA_FICHA}</Dica>
      {valor.mesas.map((mesa, i) => {
        const horas = Math.floor((mesa.tempoMin || 0) / 60);
        const minutos = Math.round((mesa.tempoMin || 0) % 60);
        return (
          <fieldset key={mesa.id} class="ficha-mesa">
            <legend>
              Mesa {i + 1}
              {valor.mesas.length > 1 && (
                <button type="button" class="ficha-remover" onClick={() => onChange({ ...valor, mesas: valor.mesas.filter((_, k) => k !== i) })}>
                  <Icon nome="fechar" tamanho={16} /> Remover mesa
                </button>
              )}
            </legend>
            <div class="campos-3">
              <Campo rotulo="Peças desta mesa" dica="Quantas unidades saem nesta impressão">
                <Numero value={mesa.pecasPorMesa} onChange={(v) => mudarMesa(i, { pecasPorMesa: Math.max(1, v ?? 1) })} decimais={0} min={1} stepper />
              </Campo>
              <Campo rotulo="Tempo da mesa">
                <div class="ficha-tempo">
                  <Numero value={horas} onChange={(h) => mudarMesa(i, { tempoMin: (h ?? 0) * 60 + minutos })} decimais={0} min={0} sufixo="h" ariaLabel="Horas" />
                  <Numero value={minutos} onChange={(m) => mudarMesa(i, { tempoMin: horas * 60 + Math.min(59, m ?? 0) })} decimais={0} min={0} max={59} sufixo="min" ariaLabel="Minutos" />
                </div>
              </Campo>
              <Campo rotulo="Impressora">
                <Escolha
                  value={mesa.impressoraId || null}
                  onChange={(v) => mudarMesa(i, { impressoraId: v })}
                  opcoes={impressoras.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                  placeholder={impressoras.length ? 'Escolha a impressora' : 'Cadastre uma impressora'}
                />
              </Campo>
            </div>
            <div class="ficha-sub">
              <span class="campo-rotulo">Filamentos da mesa (gramas da mesa inteira)</span>
              {mesa.filamentos.map((f, k) => (
                <div key={k} class="ficha-item">
                  <Escolha
                    value={f.materialId || null}
                    onChange={(v) => mudarMesa(i, { filamentos: mesa.filamentos.map((x, j) => (j === k ? { ...x, materialId: v } : x)) })}
                    opcoes={filamentos.map((m) => ({ valor: m.id, rotulo: m.nome }))}
                    placeholder={filamentos.length ? 'Filamento' : 'Cadastre um filamento'}
                  />
                  <Numero
                    value={f.gramas}
                    onChange={(g) => mudarMesa(i, { filamentos: mesa.filamentos.map((x, j) => (j === k ? { ...x, gramas: Math.max(0, g ?? 0) } : x)) })}
                    decimais={1}
                    min={0}
                    sufixo="g"
                    ariaLabel="Gramas"
                  />
                  <Botao
                    pequeno
                    variante="fantasma"
                    icone="fechar"
                    title="Remover filamento"
                    onClick={() => mudarMesa(i, { filamentos: mesa.filamentos.filter((_, j) => j !== k) })}
                  />
                </div>
              ))}
              <Botao
                pequeno
                variante="fantasma"
                icone="plus"
                disabled={!filamentos.length}
                onClick={() => mudarMesa(i, { filamentos: [...mesa.filamentos, { materialId: filamentos[0]?.id ?? '', gramas: 0 }] })}
              >
                Adicionar filamento
              </Botao>
            </div>
          </fieldset>
        );
      })}
      <Botao variante="secundario" icone="plus" onClick={() => onChange({ ...valor, mesas: [...valor.mesas, novaMesa()] })}>
        Adicionar outra mesa
      </Botao>

      <fieldset class="ficha-mesa">
        <legend>Componentes por peça</legend>
        {valor.componentes.length === 0 && <p class="muted">Argola, corrente, ímã, saquinho, etiqueta...</p>}
        {valor.componentes.map((c, k) => (
          <div key={k} class="ficha-item">
            <Escolha value={c.materialId || null} onChange={(v) => mudarComp(k, { materialId: v })} opcoes={insumos.map((m) => ({ valor: m.id, rotulo: m.nome }))} placeholder="Insumo" />
            <Numero value={c.quantidade} onChange={(q) => mudarComp(k, { quantidade: Math.max(0, q ?? 0) })} decimais={2} min={0} sufixo="por peça" ariaLabel="Quantidade por peça" />
            <Botao pequeno variante="fantasma" icone="fechar" title="Remover componente" onClick={() => onChange({ ...valor, componentes: valor.componentes.filter((_, j) => j !== k) })} />
          </div>
        ))}
        <Botao
          pequeno
          variante="fantasma"
          icone="plus"
          disabled={!insumos.length}
          onClick={() => onChange({ ...valor, componentes: [...valor.componentes, { materialId: insumos[0]?.id ?? '', quantidade: 1 }] })}
        >
          {insumos.length ? 'Adicionar componente' : 'Cadastre insumos em Estoque > Materiais'}
        </Botao>
      </fieldset>

      {mostrarMaoDeObra && (
        <Campo rotulo="Mão de obra por peça (min)" dica="Preparar a mesa, acabamento, montagem e embalagem, dividido por peça">
          <Numero value={valor.maoDeObraMin} onChange={(v) => onChange({ ...valor, maoDeObraMin: Math.max(0, v ?? 0) })} decimais={1} min={0} stepper sufixo="min" />
        </Campo>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Composição do custo

/** Calcula a composição com os custos atuais (impressoras, materiais, parâmetros). */
export function useComposicao(ficha: FichaTecnica): ComposicaoCusto {
  return useMemo(() => composicaoCusto(ficha, contextoCusto()), [ficha, db.version]);
}

export function ComposicaoCustoView({ composicao, quantidade }: { composicao: ComposicaoCusto; quantidade?: number }) {
  const r = (v: number) => formatReais(v, 4);
  const partes = [
    { rotulo: 'Material', valor: composicao.material },
    { rotulo: 'Energia', valor: composicao.energia },
    { rotulo: 'Máquina', valor: composicao.maquina },
    { rotulo: 'Falhas', valor: composicao.falhas },
    { rotulo: 'Componentes', valor: composicao.componentes },
    { rotulo: 'Mão de obra', valor: composicao.maoDeObra },
  ];
  return (
    <div class="pilha pilha-m">
      {composicao.avisos.map((a) => (
        <Aviso key={a} tom="atencao">
          {a}
        </Aviso>
      ))}
      <BarraComposicao partes={partes} formatar={(v) => formatReais(v)} />
      <Resumo
        linhas={[
          ...partes.map((p) => ({ rotulo: p.rotulo, valor: r(p.valor) })),
          { rotulo: 'Custo por peça', valor: <span title={r(composicao.total)}>{formatReais(composicao.total)}</span>, destaque: true },
          quantidade && quantidade > 1 ? { rotulo: `Custo de ${quantidade} peças`, valor: formatReais(composicao.total * quantidade) } : null,
        ]}
      />
      <p class="muted precos-exato">Valor exato: {r(composicao.total)} por peça</p>
    </div>
  );
}

// ---------------------------------------------------------------- Preços sugeridos

export function PrecosSugeridos({ custoUnit, onUsar }: { custoUnit: number; onUsar?: (c: Cents) => void }) {
  const { custos, canais } = db.config;
  const erroGeral = erroParametros(custos);
  if (erroGeral) return <Aviso tom="ruim" titulo="Não dá para sugerir preço">{erroGeral}</Aviso>;
  const ativos = canaisAtivos(canais);
  const etiqueta = etiquetaSugerida(custoUnit, canais, custos);
  const mult = multiplicadorDireto(custos);
  return (
    <div class="pilha pilha-m">
      <div class="precos-sugeridos">
        {ativos.map((c) => {
          const s = precoSugerido(custoUnit, c, custos);
          return (
            <div key={c.id} class="precos-sugerido">
              <span class="precos-canal">{c.nome}</span>
              {'erro' in s ? (
                <span class="txt-ruim">{s.erro}</span>
              ) : (
                <>
                  <strong>{formatBRL(s.centavos)}</strong>
                  <small>
                    exato {formatReais(s.exato, 4)} · comissão {formatPct(comissaoCanal(c, custos))}
                  </small>
                </>
              )}
            </div>
          );
        })}
      </div>
      {etiqueta != null && (
        <div class="precos-etiqueta">
          <span>
            Etiqueta sugerida: <strong>{formatBRL(etiqueta)}</strong>
            <small> (o maior preço entre os canais ativos, para não competir com os parceiros)</small>
          </span>
          {onUsar && (
            <Botao pequeno variante="secundario" onClick={() => onUsar(etiqueta)}>
              Usar este preço
            </Botao>
          )}
        </div>
      )}
      {mult != null && (
        <small class="muted">
          Margem desejada de {formatPct(custos.margemDesejadaPct, 0)}: equivale a vender por {formatNumero(mult, 1)}× o custo na venda direta.
        </small>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Simulador

export function TabelaSimulador({ custoUnit, precoCentavos }: { custoUnit: number; precoCentavos: Cents }) {
  const { custos, canais } = db.config;
  const sim = simular(precoCentavos, custoUnit, canais, custos);
  type L = (typeof sim.linhas)[number];
  const colunas: Coluna<L>[] = [
    { id: 'canal', rotulo: 'Canal', render: (l) => l.canal.nome, principal: true },
    { id: 'recebe', rotulo: 'Você recebe', alinhar: 'dir', render: (l) => formatReais(l.recebido) },
    { id: 'custo', rotulo: 'Custo', alinhar: 'dir', render: (l) => formatReais(l.custo) },
    { id: 'lucro', rotulo: 'Lucro (R$)', alinhar: 'dir', render: (l) => <span class={toCents(l.lucro) < 0 ? 'txt-ruim' : ''}>{formatReais(l.lucro)}</span> },
    {
      id: 'margem',
      rotulo: 'Margem (%)',
      alinhar: 'dir',
      render: (l) => (Number.isFinite(l.margemPct) ? <span class={l.abaixoMinima ? 'txt-ruim negrito' : ''}>{formatPct(l.margemPct)}</span> : '—'),
    },
  ];
  return (
    <div class="pilha pilha-m">
      <Tabela colunas={colunas} linhas={sim.linhas} chave={(l) => l.canal.id} tomLinha={(l) => (l.abaixoMinima || l.prejuizo ? 'ruim' : undefined)} />
      {sim.perdeEm.length > 0 && (
        <Aviso tom="ruim">Com este preço você perde dinheiro em: {sim.perdeEm.join(', ')}</Aviso>
      )}
      {sim.perdeEm.length === 0 && sim.linhas.some((l) => l.abaixoMinima) && (
        <Aviso tom="atencao">Margem abaixo da mínima ({formatPct(custos.margemMinimaPct, 0)}) nas linhas em vermelho.</Aviso>
      )}
    </div>
  );
}

/** Simulador completo: preços sugeridos + campo "Preço de etiqueta" + tabela por canal. */
export function SimuladorPreco({ custoUnit, precoInicial, onUsarPreco }: { custoUnit: number; precoInicial?: Cents | null; onUsarPreco?: (c: Cents) => void }) {
  const sugerida = etiquetaSugerida(custoUnit, db.config.canais, db.config.custos);
  const [preco, setPreco] = useState<Cents | null>(precoInicial ?? sugerida ?? null);
  return (
    <div class="pilha pilha-g">
      <PrecosSugeridos custoUnit={custoUnit} onUsar={(c) => setPreco(c)} />
      <Campo rotulo="Preço de etiqueta">
        <Dinheiro value={preco} onChange={setPreco} />
      </Campo>
      {preco != null && preco > 0 && <TabelaSimulador custoUnit={custoUnit} precoCentavos={preco} />}
      {onUsarPreco && preco != null && preco > 0 && (
        <div>
          <Botao variante="primario" onClick={() => onUsarPreco(preco)}>
            Salvar {formatBRL(preco)} como etiqueta
          </Botao>
        </div>
      )}
    </div>
  );
}

/** Resumo do custo-hora de cada impressora (para telas de configuração). */
export function textoCustoHora(imp: { valorPago: number; vidaUtilH: number; manutencaoH: number }): string {
  return `${formatReais(custoHoraMaquina(imp), 4)}/h`;
}
