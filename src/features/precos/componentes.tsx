// Componentes de precificação compartilhados (cadastro e detalhe do produto, peça personalizada do pedido):
// - FichaTecnicaEditor: mesas, tipo de filamento e gramas (seção 6.3); ComponentesEditor: componentes e mão de obra
// - ComposicaoCustoView: lista + barra empilhada da composição do custo por peça
// - PrecosSugeridos: preço sugerido por canal ativo e etiqueta sugerida (6.4)
// - TabelaSimulador / SimuladorPreco: "Preço de etiqueta" e tabela Canal | Você recebe | Custo | Lucro | Margem
import { useMemo, useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { contextoCusto, materiaisAtivos } from '../../data/selectors.ts';
import type { Cents, Componente, Mesa, MesaFilamento, TipoFilamento } from '../../data/types.ts';
import { TIPO_PADRAO, TIPOS_FILAMENTO, tipoDoSlot } from '../../domain/filamento.ts';
import {
  canaisAtivos,
  comissaoCanal,
  composicaoCusto,
  erroParametros,
  custosComMargem,
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
  Dinheiro,
  Escolha,
  Icon,
  Numero,
  Resumo,
  Tabela,
  type Coluna,
} from '../../ui/index.ts';
import './precos.css';

/**
 * Modo da ficha. Só existe 'produto': a ficha guarda o TIPO de filamento e a cor é escolhida na produção (produto)
 * ou em "Pronto" (peça personalizada do pedido), decisão 85. Fichas e itens antigos com o carretel gravado continuam
 * valendo (o tipo vem do carretel). O parâmetro fica para quem ainda passa modo="produto".
 */
export type ModoFicha = 'produto';

/** Tipos de filamento que têm carretel ativo (para escolher na ficha). */
export function tiposDisponiveis(): TipoFilamento[] {
  const tipos = new Set(materiaisAtivos('filamento').map((m) => m.material ?? TIPO_PADRAO));
  return TIPOS_FILAMENTO.filter((t) => tipos.has(t));
}

/** Mesa nova com padrões: 1 peça, primeira impressora ativa e o primeiro tipo de filamento com carretel (ou PLA). */
export function novaMesa(_modo?: ModoFicha): Mesa {
  const imp = db
    .all('impressoras')
    .filter((i) => i.ativa)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))[0];
  return { id: novoId(), pecasPorMesa: 1, tempoMin: 0, impressoraId: imp?.id ?? '', filamentos: [{ tipo: tiposDisponiveis()[0] ?? TIPO_PADRAO, gramas: 0 }] };
}

export function fichaVazia(_modo?: ModoFicha): FichaTecnica {
  return { mesas: [novaMesa()], componentes: [], maoDeObraMin: 2 };
}

// ---------------------------------------------------------------- Editor da ficha técnica

/**
 * Editor das mesas (peças, tempo, tipo de filamento e gramas). O tipo só aparece com 2 ou mais tipos e a impressora
 * só com 2 ou mais ativas. `mostrarExtras` mostra os botões de outra cor (multicolor) e de outra mesa. Componentes e
 * mão de obra ficam no `ComponentesEditor` (em "Mais detalhes" no produto e no pedido).
 */
