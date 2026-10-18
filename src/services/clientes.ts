// Clientes (seção 9.1): cadastro, arquivamento, exclusão de dados pessoais (LGPD) e números da ficha.
// Só o nome é obrigatório. Clientes não são apagados: são arquivados ou anonimizados.
import { db } from '../data/db.ts';
import type { Cliente, ComoConheceu, ID } from '../data/types.ts';
import type { EstatisticasCliente } from '../domain/pedidos.ts';
import { estatisticasDoCliente } from '../domain/pedidos.ts';
import { normalizarWhatsApp } from '../domain/whatsapp.ts';
import { ErroNegocio } from './estoque.ts';

export interface DadosCliente {
  /** Com id: altera o cliente; sem id: cadastra um novo. */
  id?: ID;
  nome: string;
  whatsapp?: string;
  instagram?: string;
  cidade?: string;
  bairro?: string;
  /** Só se houver entrega. */
  endereco?: string;
  /** 'MM-DD' ou 'YYYY-MM-DD'. */
  aniversario?: string;
  comoConheceu?: ComoConheceu;
  /** "Aceita receber novidades" (padrão não). */
  aceitaNovidades?: boolean;
  observacoes?: string;
}

const CAMPOS_TEXTO = ['instagram', 'cidade', 'bairro', 'endereco', 'observacoes'] as const;

function texto(v: string | undefined): string | undefined {
  const s = (v ?? '').trim();
  return s || undefined;
}

function validarAniversario(v: string | undefined): string | undefined {
  const s = texto(v);
  if (!s) return undefined;
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(s);
  const mes = m ? Number(m[2]) : 0;
  const dia = m ? Number(m[3]) : 0;
  if (!m || mes < 1 || mes > 12 || dia < 1 || dia > 31) throw new ErroNegocio('Data de aniversário inválida. Informe dia e mês.');
  return s;
}

function validarWhatsApp(v: string | undefined): string | undefined {
  const s = texto(v);
  if (!s) return undefined;
  const r = normalizarWhatsApp(s);
  if (!r.numero) throw new ErroNegocio(`${r.erro} Use um número que tenha WhatsApp.`);
  return r.numero;
}

/**
 * Cadastra ou altera um cliente. Só o nome é obrigatório. O WhatsApp é guardado só com dígitos
 * (55 + DDD + número). "Aceita receber novidades" começa como não. Campos enviados vazios são limpos;
 * campos não enviados ficam como estão.
 */
export function salvarCliente(dados: DadosCliente): Cliente {
  return db.tx((t) => {
    const nome = (dados.nome ?? '').trim();
    if (!nome) throw new ErroNegocio('Informe o nome do cliente.');
    const patch: Partial<Cliente> = { nome };
    if ('whatsapp' in dados) patch.whatsapp = validarWhatsApp(dados.whatsapp);
    for (const campo of CAMPOS_TEXTO) if (campo in dados) patch[campo] = texto(dados[campo]);
    if ('aniversario' in dados) patch.aniversario = validarAniversario(dados.aniversario);
    if ('comoConheceu' in dados) patch.comoConheceu = dados.comoConheceu || undefined;
    if (dados.aceitaNovidades !== undefined) patch.aceitaNovidades = !!dados.aceitaNovidades;

    if (dados.id) {
      const atual = t.get('clientes', dados.id);
      if (!atual) throw new ErroNegocio('Cliente não encontrado.');
      if (atual.anonimizado) throw new ErroNegocio('Os dados deste cliente foram excluídos e não podem ser editados.');
      return t.update('clientes', atual.id, (c) => ({ ...c, ...patch }));
    }
    return t.insert('clientes', { ...patch, nome, aceitaNovidades: patch.aceitaNovidades ?? false, arquivado: false });
  });
}

/** Arquiva (ou reativa, com `arquivar = false`) o cliente. O histórico continua. */
export function arquivarCliente(id: ID, arquivar = true): Cliente {
  return db.tx((t) => {
    const c = t.get('clientes', id);
    if (!c) throw new ErroNegocio('Cliente não encontrado.');
    if (!arquivar && c.anonimizado) throw new ErroNegocio('Os dados deste cliente foram excluídos.');
    return t.update('clientes', id, { arquivado: arquivar });
  });
}

/**
 * "Excluir dados do cliente" (LGPD): troca o nome por "Cliente removido <código>", apaga contatos,
 * endereço, aniversário e observações, desliga as novidades e arquiva. Pedidos, vendas e pagamentos
 * continuam (só os totais ficam ligados ao cliente anônimo).
 */
export function excluirDadosCliente(id: ID): Cliente {
  return db.tx((t) => {
    const c = t.get('clientes', id);
    if (!c) throw new ErroNegocio('Cliente não encontrado.');
    return t.update('clientes', id, (atual) => ({
      id: atual.id,
      criadoEm: atual.criadoEm,
      atualizadoEm: atual.atualizadoEm,
      ...(atual.exemplo ? { exemplo: true } : {}),
      nome: `Cliente removido ${id.replace(/-/g, '').slice(0, 6)}`,
      aceitaNovidades: false,
      anonimizado: true,
      arquivado: true,
    }));
  });
}

/** Clientes não arquivados, em ordem alfabética (para listas e seleção no pedido). */
export function clientesAtivos(): Cliente[] {
  return db
    .all('clientes')
    .filter((c) => !c.arquivado)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Números da ficha: pedidos (todas as etapas), compras (vendas não canceladas + pedidos entregues),
 * total gasto, última compra, ticket médio, crédito (pago a mais) e valor a receber.
 */
export function estatisticasCliente(id: ID): EstatisticasCliente {
  return estatisticasDoCliente(id, db.all('pedidos'), db.all('vendas'), db.all('pagamentos'));
}
