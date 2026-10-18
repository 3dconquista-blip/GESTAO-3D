// Cadastro e edição de cliente (9.1). Só o nome é obrigatório; CPF e e-mail não são pedidos.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { ComoConheceu } from '../../data/types.ts';
import { formatarTelefone } from '../../domain/termo.ts';
import { salvarCliente, type DadosCliente } from '../../services/clientes.ts';
import { AreaTexto, Botao, Campo, Cartao, Chave, Data, Escolha, Pagina, Texto, Vazio, avisar } from '../../ui/index.ts';

export const ROTULO_COMO_CONHECEU: Record<ComoConheceu, string> = {
  instagram: 'Instagram',
  indicacao: 'Indicação',
  parceiro: 'Parceiro (expositor)',
  feira: 'Feira',
  outro: 'Outro',
};

/** Campos do formulário de cliente (reaproveitado no cadastro rápido do pedido). */
export function CamposCliente({ d, mudar, completo = true }: { d: DadosCliente; mudar: (patch: Partial<DadosCliente>) => void; completo?: boolean }) {
  return (
    <div class="formulario">
      <Campo rotulo="Nome" obrigatorio>
        <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} autoFocus />
      </Campo>
      <div class="campos-2">
        <Campo rotulo="WhatsApp" dica="Precisa ter WhatsApp para receber as mensagens">
          <Texto type="tel" inputMode="tel" value={d.whatsapp} onInput={(v) => mudar({ whatsapp: v })} placeholder="(71) 99999-8888" />
        </Campo>
        <Campo rotulo="Instagram">
          <Texto value={d.instagram} onInput={(v) => mudar({ instagram: v })} placeholder="@usuario" />
        </Campo>
      </div>
      {completo && (
        <>
          <div class="campos-2">
            <Campo rotulo="Cidade">
              <Texto value={d.cidade} onInput={(v) => mudar({ cidade: v })} />
            </Campo>
            <Campo rotulo="Bairro">
              <Texto value={d.bairro} onInput={(v) => mudar({ bairro: v })} />
            </Campo>
          </div>
          <Campo rotulo="Endereço" dica="Só se houver entrega">
            <Texto value={d.endereco} onInput={(v) => mudar({ endereco: v })} />
          </Campo>
          <div class="campos-2">
            <Campo rotulo="Aniversário (opcional)">
              <Data value={d.aniversario && d.aniversario.length === 10 ? d.aniversario : ''} onInput={(v) => mudar({ aniversario: v })} />
            </Campo>
            <Campo rotulo="Como conheceu">
              <Escolha value={d.comoConheceu ?? ''} onChange={(v) => mudar({ comoConheceu: (v || undefined) as ComoConheceu | undefined })} opcoes={[{ valor: '', rotulo: '—' }, ...Object.entries(ROTULO_COMO_CONHECEU).map(([v, r]) => ({ valor: v, rotulo: r }))]} />
            </Campo>
          </div>
          <Chave checked={!!d.aceitaNovidades} onChange={(v) => mudar({ aceitaNovidades: v })}>
            Aceita receber novidades
          </Chave>
          <Campo rotulo="Observações">
            <AreaTexto value={d.observacoes} onInput={(v) => mudar({ observacoes: v })} />
          </Campo>
        </>
      )}
    </div>
  );
}

export function ClienteForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('clientes', params.id) : undefined;
  const [d, setD] = useState<DadosCliente>(() => (atual ? { ...atual, whatsapp: formatarTelefone(atual.whatsapp) } : { nome: '', aceitaNovidades: false }));
  if (params.id && !atual) {
    return (
      <div class="pagina">
        <Vazio titulo="Cliente não encontrado" acao={{ rotulo: 'Ver clientes', href: '/clientes' }} />
      </div>
    );
  }
  const salvar = () => {
    try {
      const c = salvarCliente({ ...d, id: atual?.id });
      avisar(atual ? 'Cliente salvo' : 'Cliente cadastrado');
      const voltar = query.get('voltar');
      navegar(voltar ? `${voltar}${voltar.includes('?') ? '&' : '?'}cliente=${c.id}` : `/clientes/${c.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };
  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo cliente'} voltarPara={atual ? `/clientes/${atual.id}` : '/clientes'} largura="estreita">
      <Cartao>
        <CamposCliente d={d} mudar={(patch) => setD({ ...d, ...patch })} />
      </Cartao>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Pagina>
  );
}