export function FichaTecnicaEditor({
  valor,
  onChange,
  mostrarExtras = true,
}: {
  valor: FichaTecnica;
  onChange: (f: FichaTecnica) => void;
  modo?: ModoFicha;
  mostrarExtras?: boolean;
}) {
  const impressoras = db.all('impressoras').filter((i) => i.ativa || valor.mesas.some((m) => m.impressoraId === i.id));
  const tipos = tiposDisponiveis();
  const variasMesas = valor.mesas.length > 1;
  // A impressora só aparece se houver escolha (ou se a da ficha não for a padrão).
  const mostrarImpressora = impressoras.length > 1;

  const mudarMesa = (i: number, patch: Partial<Mesa>) => {
    const mesas = valor.mesas.map((m, k) => (k === i ? { ...m, ...patch } : m));
    onChange({ ...valor, mesas });
  };
  const mudarFil = (i: number, k: number, patch: Partial<MesaFilamento>) =>
    mudarMesa(i, { filamentos: valor.mesas[i].filamentos.map((x, j) => (j === k ? { ...x, ...patch } : x)) });

  return (
    <div class="ficha">
      {valor.mesas.map((mesa, i) => {
        const t = Math.round(mesa.tempoMin || 0);
        const horas = Math.floor(t / 60);
        const minutos = t % 60;
        const conteudo = (
          <>
            <div class="campos-3">
              <Campo rotulo="Peças por mesa" dica="Quantas saem de uma impressão">
                <Numero value={mesa.pecasPorMesa} onChange={(v) => mudarMesa(i, { pecasPorMesa: Math.max(1, v ?? 1) })} decimais={0} min={1} stepper />
              </Campo>
              <Campo rotulo="Tempo da mesa">
                <div class="ficha-tempo">
                  <Numero value={horas} onChange={(h) => mudarMesa(i, { tempoMin: (h ?? 0) * 60 + minutos })} decimais={0} min={0} sufixo="h" ariaLabel="Horas" />
                  <Numero value={minutos} onChange={(m) => mudarMesa(i, { tempoMin: horas * 60 + Math.min(59, m ?? 0) })} decimais={0} min={0} max={59} sufixo="min" ariaLabel="Minutos" />
                </div>
              </Campo>
              {mostrarImpressora && (
                <Campo rotulo="Impressora">
                  <Escolha
                    value={mesa.impressoraId || null}
                    onChange={(v) => mudarMesa(i, { impressoraId: v })}
                    opcoes={impressoras.map((p) => ({ valor: p.id, rotulo: p.nome }))}
                    placeholder={impressoras.length ? 'Escolha a impressora' : 'Cadastre uma impressora'}
                  />
                </Campo>
              )}
            </div>
            <div class="ficha-sub">
              <span class="campo-rotulo">Filamento (gramas do fatiador, mesa inteira)</span>
              {mesa.filamentos.map((f, k) => {
                // Ficha antiga com o carretel gravado: o tipo vem do carretel (trocar o tipo tira o carretel).
                const tipo = tipoDoSlot(f, (id) => db.get('materiais', id));
                const opcoesTipo = Array.from(new Set([...tipos, tipo]));
                return (
                  <div key={k} class={`ficha-item ${opcoesTipo.length <= 1 ? 'ficha-item-so-gramas' : ''}`}>
                    {opcoesTipo.length > 1 ? (
                      <Escolha value={tipo} onChange={(v) => mudarFil(i, k, { tipo: v, materialId: undefined })} opcoes={opcoesTipo.map((t) => ({ valor: t, rotulo: t }))} />
                    ) : null}
                    <Numero value={f.gramas} onChange={(g) => mudarFil(i, k, { gramas: Math.max(0, g ?? 0) })} decimais={1} min={0} sufixo={`g de ${tipo}`} ariaLabel="Gramas" />
                    {mesa.filamentos.length > 1 ? (
                      <Botao pequeno variante="fantasma" icone="fechar" title="Remover cor" onClick={() => mudarMesa(i, { filamentos: mesa.filamentos.filter((_, j) => j !== k) })} />
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
              {mostrarExtras && (
                <Botao pequeno variante="fantasma" icone="plus" onClick={() => mudarMesa(i, { filamentos: [...mesa.filamentos, { tipo: tipos[0] ?? TIPO_PADRAO, gramas: 0 }] })}>
                  Outra cor na mesma peça (multicolor)
                </Botao>
              )}
            </div>
          </>
        );
        return variasMesas ? (
          <fieldset key={mesa.id} class="ficha-mesa">
            <legend>
              Mesa {i + 1}
              <button type="button" class="ficha-remover" onClick={() => onChange({ ...valor, mesas: valor.mesas.filter((_, k) => k !== i) })}>
                <Icon nome="fechar" tamanho={16} /> Remover mesa
              </button>
            </legend>
            {conteudo}
          </fieldset>
        ) : (
          <div key={mesa.id} class="ficha-mesa ficha-mesa-unica">
            {conteudo}
          </div>
        );
      })}
      {mostrarExtras && (
        <Botao variante="fantasma" pequeno icone="plus" onClick={() => onChange({ ...valor, mesas: [...valor.mesas, novaMesa()] })}>
          Outra mesa (peça em partes)
        </Botao>
      )}
    </div>
  );
}

/** Componentes por peça (argola, saquinho...) e mão de obra por peça. */
export function ComponentesEditor({ valor, onChange, mostrarMaoDeObra = true }: { valor: FichaTecnica; onChange: (f: FichaTecnica) => void; mostrarMaoDeObra?: boolean }) {
  const insumos = materiaisAtivos('insumo');
  const mudarComp = (i: number, patch: Partial<Componente>) => {
    onChange({ ...valor, componentes: valor.componentes.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  };
  return (
    <>
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
    </>
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

/** Preços sugeridos por canal. Com `margemPct`, usa a margem própria do produto no lugar da padrão. */
export function PrecosSugeridos({ custoUnit, onUsar, margemPct }: { custoUnit: number; onUsar?: (c: Cents) => void; margemPct?: number | null }) {
  const { canais } = db.config;
  const custos = custosComMargem(db.config.custos, margemPct);
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
          Margem {margemPct != null ? 'deste produto' : 'desejada'} de {formatPct(custos.margemDesejadaPct, 0)}: equivale a vender por {formatNumero(mult, 1)}× o custo na venda direta.
        </small>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Simulador

export function TabelaSimulador({ custoUnit, precoCentavos, margemPct }: { custoUnit: number; precoCentavos: Cents; margemPct?: number | null }) {
  const { canais } = db.config;
  const custos = custosComMargem(db.config.custos, margemPct);
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
export function SimuladorPreco({
  custoUnit,
  precoInicial,
  onUsarPreco,
  margemPct,
}: {
  custoUnit: number;
  precoInicial?: Cents | null;
  onUsarPreco?: (c: Cents) => void;
  margemPct?: number | null;
}) {
  const sugerida = etiquetaSugerida(custoUnit, db.config.canais, custosComMargem(db.config.custos, margemPct));
  const [preco, setPreco] = useState<Cents | null>(precoInicial ?? sugerida ?? null);
  return (
    <div class="pilha pilha-g">
      <PrecosSugeridos custoUnit={custoUnit} onUsar={(c) => setPreco(c)} margemPct={margemPct} />
      <Campo rotulo="Preço de etiqueta">
        <Dinheiro value={preco} onChange={setPreco} />
      </Campo>
      {preco != null && preco > 0 && <TabelaSimulador custoUnit={custoUnit} precoCentavos={preco} margemPct={margemPct} />}
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
