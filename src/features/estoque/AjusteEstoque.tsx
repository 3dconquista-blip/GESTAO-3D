// "Ajuste de inventário" (entra ou sai, motivo obrigatório) e "Perda" (avaria, defeito, brinde, uso próprio...).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_MOTIVO_PERDA } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import { custoProduto, produtosAtivos, saldoEm } from '../../data/selectors.ts';
import type { MotivoPerda } from '../../data/types.ts';
import { CASA, localParceiro } from '../../data/types.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatData, formatQtd, formatReais } from '../../lib/format.ts';
import { ajusteInventario, registrarPerda } from '../../services/ajustes.ts';
import { Botao, Campo, Cartao, Data, Escolha, Numero, Pagina, Resumo, Segmentado, Texto, confirmar } from '../../ui/index.ts';
import { executar } from './comum.tsx';
import { nomeLocal } from './ProdutoDetalhe.tsx';

const MOTIVOS_MANUAIS: MotivoPerda[] = ['avaria', 'defeito', 'brinde', 'uso_proprio', 'falta_abonada', 'outro'];

export function AjusteEstoque({ query }: TelaProps) {
  useDb();
  const produtos = produtosAtivos();
  const [modo, setModo] = useState<'ajuste' | 'perda'>(query.get('modo') === 'perda' ? 'perda' : 'ajuste');
  const [produtoId, setProdutoId] = useState<string | null>(query.get('produto') ?? produtos[0]?.id ?? null);
  const [local, setLocal] = useState(query.get('local') ?? CASA);
  const [sentido, setSentido] = useState<'entra' | 'sai'>('sai');
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [motivoPerda, setMotivoPerda] = useState<MotivoPerda>('avaria');
  const [data, setData] = useState(hojeISO());

  const parceiros = db.all('parceiros').filter((p) => !p.arquivado && p.situacao !== 'encerrado');
  const saldo = produtoId ? saldoEm(produtoId, local) : 0;
  const sai = modo === 'perda' || sentido === 'sai';
  const depois = quantidade ? saldo + (sai ? -quantidade : quantidade) : saldo;
  const custo = produtoId ? custoProduto(produtoId) : 0;
  const nome = produtos.find((p) => p.id === produtoId)?.nome ?? '';
  const pode = !!produtoId && !!quantidade && quantidade > 0 && (modo === 'perda' ? motivoPerda !== 'outro' || !!motivo.trim() : !!motivo.trim());

  const salvar = async () => {
    if (!produtoId || !quantidade) return;
    const ok = await confirmar({
      titulo: modo === 'perda' ? 'Registrar a perda?' : 'Registrar o ajuste?',
      itens: [
        `${nome} — ${nomeLocal(local)}: ${formatQtd(saldo)} → ${formatQtd(depois)}`,
        modo === 'perda' ? `Motivo: ${ROTULO_MOTIVO_PERDA[motivoPerda]}${motivo.trim() ? ` — ${motivo.trim()}` : ''}` : `Motivo: ${motivo.trim()}`,
        modo === 'perda' ? `Perda pelo custo: ${formatReais(custo * quantidade)}` : '',
        `Data: ${formatData(data)}`,
      ].filter(Boolean),
    });
    if (!ok) return;
    const feito = executar(
      () =>
        modo === 'perda'
          ? registrarPerda({ produtoId, local, quantidade, motivo: motivoPerda, observacao: motivo, data })
          : ajusteInventario({ produtoId, local, quantidade: sai ? -quantidade : quantidade, motivo, data }),
      modo === 'perda' ? 'Perda registrada' : 'Ajuste registrado',
    );
    if (feito) navegar('/estoque/movimentacoes');
  };

  return (
    <Pagina titulo="Ajuste de estoque" subtitulo="O saldo é sempre a soma das movimentações: corrija lançando um ajuste." voltarPara="/estoque/movimentacoes" largura="estreita">
      <Cartao>
        <div class="formulario">
          <Segmentado
            bloco
            value={modo}
            onChange={setModo}
            opcoes={[
              { valor: 'ajuste', rotulo: 'Ajuste de inventário' },
              { valor: 'perda', rotulo: 'Perda' },
            ]}
          />
          <div class="campos-2">
            <Campo rotulo="Produto">
              <Escolha value={produtoId} onChange={setProdutoId} opcoes={produtos.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
            </Campo>
            <Campo rotulo="Local">
              <Escolha value={local} onChange={setLocal} opcoes={[{ valor: CASA, rotulo: 'Casa' }, ...parceiros.map((p) => ({ valor: localParceiro(p.id), rotulo: p.nome }))]} />
            </Campo>
          </div>
          {modo === 'ajuste' && (
            <Segmentado
              bloco
              value={sentido}
              onChange={setSentido}
              opcoes={[
                { valor: 'sai', rotulo: 'Tirar do saldo' },
                { valor: 'entra', rotulo: 'Somar ao saldo' },
              ]}
            />
          )}
          <Campo rotulo="Quantidade">
            <Numero value={quantidade} onChange={setQuantidade} decimais={0} min={0} stepper />
          </Campo>
          {modo === 'perda' && (
            <Campo rotulo="Motivo da perda">
              <Escolha value={motivoPerda} onChange={setMotivoPerda} opcoes={MOTIVOS_MANUAIS.map((m) => ({ valor: m, rotulo: ROTULO_MOTIVO_PERDA[m] }))} />
            </Campo>
          )}
          <Campo rotulo={modo === 'perda' ? 'Observação' : 'Motivo'} obrigatorio={modo === 'ajuste' || motivoPerda === 'outro'}>
            <Texto value={motivo} onInput={setMotivo} placeholder={modo === 'perda' ? 'Ex.: caiu e quebrou' : 'Ex.: contagem do inventário'} />
          </Campo>
          <Campo rotulo="Data">
            <Data value={data} onInput={setData} max={hojeISO()} />
          </Campo>
        </div>
      </Cartao>
      <Cartao titulo="O que vai acontecer">
        <Resumo
          linhas={[
            { rotulo: `Saldo em ${nomeLocal(local)}`, valor: `${formatQtd(saldo)} → ${formatQtd(depois)}`, destaque: true, tom: depois < 0 ? 'ruim' : undefined },
            modo === 'perda' && quantidade ? { rotulo: 'Perda pelo custo', valor: formatReais(custo * quantidade) } : null,
          ]}
        />
      </Cartao>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" disabled={!pode} onClick={salvar}>
          {modo === 'perda' ? 'Registrar perda' : 'Registrar ajuste'}
        </Botao>
      </div>
    </Pagina>
  );
}
