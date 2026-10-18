// Cadastro e edição do expositor (8.2). Expositor perdido vira perda pelo custo.
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { EstadoExpositor } from '../../data/types.ts';
import { formatBRL, formatData } from '../../lib/format.ts';
import { arquivarExpositor, desarquivarExpositor, marcarEstadoExpositor, moverExpositor, proximoCodigoExpositor, salvarExpositor, type DadosExpositor } from '../../services/expositores.ts';
import { Aviso, Botao, Campo, Cartao, Dinheiro, Escolha, Foto, Numero, Pagina, Segmentado, Texto, Vazio, avisar, confirmar } from '../../ui/index.ts';

export function ExpositorForm({ params }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('expositores', params.id) : undefined;
  const [d, setD] = useState<DadosExpositor>(() => (atual ? { ...atual } : { codigo: proximoCodigoExpositor(), modelo: '', capacidade: 20, custoCentavos: 0 }));
  if (params.id && !atual) {
    return (
      <div class="pagina">
        <Vazio titulo="Expositor não encontrado" acao={{ rotulo: 'Ver expositores', href: '/parceiros/expositores' }} />
      </div>
    );
  }
  const mudar = (patch: Partial<DadosExpositor>) => setD({ ...d, ...patch });
  const parceiros = db.all('parceiros').filter((p) => !p.arquivado && p.situacao !== 'encerrado');

  const executar = (fn: () => void, msg: string) => {
    try {
      fn();
      avisar(msg);
      return true;
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
      return false;
    }
  };

  const salvar = () => {
    if (executar(() => salvarExpositor({ codigo: d.codigo, modelo: d.modelo, capacidade: d.capacidade, custoCentavos: d.custoCentavos, fotoDataUrl: d.fotoDataUrl, id: atual?.id }), atual ? 'Expositor salvo' : 'Expositor cadastrado')) {
      navegar('/parceiros/expositores');
    }
  };

  const mover = async (destino: string) => {
    if (!atual) return;
    const nome = destino ? db.get('parceiros', destino)?.nome : 'Casa';
    if (!(await confirmar({ titulo: `Mover ${atual.codigo} para ${nome}?`, itens: ['Só muda onde o expositor está. As peças não mudam (use instalação, reposição ou recolher).'] }))) return;
    executar(() => moverExpositor(atual.id, destino || null), 'Expositor movido');
  };

  const estado = async (novo: EstadoExpositor) => {
    if (!atual || novo === atual.estado) return;
    if (novo === 'perdido') {
      const ok = await confirmar({
        titulo: `Marcar ${atual.codigo} como perdido?`,
        itens: [`Vira perda de ${formatBRL(atual.custoCentavos)} (o custo do expositor) nos relatórios.`, 'Sai do parceiro e não pode mais ser instalado.'],
        confirmar: 'Marcar perdido',
        perigo: true,
      });
      if (!ok) return;
    }
    executar(() => marcarEstadoExpositor(atual.id, novo), 'Estado atualizado');
  };

  return (
    <Pagina titulo={atual ? atual.codigo : 'Novo expositor'} voltarPara="/parceiros/expositores" largura="estreita">
      <Cartao>
        <div class="formulario">
          <div class="campos-2">
            <Campo rotulo="Código">
              <Texto value={d.codigo} onInput={(v) => mudar({ codigo: v })} />
            </Campo>
            <Campo rotulo="Modelo">
              <Texto value={d.modelo} onInput={(v) => mudar({ modelo: v })} placeholder="Ex.: painel de ganchos" />
            </Campo>
            <Campo rotulo="Capacidade (ganchos ou vagas)">
              <Numero value={d.capacidade} onChange={(v) => mudar({ capacidade: v ?? 0 })} decimais={0} min={0} stepper />
            </Campo>
            <Campo rotulo="Custo">
              <Dinheiro value={d.custoCentavos} onChange={(v) => mudar({ custoCentavos: v ?? 0 })} />
            </Campo>
          </div>
          <Campo rotulo="Foto (opcional)">
            <Foto value={d.fotoDataUrl} onChange={(v) => mudar({ fotoDataUrl: v })} />
          </Campo>
        </div>
      </Cartao>

      {atual && (
        <Cartao titulo="Onde está e estado">
          <div class="formulario">
            {atual.estado === 'perdido' ? (
              <Aviso tom="ruim">Perdido em {formatData(atual.perdidoEm)} — perda de {formatBRL(atual.custoCentavos)}.</Aviso>
            ) : (
              <Campo rotulo="Onde está" dica={atual.dataInstalacao && atual.parceiroId ? `Instalado em ${formatData(atual.dataInstalacao)}` : undefined}>
                <Escolha value={atual.parceiroId ?? ''} onChange={mover} opcoes={[{ valor: '', rotulo: 'Casa' }, ...parceiros.map((p) => ({ valor: p.id, rotulo: p.nome }))]} />
              </Campo>
            )}
            <Campo rotulo="Estado">
              <Segmentado
                value={atual.estado}
                onChange={estado}
                opcoes={[
                  { valor: 'ok', rotulo: 'Ok' },
                  { valor: 'danificado', rotulo: 'Danificado' },
                  { valor: 'perdido', rotulo: 'Perdido' },
                ]}
              />
            </Campo>
            <div>
              <Botao variante="fantasma" icone={atual.arquivado ? 'atualizar' : 'arquivar'} onClick={() => executar(() => (atual.arquivado ? desarquivarExpositor(atual.id) : arquivarExpositor(atual.id)), atual.arquivado ? 'Expositor reativado' : 'Expositor arquivado')}>
                {atual.arquivado ? 'Reativar' : 'Arquivar'}
              </Botao>
            </div>
          </div>
        </Cartao>
      )}

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Pagina>
  );
}
