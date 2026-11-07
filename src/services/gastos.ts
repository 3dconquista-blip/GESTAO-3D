// "Outros custos e despesas" (decisões 106 e 111): entregador, gasolina, embalagem, anúncio... Dois campos: o que foi
// e quanto custou. Entram no lucro do período; "Desfazer" cancela (o registro continua guardado).
import { db } from '../data/db.ts';
import type { Cents, Gasto, ID, ISODate } from '../data/types.ts';
import { fimDoMes, hojeISO, inicioDoMes } from '../lib/dates.ts';
import { ErroNegocio } from './estoque.ts';

export interface DadosGasto {
  descricao: string;
  valorCentavos: Cents;
  /** Padrão: hoje. */
  data?: ISODate;
}

export function lancarGasto(d: DadosGasto): Gasto {
  const descricao = (d.descricao ?? '').trim();
  if (!descricao) throw new ErroNegocio('Diga com o que foi o gasto.');
  if (!Number.isInteger(d.valorCentavos) || d.valorCentavos <= 0) throw new ErroNegocio('Informe o valor do gasto.');
  const data = d.data || hojeISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroNegocio('Data inválida.');
  return db.tx((t) => t.insert('gastos', { data, descricao, valorCentavos: d.valorCentavos }));
}

export function cancelarGasto(id: ID): Gasto {
  return db.tx((t) => {
    const g = t.get('gastos', id);
    if (!g) throw new ErroNegocio('Gasto não encontrado.');
    if (g.cancelado) throw new ErroNegocio('Este gasto já foi desfeito.');
    return t.update('gastos', id, { cancelado: true });
  });
}

/** Atalhos que aparecem depois dos usados por último (os custos mais comuns de quem entrega as peças). */
export const SUGESTOES_GASTO = ['Entregador', 'Gasolina', 'Embalagem', 'Anúncio'];

/** Atalhos de "Com o que foi": os usados por último e, completando, as sugestões comuns (sem repetir). */
export function atalhosGasto(limite = 6): string[] {
  const out = descricoesRecentes(limite);
  const vistas = new Set(out.map((d) => d.toLocaleLowerCase('pt-BR')));
  for (const s of SUGESTOES_GASTO) {
    if (out.length >= limite) break;
    if (!vistas.has(s.toLocaleLowerCase('pt-BR'))) out.push(s);
  }
  return out;
}

/** Custos e despesas do mês de `dia` (sem os desfeitos), do mais recente ao mais antigo, com o total. */
export function gastosDoMes(dia: ISODate): { de: ISODate; ate: ISODate; gastos: Gasto[]; totalCentavos: Cents } {
  const de = inicioDoMes(dia);
  const ate = fimDoMes(dia);
  const gastos = db
    .all('gastos')
    .filter((g) => !g.cancelado && g.data >= de && g.data <= ate)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  return { de, ate, gastos, totalCentavos: gastos.reduce((s, g) => s + g.valorCentavos, 0) };
}

/** Descrições usadas por último (sem repetir), para lançar de novo com um toque. */
export function descricoesRecentes(limite = 6): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  const lista = db
    .all('gastos')
    .filter((g) => !g.cancelado)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  for (const g of lista) {
    const chave = g.descricao.toLocaleLowerCase('pt-BR');
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push(g.descricao);
    if (out.length >= limite) break;
  }
  return out;
}
