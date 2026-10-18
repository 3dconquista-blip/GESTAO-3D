// Abas da área "Estoque": Produtos, Materiais, O que imprimir, Movimentações.
import { Abas } from '../../ui/index.ts';
import './estoque.css';

export function EstoqueAbas({ ativa }: { ativa: 'produtos' | 'materiais' | 'imprimir' | 'movimentacoes' }) {
  return (
    <Abas
      ativa={ativa}
      abas={[
        { id: 'produtos', rotulo: 'Produtos', href: '/estoque/produtos' },
        { id: 'materiais', rotulo: 'Materiais', href: '/estoque/materiais' },
        { id: 'imprimir', rotulo: 'O que imprimir', href: '/estoque/imprimir' },
        { id: 'movimentacoes', rotulo: 'Movimentações', href: '/estoque/movimentacoes' },
      ]}
    />
  );
}

/** Amostra de cor do filamento. */
export function AmostraCor({ hex, tamanho = 22 }: { hex?: string; tamanho?: number }) {
  return <span class="est-amostra" style={{ width: `${tamanho}px`, height: `${tamanho}px`, background: hex || 'var(--superficie-2)' }} aria-hidden="true" />;
}
