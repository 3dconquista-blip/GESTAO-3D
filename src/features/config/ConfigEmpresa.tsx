// Configurações > Empresa: nome, logo, cor, WhatsApp, chave PIX, recebedor, cidade e política de cancelamento.
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import { atualizarEmpresa } from '../../services/config.ts';
import { AreaTexto, Botao, Campo, Cartao, Foto, Pagina, Texto } from '../../ui/index.ts';
import { BarraSalvar, tentar } from './comum.tsx';

export function ConfigEmpresa() {
  const [e, setE] = useState(() => ({ ...db.config.empresa }));
  const mudar = (patch: Partial<typeof e>) => setE({ ...e, ...patch });
  return (
    <Pagina titulo="Empresa" voltarPara="/config" largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Nome da empresa" obrigatorio>
            <Texto value={e.nome} onInput={(v) => mudar({ nome: v })} />
          </Campo>
          <Campo rotulo="Logo">
            <Foto value={e.logoDataUrl} onChange={(v) => mudar({ logoDataUrl: v })} rotulo="Enviar logo" />
          </Campo>
          <Campo rotulo="Cor principal">
            <div class="cfg-cor">
              <input type="color" value={e.corPrincipal} onInput={(ev) => mudar({ corPrincipal: ev.currentTarget.value })} aria-label="Cor principal" />
              <Texto value={e.corPrincipal} onInput={(v) => mudar({ corPrincipal: v })} />
            </div>
          </Campo>
          <Campo rotulo="WhatsApp da empresa">
            <Texto type="tel" inputMode="tel" value={e.whatsapp} onInput={(v) => mudar({ whatsapp: v })} placeholder="(71) 99999-8888" />
          </Campo>
          <div class="campos-2">
            <Campo rotulo="Chave PIX" dica="Usada nas mensagens de cobrança e no comprovante">
              <Texto value={e.chavePix} onInput={(v) => mudar({ chavePix: v })} />
            </Campo>
            <Campo rotulo="Nome do recebedor do PIX">
              <Texto value={e.nomePix} onInput={(v) => mudar({ nomePix: v })} />
            </Campo>
          </div>
          <Campo rotulo="Cidade" dica="Usada no termo de consignação">
            <Texto value={e.cidade} onInput={(v) => mudar({ cidade: v })} />
          </Campo>
          <Campo rotulo="Política de cancelamento de pedidos" dica="Vai no texto do orçamento">
            <AreaTexto value={e.politicaCancelamento} onInput={(v) => mudar({ politicaCancelamento: v })} linhas={4} />
          </Campo>
        </div>
      </Cartao>
      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={() => tentar(() => atualizarEmpresa(e))}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}
