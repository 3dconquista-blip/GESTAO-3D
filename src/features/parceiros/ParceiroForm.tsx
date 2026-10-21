// Cadastro e edição do parceiro (8.1), enxuto (decisão 96): nome, WhatsApp, endereço, bairro, divisão e acerto.
// Tipo, responsável, mapa, quem recebe, início, termo e observações ficam em "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { ROTULO_TIPO_PARCEIRO } from '../../data/defaults.ts';
import { useDb } from '../../data/hooks.ts';
import type { QuemRecebe, TipoParceiro } from '../../data/types.ts';
import { ROTULO_QUEM_RECEBE, formatarTelefone, rotuloDivisao } from '../../domain/termo.ts';
import { hojeISO } from '../../lib/dates.ts';
import { salvarParceiro, previaMudancaDivisao, type DadosParceiro } from '../../services/parceiros.ts';
import { AreaTexto, Aviso, Botao, Campo, Cartao, Chave, Data, Escolha, Foto, MaisDetalhes, Numero, Pagina, Segmentado, Texto, avisar, confirmar } from '../../ui/index.ts';
import { ParceiroNaoEncontrado } from './comum.tsx';

export function ParceiroForm({ params }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('parceiros', params.id) : undefined;
  const cfg = db.config.parcerias;
  const [d, setD] = useState<DadosParceiro>(() =>
    atual
      ? { ...atual, whatsapp: formatarTelefone(atual.whatsapp) }
      : { nome: '', tipo: 'academia', pctParceiro: cfg.divisoes[0] ?? 30, frequenciaDias: cfg.frequenciaPadraoDias, quemRecebe: 'parceiro', dataInicio: hojeISO(), termoAssinado: false },
  );
  const [personalizada, setPersonalizada] = useState(() => !cfg.divisoes.includes(atual?.pctParceiro ?? cfg.divisoes[0] ?? 30));
  const [outraFreq, setOutraFreq] = useState(() => !!atual && atual.frequenciaDias !== 15 && atual.frequenciaDias !== 30);
  if (params.id && !atual) return <ParceiroNaoEncontrado />;
  const mudar = (patch: Partial<DadosParceiro>) => setD({ ...d, ...patch });
  const pct = d.pctParceiro ?? 30;
  const mudouDivisao = !!atual && pct !== atual.pctParceiro;

  const salvar = async () => {
    if (mudouDivisao && atual) {
      const prev = previaMudancaDivisao(atual.id, pct);
      if (prev.bloqueio) return avisar(prev.bloqueio, 'ruim');
      if (!(await confirmar({ titulo: prev.titulo, itens: prev.itens, confirmar: 'Mudar a divisão' }))) return;
    }
    try {
      const p = salvarParceiro({ ...d, id: atual?.id });
      avisar(atual ? 'Parceiro salvo' : 'Parceiro cadastrado');
      navegar(atual ? `/parceiros/${p.id}` : `/parceiros/${p.id}/levar`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const resumoDetalhes =
    [
      ROTULO_TIPO_PARCEIRO[d.tipo ?? 'academia'],
      d.responsavel?.trim() ? `responsável ${d.responsavel.trim()}` : '',
      d.quemRecebe && d.quemRecebe !== 'parceiro' ? ROTULO_QUEM_RECEBE[d.quemRecebe].toLowerCase() : '',
      d.termoAssinado ? 'termo assinado' : '',
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo parceiro'} voltarPara={atual ? `/parceiros/${atual.id}` : '/parceiros'} largura="estreita">
      <Cartao>
        <div class="formulario">
          <Campo rotulo="Nome do estabelecimento" obrigatorio>
            <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Academia Alfa" autoFocus={!atual} />
          </Campo>
          <Campo rotulo="WhatsApp" dica="Para mandar o comprovante do acerto">
            <Texto type="tel" inputMode="tel" value={d.whatsapp} onInput={(v) => mudar({ whatsapp: v })} placeholder="(71) 99999-8888" />
          </Campo>
          <div class="campos-2">
            <Campo rotulo="Endereço">
              <Texto value={d.endereco} onInput={(v) => mudar({ endereco: v })} />
            </Campo>
            <Campo rotulo="Bairro">
              <Texto value={d.bairro} onInput={(v) => mudar({ bairro: v })} />
            </Campo>
          </div>
          <Campo rotulo="Divisão do que vender">
            <Segmentado
              value={personalizada ? -1 : pct}
              onChange={(v) => {
                setPersonalizada(v === -1);
                if (v !== -1) mudar({ pctParceiro: v });
              }}
              opcoes={[...cfg.divisoes.map((x) => ({ valor: x, rotulo: rotuloDivisao(x) })), { valor: -1, rotulo: 'Outra' }]}
            />
          </Campo>
          {personalizada && (
            <Campo rotulo="Parte do parceiro" dica={rotuloDivisao(pct)}>
              <Numero value={pct} onChange={(v) => mudar({ pctParceiro: v ?? 0 })} min={1} max={99} sufixo="%" />
            </Campo>
          )}
          {mudouDivisao && (
            <Aviso tom="atencao">A nova divisão vale a partir do próximo acerto. O acerto em andamento usa a divisão de quando o ciclo começou. Lembre de reimprimir o termo.</Aviso>
          )}
          <Campo rotulo="Acerto">
            <Segmentado
              value={outraFreq ? 0 : (d.frequenciaDias as number)}
              onChange={(v) => {
                setOutraFreq(v === 0);
                if (v) mudar({ frequenciaDias: v });
              }}
              opcoes={[
                { valor: 15, rotulo: 'A cada 15 dias' },
                { valor: 30, rotulo: 'A cada 30 dias' },
                { valor: 0, rotulo: 'Outra' },
              ]}
            />
          </Campo>
          {outraFreq && (
            <Campo rotulo="A cada">
              <Numero value={d.frequenciaDias} onChange={(v) => mudar({ frequenciaDias: v ?? 15 })} decimais={0} min={1} sufixo="dias" stepper />
            </Campo>
          )}
        </div>
      </Cartao>

      <MaisDetalhes titulo="Mais dados e termo" resumo={resumoDetalhes}>
        <div class="campos-2">
          <Campo rotulo="Tipo">
            <Escolha value={d.tipo} onChange={(v) => mudar({ tipo: v as TipoParceiro })} opcoes={Object.entries(ROTULO_TIPO_PARCEIRO).map(([v, r]) => ({ valor: v, rotulo: r }))} />
          </Campo>
          <Campo rotulo="Responsável">
            <Texto value={d.responsavel} onInput={(v) => mudar({ responsavel: v })} placeholder="Quem cuida do expositor" />
          </Campo>
        </div>
        <Campo rotulo="Link do mapa" dica="Sem link, o botão do mapa busca pelo endereço">
          <Texto type="url" inputMode="url" value={d.linkMapa} onInput={(v) => mudar({ linkMapa: v })} placeholder="https://maps.app.goo.gl/..." />
        </Campo>
        <Campo rotulo="Quem recebe dos clientes">
          <Segmentado
            value={d.quemRecebe ?? 'parceiro'}
            onChange={(v) => mudar({ quemRecebe: v as QuemRecebe })}
            opcoes={(Object.keys(ROTULO_QUEM_RECEBE) as QuemRecebe[]).map((k) => ({ valor: k, rotulo: ROTULO_QUEM_RECEBE[k] }))}
          />
        </Campo>
        <Campo rotulo="Data de início">
          <Data value={d.dataInicio} onInput={(v) => mudar({ dataInicio: v })} />
        </Campo>
        <Chave checked={!!d.termoAssinado} onChange={(v) => mudar({ termoAssinado: v, termoData: v ? (d.termoData ?? hojeISO()) : d.termoData })}>
          Termo de consignação assinado
        </Chave>
        {d.termoAssinado && (
          <div class="campos-2">
            <Campo rotulo="Data da assinatura">
              <Data value={d.termoData} onInput={(v) => mudar({ termoData: v })} />
            </Campo>
            <Campo rotulo="Foto do termo">
              <Foto value={d.termoFotoDataUrl} onChange={(v) => mudar({ termoFotoDataUrl: v })} />
            </Campo>
          </div>
        )}
        <Campo rotulo="Nº da nota de remessa">
          <Texto value={d.notaRemessa} onInput={(v) => mudar({ notaRemessa: v })} />
        </Campo>
        <Campo rotulo="Observações">
          <AreaTexto value={d.observacoes} onInput={(v) => mudar({ observacoes: v })} />
        </Campo>
      </MaisDetalhes>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          {atual ? 'Salvar' : 'Cadastrar e levar peças'}
        </Botao>
      </div>
    </Pagina>
  );
}
