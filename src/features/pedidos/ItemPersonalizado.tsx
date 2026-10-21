// Peça personalizada do pedido, enxuta (decisões 85 e 86): descrição, quantidade, tempo total e gramas totais (como o
// fatiador mostra, somando todas as peças) e o TIPO de filamento (só com 2 ou mais tipos). A cor é escolhida em
// "Pronto". Guarda UMA mesa com todas as peças (peças por mesa = quantidade); mudar a quantidade reescala o tempo e as
// gramas. Impressora, componentes, mão de obra e custo ficam em "Mais detalhes", com o botão para a ficha completa
// (multicolor ou várias mesas). Itens que não cabem nesse formato abrem direto na ficha completa e ficam como estão.
import { db } from '../../data/db.ts';
import type { ID, Mesa, TipoFilamento } from '../../data/types.ts';
import { TIPO_PADRAO, tipoDoSlot } from '../../domain/filamento.ts';
import type { CustoItem } from '../../domain/pedidos.ts';
import type { FichaTecnica } from '../../domain/pricing.ts';
import { formatDuracao, formatGramas, formatQtd, formatReais } from '../../lib/format.ts';
import { Aviso, Botao, Campo, Escolha, MaisDetalhes, Numero, Texto } from '../../ui/index.ts';
import { ComponentesEditor, FichaTecnicaEditor, fichaVazia, tiposDisponiveis } from '../precos/componentes.tsx';
import './pedidos.css';

export interface PecaPersonalizada {
  descricao: string;
  quantidade: number;
  ficha: FichaTecnica;
  /** Ficha completa (várias mesas ou cores, ou peças por mesa diferente da quantidade). */
  completo: boolean;
}

/** A ficha cabe no editor simples: uma mesa, no máximo um filamento e peças por mesa = quantidade. */
export function cabeNoSimples(ficha: FichaTecnica, quantidade: number): boolean {
  return ficha.mesas.length === 1 && ficha.mesas[0].filamentos.length <= 1 && ficha.mesas[0].pecasPorMesa === quantidade;
}

/** Peça nova: 1 unidade, impressora padrão, o primeiro tipo de filamento com carretel (ou PLA), sem carretel escolhido. */
export function novaPecaPersonalizada(): PecaPersonalizada {
  return { descricao: '', quantidade: 1, ficha: fichaVazia('produto'), completo: false };
}

/** Peça ainda em branco (sem descrição, tempo, gramas nem componentes). */
export function pecaEmBranco(p: PecaPersonalizada): boolean {
  return !p.descricao.trim() && !p.ficha.componentes.length && p.ficha.mesas.every((m) => !m.tempoMin && m.filamentos.every((f) => !f.gramas));
}

/** Arredonda o reescalonamento a 2 casas (sem acumular erro ao digitar a quantidade aos poucos). */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mesma peça com outra quantidade: tempo e gramas da mesa crescem na mesma proporção. */
function reescalar(ficha: FichaTecnica, quantidade: number): FichaTecnica {
  const mesa = ficha.mesas[0];
  if (!mesa) return ficha;
  const fator = mesa.pecasPorMesa > 0 ? quantidade / mesa.pecasPorMesa : 1;
  return {
    ...ficha,
    mesas: [{ ...mesa, pecasPorMesa: quantidade, tempoMin: Math.round(mesa.tempoMin * fator), filamentos: mesa.filamentos.map((f) => ({ ...f, gramas: r2(f.gramas * fator) })) }],
  };
}

