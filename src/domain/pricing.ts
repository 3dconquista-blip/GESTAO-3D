// Motor de precificação (seção 6 da especificação). Funções puras.
// Custos em reais (sem arredondar até o resultado final); preços em centavos.
import type { Cents } from '../lib/money.ts';
import { arredondarPreco, round4, toCents, toReais } from '../lib/money.ts';
import type { Canal, Componente, ID, Impressora, Material, Mesa, ParametrosCusto } from '../data/types.ts';

export interface ContextoCusto {
  custos: ParametrosCusto;
  impressora: (id: ID) => Impressora | undefined;
  material: (id: ID) => Material | undefined;
}

export interface FichaTecnica {
  mesas: Mesa[];
  componentes: Componente[];
  maoDeObraMin: number;
}

/** custo_hora_máquina = valor_pago ÷ vida_útil_horas + manutenção_por_hora */
export function custoHoraMaquina(imp: Pick<Impressora, 'valorPago' | 'vidaUtilH' | 'manutencaoH'>): number {
  const deprec = imp.vidaUtilH > 0 ? imp.valorPago / imp.vidaUtilH : 0;
  return deprec + (imp.manutencaoH || 0);
}

/** custo_por_grama = custo médio do kg ÷ 1000 */
export function custoPorGrama(mat: Pick<Material, 'custoMedio'>): number {
  return (mat.custoMedio || 0) / 1000;
}

export interface CustoMesa {
  material: number;
  energia: number;
  maquina: number;
  /** material + energia + máquina */
  base: number;
  /** base × taxa de falha */
  falhas: number;
  /** base × (1 + taxa de falha) */
  total: number;
  avisos: string[];
}

/** Custo de uma mesa inteira (uma impressão). */
export function custoMesa(mesa: Mesa, ctx: ContextoCusto): CustoMesa {
  const avisos: string[] = [];
  let material = 0;
  for (const f of mesa.filamentos) {
    const mat = ctx.material(f.materialId);
    if (!mat) {
      avisos.push('Filamento não encontrado em uma das mesas.');
      continue;
    }
    material += (f.gramas || 0) * custoPorGrama(mat);
  }
  const horas = (mesa.tempoMin || 0) / 60;
  const imp = ctx.impressora(mesa.impressoraId);
  let energia = 0;
  let maquina = 0;
  if (!imp) {
    avisos.push('Escolha a impressora de cada mesa.');
  } else {
    energia = (imp.potenciaW / 1000) * horas * ctx.custos.tarifaKwh;
    maquina = horas * custoHoraMaquina(imp);
  }
  const base = material + energia + maquina;
  const falhas = base * ((ctx.custos.taxaFalhaPct || 0) / 100);
  return { material, energia, maquina, base, falhas, total: base + falhas, avisos };
}

export interface ComposicaoCusto {
  /** Por peça, em reais, sem arredondar. */
  material: number;
  energia: number;
  maquina: number;
  falhas: number;
  /** material + energia + máquina + falhas */
  impressao: number;
  componentes: number;
  maoDeObra: number;
  total: number;
  avisos: string[];
}

/**
 * Custo por peça de uma ficha técnica:
 * impressão_por_peça = Σ mesas [(material + energia + máquina) × (1 + falha) ÷ N]
 * custo_unitário = impressão_por_peça + Σ(qtd × custo do componente) + (min ÷ 60) × valor_hora
 */
export function composicaoCusto(ficha: FichaTecnica, ctx: ContextoCusto): ComposicaoCusto {
  const avisos: string[] = [];
  let material = 0;
  let energia = 0;
  let maquina = 0;
  let falhas = 0;
  for (const mesa of ficha.mesas) {
    const n = mesa.pecasPorMesa > 0 ? mesa.pecasPorMesa : 1;
    if (!(mesa.pecasPorMesa > 0)) avisos.push('Informe quantas peças saem em cada mesa.');
    const c = custoMesa(mesa, ctx);
    avisos.push(...c.avisos);
    material += c.material / n;
    energia += c.energia / n;
    maquina += c.maquina / n;
    falhas += c.falhas / n;
  }
  let componentes = 0;
  for (const comp of ficha.componentes) {
    const mat = ctx.material(comp.materialId);
    if (!mat) {
      avisos.push('Componente não encontrado no cadastro de insumos.');
      continue;
    }
    componentes += (comp.quantidade || 0) * (mat.custoMedio || 0);
  }
  const maoDeObra = ((ficha.maoDeObraMin || 0) / 60) * ctx.custos.valorHora;
  const impressao = material + energia + maquina + falhas;
  return {
    material,
    energia,
    maquina,
    falhas,
    impressao,
    componentes,
    maoDeObra,
    total: impressao + componentes + maoDeObra,
    avisos: Array.from(new Set(avisos)),
  };
}

/** Custo unitário com 4 casas decimais. */
export function custoUnitario(ficha: FichaTecnica, ctx: ContextoCusto): number {
  return round4(composicaoCusto(ficha, ctx).total);
}

// ---------------------------------------------------------------- Canais

/** Comissão % do canal ('Direto cartão' usa a taxa do cartão da configuração). */
export function comissaoCanal(canal: Canal, custos: ParametrosCusto): number {
  return canal.tipo === 'cartao' ? custos.taxaCartaoPct : canal.comissaoPct;
}

/** recebido(canal) = P × (1 − comissão) − tarifa_fixa  (reais) */
export function recebidoNoCanal(precoCentavos: Cents, canal: Canal, custos: ParametrosCusto): number {
  const p = toReais(precoCentavos);
  return p * (1 - comissaoCanal(canal, custos) / 100) - toReais(canal.tarifaFixaCentavos || 0);
}

