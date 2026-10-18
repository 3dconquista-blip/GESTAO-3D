// Configurações > Canais de venda: comissão sobre o preço de etiqueta (6.1).
import { useState } from 'preact/hooks';
import { db } from '../../data/db.ts';
import type { Canal } from '../../data/types.ts';
import { formatPct } from '../../lib/format.ts';
import { adicionarCanal, atualizarCanais, canalPersonalizado, removerCanal } from '../../services/config.ts';
import { Botao, Campo, Cartao, Chave, Dinheiro, Numero, Pagina, Texto, confirmar } from '../../ui/index.ts';
import { BarraSalvar, mostrarAvisos, tentar } from './comum.tsx';

export function ConfigCanais() {
  const [canais, setCanais] = useState<Canal[]>(() => db.config.canais.map((c) => ({ ...c })));
  const [novo, setNovo] = useState('');
  const mudar = (id: string, patch: Partial<Canal>) => setCanais(canais.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const salvar = () => tentar(() => mostrarAvisos(atualizarCanais(canais).avisos));

  const adicionar = () => {
    if (!novo.trim()) return;
    tentar(() => {
      const r = adicionarCanal({ nome: novo, tipo: 'marketplace', comissaoPct: 0 });
      setCanais(db.config.canais.map((c) => ({ ...c })));
      setNovo('');
      mostrarAvisos(r.avisos);
    }, 'Canal adicionado');
  };

  const remover = async (c: Canal) => {
    if (!(await confirmar({ titulo: `Remover o canal "${c.nome}"?`, confirmar: 'Remover', perigo: true }))) return;
    tentar(() => {
      removerCanal(c.id);
      setCanais(db.config.canais.map((x) => ({ ...x })));
    }, 'Canal removido');
  };

  return (
    <Pagina titulo="Canais de venda" subtitulo="Comissão sobre o preço de etiqueta. Canais ativos aparecem no simulador." voltarPara="/config" largura="estreita">
      {canais.map((c) => (
        <Cartao key={c.id} titulo={c.nome} acoes={<Chave checked={c.ativo} onChange={(v) => mudar(c.id, { ativo: v })}>{c.ativo ? 'Ativo' : 'Desligado'}</Chave>}>
          <div class="campos-3">
            <Campo rotulo="Nome">
              <Texto value={c.nome} onInput={(v) => mudar(c.id, { nome: v })} />
            </Campo>
            {c.tipo === 'cartao' ? (
              <Campo rotulo="Comissão" dica="Segue a taxa do cartão (Custos e preços)">
                <div class="cfg-fixo">{formatPct(db.config.custos.taxaCartaoPct)}</div>
              </Campo>
            ) : (
              <Campo rotulo="Comissão">
                <Numero value={c.comissaoPct} onChange={(v) => mudar(c.id, { comissaoPct: v ?? 0 })} min={0} max={99.99} sufixo="%" />
              </Campo>
            )}
            {(c.tipo === 'marketplace' || c.tipo === 'outro') && (
              <Campo rotulo="Tarifa fixa por item">
                <Dinheiro value={c.tarifaFixaCentavos} onChange={(v) => mudar(c.id, { tarifaFixaCentavos: v ?? 0 })} />
              </Campo>
            )}
          </div>
          {c.tipo === 'marketplace' && <p class="muted cfg-nota">As regras dos marketplaces mudam com frequência: confira a comissão e a tarifa antes de ligar.</p>}
          {canalPersonalizado(c) && (
            <Botao pequeno variante="fantasma" icone="lixeira" onClick={() => remover(c)}>
              Remover canal
            </Botao>
          )}
        </Cartao>
      ))}
      <Cartao titulo="Novo canal">
        <div class="linha">
          <Texto value={novo} onInput={setNovo} placeholder="Ex.: Shopee" />
          <Botao icone="plus" onClick={adicionar} disabled={!novo.trim()}>
            Adicionar
          </Botao>
        </div>
      </Cartao>
      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}
