// Migração de registros antigos, aplicada só em memória ao carregar (IndexedDB, backup importado e nuvem).
// Não regrava nada e não muda `atualizadoEm`: o registro guardado continua como estava (versões antigas do app em
// outros aparelhos seguem lendo) e a sincronização não o trata como alterado. Cada regra é idempotente.
import type { Base, NomeColecao, Pedido } from './types.ts';

/**
 * Registro como o app atual entende. Pedidos na etapa obsoleta 'aprovado' passam para 'producao' ("Aprovado" e
 * "Em produção" viraram uma etapa só); o resto volta igual (o mesmo objeto).
 */
export function migrarRegistro<T extends Base>(col: NomeColecao, rec: T): T {
  if (col === 'pedidos' && (rec as unknown as Pedido).etapa === 'aprovado') return { ...rec, etapa: 'producao' };
  return rec;
}
