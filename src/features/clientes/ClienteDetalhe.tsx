// Ficha do cliente (9.1): pedidos, compras, total gasto, última compra, ticket médio, crédito,
// botão de WhatsApp e "Excluir dados do cliente" (LGPD).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_ETAPA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import type { Pedido, Venda } from '../../data/types.ts';
import { mensagemAniversario, mensagemPromocao, podeReceberNovidades } from '../../domain/mensagensPedido.ts';
import { numeroPedido } from '../../domain/pedidos.ts';
import { formatarTelefone } from '../../domain/termo.ts';
import { formatBRL, formatData } from '../../lib/format.ts';
import { arquivarCliente, estatisticasCliente, excluirDadosCliente } from '../../services/clientes.ts';
import { AreaTexto, Aviso, Botao, Campo, Cartao, Grade, Indicador, Linha, Modal, Pagina, Resumo, Selo, Tabela, Vazio, avisar, confirmar, type Coluna } from '../../ui/index.ts';
import { BotaoWhatsApp } from '../parceiros/comum.tsx';
import { resumoItens } from '../vendas/VendasLista.tsx';
import { ROTULO_COMO_CONHECEU } from './ClienteForm.tsx';

export function ClienteDetalhe({ params }: TelaProps) {
  useDb();
  const [novidade, setNovidade] = useState<'promocao' | 'aniversario' | null>(null);
  const [textoPromo, setTextoPromo] = useState('');
  const c = db.get('clientes', params.id);
  if (!c) {
    return (
      <div class="pagina">
        <Vazio titulo="Cliente não encontrado" acao={{ rotulo: 'Ver clientes', href: '/clientes' }} />
      </div>
    );
  }
  const e = estatisticasCliente(c.id);
  const pedidos = db
    .all('pedidos')
    .filter((p) => p.clienteId === c.id)
    .sort((a, b) => b.numero - a.numero);
  const vendas = db
    .all('vendas')
    .filter((v) => v.clienteId === c.id)
    .sort((a, b) => b.data.localeCompare(a.data));

  const colPedidos: Coluna<Pedido>[] = [
    { id: 'num', rotulo: 'Pedido', principal: true, render: (p) => `${numeroPedido(p.numero)} — ${p.titulo}` },
    { id: 'etapa', rotulo: 'Etapa', render: (p) => <Selo tom={p.etapa === 'cancelado' ? 'neutro' : p.etapa === 'entregue' ? 'ok' : 'info'}>{ROTULO_ETAPA[p.etapa]}</Selo> },
    { id: 'total', rotulo: 'Total', alinhar: 'dir', render: (p) => formatBRL(p.totalCentavos) },
  ];
  const colVendas: Coluna<Venda>[] = [
    { id: 'data', rotulo: 'Data', principal: true, render: (v) => formatData(v.data) },
    { id: 'itens', rotulo: 'Itens', render: (v) => resumoItens(v) },
    { id: 'total', rotulo: 'Total', alinhar: 'dir', render: (v) => (v.cancelada ? <Selo tom="neutro">Cancelada</Selo> : formatBRL(v.totalCentavos)) },
  ];

  const excluir = async () => {
    const ok = await confirmar({
      titulo: 'Excluir os dados deste cliente?',
      itens: [
        'Nome, WhatsApp, Instagram, endereço, aniversário e observações são apagados (LGPD).',
        'Os pedidos e as vendas continuam, ligados a um cliente anônimo, para não mudar os totais.',
        'Não dá para desfazer.',
      ],
      confirmar: 'Excluir dados',
      perigo: true,
    });
    if (!ok) return;
    excluirDadosCliente(c.id);
    avisar('Dados do cliente excluídos');
  };

  const textoNovidade = novidade === 'promocao' ? mensagemPromocao(c, db.config, textoPromo || '...') : novidade === 'aniversario' ? mensagemAniversario(c, db.config) : null;

  return (
    <Pagina
      titulo={c.nome}
      subtitulo={[c.cidade, c.bairro].filter(Boolean).join(' · ')}
      voltarPara="/clientes"
      acoes={
        !c.anonimizado ? (
          <Botao variante="primario" icone="pedidos" href={`/pedidos/novo?cliente=${c.id}`}>
            Novo pedido
          </Botao>
        ) : undefined
      }
    >
      {c.anonimizado && <Aviso tom="neutro">Os dados pessoais deste cliente foram excluídos. Ficaram só os totais das compras.</Aviso>}
      {c.arquivado && !c.anonimizado && <Aviso tom="neutro">Cliente arquivado.</Aviso>}
      <div class="indicadores">
        <Indicador rotulo="Total gasto" valor={formatBRL(e.totalGastoCentavos)} detalhe={`${e.compras} compra(s)`} />
        <Indicador rotulo="Ticket médio" valor={formatBRL(e.ticketMedioCentavos)} />
        <Indicador rotulo="Última compra" valor={formatData(e.ultimaCompra)} />
        <Indicador rotulo="Pedidos" valor={String(e.pedidos)} detalhe={e.aReceberCentavos ? `A receber ${formatBRL(e.aReceberCentavos)}` : e.creditoCentavos ? `Crédito ${formatBRL(e.creditoCentavos)}` : undefined} tom={e.aReceberCentavos ? 'atencao' : undefined} />
      </div>
      {e.creditoCentavos > 0 && <Aviso tom="info">Crédito do cliente: {formatBRL(e.creditoCentavos)} (pagou a mais em pedido).</Aviso>}

      {!c.anonimizado && (
        <Linha>
          {c.whatsapp && <BotaoWhatsApp numero={c.whatsapp}>WhatsApp</BotaoWhatsApp>}
          {podeReceberNovidades(c) ? (
            <>
              <Botao icone="estrela" onClick={() => setNovidade('promocao')}>
                Enviar novidade
              </Botao>
              <Botao icone="estrela" onClick={() => setNovidade('aniversario')}>
                Parabéns
              </Botao>
            </>
          ) : (
            <small class="muted">Promoções e aniversário só para quem aceita receber novidades.</small>
          )}
        </Linha>
      )}

      <Grade colunas={2}>
        <Cartao titulo="Pedidos" acoes={!c.anonimizado ? <Botao pequeno variante="fantasma" icone="plus" href={`/pedidos/novo?cliente=${c.id}`}>Novo</Botao> : undefined}>
          <Tabela colunas={colPedidos} linhas={pedidos} chave={(p) => p.id} onClickLinha={(p) => navegar(`/pedidos/${p.id}`)} vazio={<p class="muted">Nenhum pedido.</p>} />
        </Cartao>
        <Cartao titulo="Compras (venda rápida)">
          <Tabela colunas={colVendas} linhas={vendas} chave={(v) => v.id} onClickLinha={(v) => navegar(`/vendas/${v.id}`)} vazio={<p class="muted">Nenhuma compra direta.</p>} />
        </Cartao>
      </Grade>

      {!c.anonimizado && (
        <Cartao titulo="Dados">
          <Resumo
            linhas={[
              { rotulo: 'WhatsApp', valor: formatarTelefone(c.whatsapp) || '—' },
              c.instagram ? { rotulo: 'Instagram', valor: c.instagram } : null,
              c.endereco ? { rotulo: 'Endereço', valor: c.endereco } : null,
              c.aniversario ? { rotulo: 'Aniversário', valor: formatData(c.aniversario.length === 10 ? c.aniversario : `2000-${c.aniversario}`).slice(0, 5) } : null,
              c.comoConheceu ? { rotulo: 'Como conheceu', valor: ROTULO_COMO_CONHECEU[c.comoConheceu] } : null,
              { rotulo: 'Aceita receber novidades', valor: c.aceitaNovidades ? 'Sim' : 'Não' },
              c.observacoes ? { rotulo: 'Observações', valor: c.observacoes } : null,
            ]}
          />
          <Linha class="parc-dados-acoes">
            <Botao pequeno icone="editar" href={`/clientes/${c.id}/editar`}>
              Editar
            </Botao>
            <Botao pequeno variante="fantasma" icone={c.arquivado ? 'atualizar' : 'arquivar'} onClick={() => arquivarCliente(c.id, !c.arquivado)}>
              {c.arquivado ? 'Reativar' : 'Arquivar'}
            </Botao>
            <Botao pequeno variante="fantasma" icone="lixeira" onClick={excluir}>
              Excluir dados do cliente
            </Botao>
          </Linha>
        </Cartao>
      )}

      {novidade && (
        <Modal aberto titulo={novidade === 'promocao' ? 'Enviar novidade' : 'Mensagem de aniversário'} onFechar={() => setNovidade(null)}>
          {novidade === 'promocao' && (
            <Campo rotulo="Novidade">
              <AreaTexto value={textoPromo} onInput={setTextoPromo} placeholder="Ex.: chegaram os chaveiros de halter colorido!" />
            </Campo>
          )}
          {textoNovidade && <pre class="acerto-msg">{textoNovidade}</pre>}
          {textoNovidade && (
            <BotaoWhatsApp numero={c.whatsapp} texto={textoNovidade} primario>
              Abrir no WhatsApp
            </BotaoWhatsApp>
          )}
        </Modal>
      )}
    </Pagina>
  );
}
