// Configurações > Mensagens: modelos do WhatsApp com variáveis entre chaves.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { MENSAGENS_PADRAO } from '../../data/defaults.ts';
import type { ChaveMensagem } from '../../data/types.ts';
import { atualizarMensagem, restaurarMensagem } from '../../services/config.ts';
import { AreaTexto, Botao, Cartao, Linha, Pagina } from '../../ui/index.ts';
import { tentar } from './comum.tsx';

const MODELOS: { chave: ChaveMensagem; titulo: string; quando: string }[] = [
  { chave: 'orcamento', titulo: 'Orçamento', quando: 'Ao enviar o orçamento de um pedido' },
  { chave: 'sinal_recebido', titulo: 'Sinal recebido', quando: 'Quando o cliente paga o sinal' },
  { chave: 'pedido_pronto', titulo: 'Pedido pronto', quando: 'Quando o pedido fica pronto' },
  { chave: 'lembrete_saldo', titulo: 'Lembrete de saldo', quando: 'Para cobrar o que falta pagar' },
  { chave: 'pos_venda', titulo: 'Pós-venda', quando: 'Depois da entrega' },
  { chave: 'comprovante_acerto', titulo: 'Comprovante de acerto', quando: 'Ao concluir o acerto com um parceiro' },
  { chave: 'promocao', titulo: 'Promoção', quando: 'Só para clientes que aceitam receber novidades' },
  { chave: 'aniversario', titulo: 'Aniversário', quando: 'Só para clientes que aceitam receber novidades' },
];

function variaveis(texto: string): string[] {
  return Array.from(new Set(Array.from(texto.matchAll(/\{([a-z0-9_]+)\}/gi)).map((m) => m[1])));
}

export function ConfigMensagens() {
  const [textos, setTextos] = useState<Record<ChaveMensagem, string>>(() => ({ ...db.config.mensagens }));
  return (
    <Pagina titulo="Mensagens" subtitulo="Palavras entre chaves, como {cliente}, são trocadas pelos dados na hora de enviar." voltarPara="/config" largura="estreita">
      {MODELOS.map((m) => {
        const mudou = textos[m.chave] !== db.config.mensagens[m.chave];
        return (
          <Cartao key={m.chave} titulo={m.titulo}>
            <div class="pilha pilha-m">
              <small class="muted">{m.quando}</small>
              <AreaTexto value={textos[m.chave]} onInput={(v) => setTextos({ ...textos, [m.chave]: v })} linhas={Math.min(12, textos[m.chave].split('\n').length + 1)} />
              <small class="muted">Variáveis do modelo padrão: {variaveis(MENSAGENS_PADRAO[m.chave]).map((v) => `{${v}}`).join(' ')}</small>
              <Linha>
                <Botao variante="primario" pequeno icone="check" disabled={!mudou} onClick={() => tentar(() => atualizarMensagem(m.chave, textos[m.chave]), 'Mensagem salva')}>
                  Salvar
                </Botao>
                <Botao
                  variante="fantasma"
                  pequeno
                  icone="atualizar"
                  disabled={db.config.mensagens[m.chave] === MENSAGENS_PADRAO[m.chave]}
                  onClick={() => tentar(() => setTextos({ ...textos, [m.chave]: restaurarMensagem(m.chave) }), 'Modelo padrão restaurado')}
                >
                  Restaurar padrão
                </Botao>
              </Linha>
            </div>
          </Cartao>
        );
      })}
    </Pagina>
  );
}