export function ItemPersonalizadoEditor({ valor, onChange, custo }: { valor: PecaPersonalizada; onChange: (patch: Partial<PecaPersonalizada>) => void; custo: CustoItem }) {
  const { ficha, quantidade } = valor;
  const material = (id: ID) => db.get('materiais', id);
  const mesa = ficha.mesas[0];
  const impressorasAtivas = db.all('impressoras').filter((i) => i.ativa);
  const nomeImpressora = mesa ? db.get('impressoras', mesa.impressoraId)?.nome : undefined;
  const mudarFicha = (f: FichaTecnica) => onChange({ ficha: f });
  const qtdComp = ficha.componentes.length;
  const resumo = [
    !valor.completo ? nomeImpressora : '',
    qtdComp ? `${qtdComp} ${qtdComp === 1 ? 'componente' : 'componentes'}` : '',
    `${formatQtd(ficha.maoDeObraMin, 1)} min/peça`,
  ]
    .filter(Boolean)
    .join(' · ');

  const descricao = (
    <Campo rotulo="Descrição da peça">
      <Texto value={valor.descricao} onInput={(v) => onChange({ descricao: v })} placeholder="Ex.: chaveiro com nome" />
    </Campo>
  );
  const custoTexto = (
    <p class="muted ped-item-porpeca">
      Custo: {formatReais(custo.custoUnit, 4)} por peça · {formatReais(custo.custoTotalExato)} no total
    </p>
  );
  const avisos = custo.avisos.map((a) => (
    <Aviso key={a} tom="atencao">
      {a}
    </Aviso>
  ));

  if (valor.completo || !mesa) {
    return (
      <>
        <div class="campos-2">
          {descricao}
          <Campo rotulo="Quantidade">
            <Numero value={quantidade} onChange={(v) => onChange({ quantidade: Math.max(1, v ?? 1) })} decimais={0} min={1} stepper />
          </Campo>
        </div>
        <FichaTecnicaEditor valor={ficha} onChange={mudarFicha} modo="produto" mostrarExtras />
        {avisos}
        <MaisDetalhes resumo={resumo}>
          <ComponentesEditor valor={ficha} onChange={mudarFicha} />
          {custoTexto}
        </MaisDetalhes>
      </>
    );
  }

  const fil = mesa.filamentos[0];
  const tipo = fil ? tipoDoSlot(fil, material) : (tiposDisponiveis()[0] ?? TIPO_PADRAO);
  const tipos = Array.from(new Set([...tiposDisponiveis(), tipo]));
  const gramas = fil?.gramas ?? 0;
  const tempo = Math.round(mesa.tempoMin || 0);
  const horas = Math.floor(tempo / 60);
  const minutos = tempo % 60;
  const mudarMesa = (patch: Partial<Mesa>) => mudarFicha({ ...ficha, mesas: [{ ...mesa, ...patch }] });
  // Trocar o tipo tira o carretel de itens antigos; mudar só as gramas mantém.
  const mudarGramas = (g: number) => mudarMesa({ filamentos: [fil ? { ...fil, gramas: g } : { tipo, gramas: g }] });
  const mudarQuantidade = (q: number) => onChange({ quantidade: q, ficha: reescalar(ficha, q) });
  const mudarTipo = (t: TipoFilamento) => mudarMesa({ filamentos: [{ tipo: t, gramas }] });
  const porPeca = quantidade > 1 && (gramas > 0 || tempo > 0) ? [gramas > 0 ? formatGramas(gramas / quantidade) : '', tempo > 0 ? formatDuracao(tempo / quantidade) : ''].filter(Boolean).join(' · ') : '';

  return (
    <>
      {descricao}
      <div class="campos-2">
        <Campo rotulo="Quantidade">
          <Numero value={quantidade} onChange={(v) => mudarQuantidade(Math.max(1, v ?? 1))} decimais={0} min={1} stepper />
        </Campo>
        {tipos.length > 1 && (
          <Campo rotulo="Tipo de filamento">
            <Escolha value={tipo} onChange={mudarTipo} opcoes={tipos.map((t) => ({ valor: t, rotulo: t }))} />
          </Campo>
        )}
      </div>
      <div class="campos-2">
        <Campo rotulo="Tempo total" dica="Do fatiador, somando todas as peças">
          <div class="ped-item-tempo">
            <Numero value={horas} onChange={(h) => mudarMesa({ tempoMin: (h ?? 0) * 60 + minutos })} decimais={0} min={0} sufixo="h" ariaLabel="Horas" />
            <Numero value={minutos} onChange={(m) => mudarMesa({ tempoMin: horas * 60 + Math.min(59, m ?? 0) })} decimais={0} min={0} max={59} sufixo="min" ariaLabel="Minutos" />
          </div>
        </Campo>
        <Campo rotulo="Gramas totais" dica="Do fatiador, somando todas as peças">
          <Numero value={gramas} onChange={(g) => mudarGramas(Math.max(0, g ?? 0))} decimais={1} min={0} sufixo={tipos.length > 1 ? `g de ${tipo}` : 'g'} />
        </Campo>
      </div>
      {porPeca && <p class="muted ped-item-porpeca">Por peça: {porPeca}</p>}
      {avisos}
      <MaisDetalhes resumo={resumo}>
        {impressorasAtivas.length > 1 && (
          <Campo rotulo="Impressora">
            <Escolha
              value={mesa.impressoraId || null}
              onChange={(v) => mudarMesa({ impressoraId: v })}
              opcoes={db
                .all('impressoras')
                .filter((i) => i.ativa || i.id === mesa.impressoraId)
                .map((i) => ({ valor: i.id, rotulo: i.nome }))}
              placeholder="Escolha a impressora"
            />
          </Campo>
        )}
        <ComponentesEditor valor={ficha} onChange={mudarFicha} />
        {custoTexto}
        <div>
          <Botao pequeno variante="fantasma" icone="camadas" onClick={() => onChange({ completo: true })}>
            Peça multicolor ou em mais de uma mesa
          </Botao>
        </div>
      </MaisDetalhes>
    </>
  );
}