/**
 * Parâmetros com a margem própria de um produto no lugar da margem desejada padrão. A margem mínima de alerta
 * desce junto quando a margem do produto for menor (senão o preço sugerido já nasceria vermelho).
 */
export function custosComMargem(custos: ParametrosCusto, margemPct?: number | null): ParametrosCusto {
  if (margemPct == null || !Number.isFinite(margemPct)) return custos;
  return { ...custos, margemDesejadaPct: margemPct, margemMinimaPct: Math.min(custos.margemMinimaPct, margemPct) };
}

/** Erro de parâmetros que impede calcular preço sugerido, ou null. */
export function erroParametros(custos: ParametrosCusto, canal?: Canal): string | null {
  if (custos.margemDesejadaPct >= 100) {
    return 'A margem desejada chega a 100% ou mais. Assim nenhum preço cobre o custo. Reduza a margem.';
  }
  if (canal && comissaoCanal(canal, custos) >= 100) {
    return `A comissão do canal "${canal.nome}" é de 100% ou mais. Assim você não recebe nada. Corrija a comissão.`;
  }
  return null;
}

/** Multiplicador equivalente na venda direta: 1 ÷ (1 − margem). null se inválido. */
export function multiplicadorDireto(custos: ParametrosCusto): number | null {
  const den = 1 - custos.margemDesejadaPct / 100;
  return den > 0 ? 1 / den : null;
}

export interface PrecoSugerido {
  canal: Canal;
  /** Valor exato antes do arredondamento (reais). */
  exato: number;
  /** Preço arredondado conforme a configuração (centavos). */
  centavos: Cents;
}

/**
 * preço_sugerido(canal) = (custo ÷ (1 − margem) + tarifa_fixa) ÷ (1 − comissão),
 * arredondado conforme a configuração. Retorna { erro } se os parâmetros forem inválidos.
 */
export function precoSugerido(
  custoUnit: number,
  canal: Canal,
  custos: ParametrosCusto,
): PrecoSugerido | { erro: string } {
  const erro = erroParametros(custos, canal);
  if (erro) return { erro };
  const den = 1 - custos.margemDesejadaPct / 100;
  const com = comissaoCanal(canal, custos) / 100;
  const exato = (custoUnit / den + toReais(canal.tarifaFixaCentavos || 0)) / (1 - com);
  return { canal, exato, centavos: arredondarPreco(exato, custos.arredondamento) };
}

export function canaisAtivos(canais: Canal[]): Canal[] {
  return canais.filter((c) => c.ativo);
}

/** Etiqueta sugerida = maior preço sugerido entre os canais ativos (centavos), ou null se houver erro. */
export function etiquetaSugerida(custoUnit: number, canais: Canal[], custos: ParametrosCusto): Cents | null {
  let maior: Cents | null = null;
  for (const c of canaisAtivos(canais)) {
    const s = precoSugerido(custoUnit, c, custos);
    if ('erro' in s) return null;
    if (maior == null || s.centavos > maior) maior = s.centavos;
  }
  return maior;
}

export interface LinhaSimulacao {
  canal: Canal;
  /** Você recebe (reais). */
  recebido: number;
  custo: number;
  /** recebido − custo (reais). */
  lucro: number;
  /** lucro ÷ recebido × 100 (NaN se recebido ≤ 0). */
  margemPct: number;
  abaixoMinima: boolean;
  prejuizo: boolean;
}

/** Análise de um preço de etiqueta num canal. */
export function analisarPreco(
  precoCentavos: Cents,
  custoUnit: number,
  canal: Canal,
  custos: ParametrosCusto,
): LinhaSimulacao {
  const recebido = recebidoNoCanal(precoCentavos, canal, custos);
  const lucro = recebido - custoUnit;
  const margemPct = recebido > 0 ? (lucro / recebido) * 100 : Number.NaN;
  // Compara com a margem já arredondada a 1 casa (o que o dono vê na tela).
  const margemExibida = Number.isFinite(margemPct) ? Math.round(margemPct * 10) / 10 : -Infinity;
  return {
    canal,
    recebido,
    custo: custoUnit,
    lucro,
    margemPct,
    abaixoMinima: margemExibida < custos.margemMinimaPct,
    prejuizo: toCents(lucro) < 0,
  };
}

export interface Simulacao {
  linhas: LinhaSimulacao[];
  /** Nomes dos canais com prejuízo: "Com este preço você perde dinheiro em: ..." */
  perdeEm: string[];
  /** Menor margem entre os canais ativos (para status do produto). */
  piorMargemPct: number;
}

export function simular(precoCentavos: Cents, custoUnit: number, canais: Canal[], custos: ParametrosCusto): Simulacao {
  const linhas = canaisAtivos(canais).map((c) => analisarPreco(precoCentavos, custoUnit, c, custos));
  const margens = linhas.map((l) => (Number.isFinite(l.margemPct) ? l.margemPct : -Infinity));
  return {
    linhas,
    perdeEm: linhas.filter((l) => l.prejuizo).map((l) => l.canal.nome),
    piorMargemPct: margens.length ? Math.min(...margens) : Number.NaN,
  };
}

export type StatusMargem = 'ok' | 'atencao' | 'prejuizo' | 'sem_preco';

/** Status de margem do produto: vermelho (prejuízo ou abaixo da mínima), amarelo (abaixo da desejada), verde. */
export function statusMargem(precoCentavos: Cents, custoUnit: number, canais: Canal[], custos: ParametrosCusto): StatusMargem {
  if (!precoCentavos) return 'sem_preco';
  const s = simular(precoCentavos, custoUnit, canais, custos);
  if (s.perdeEm.length || s.linhas.some((l) => l.abaixoMinima)) return 'prejuizo';
  if (s.piorMargemPct < custos.margemDesejadaPct - 0.05) return 'atencao';
  return 'ok';
}
