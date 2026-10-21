// Cadastro e edição de material, enxuto (decisão 86). Filamento: tipo, cor, custo do kg e quanto tem (o nome
// "PLA Azul" e a amostra saem da cor). Insumo: nome, custo por unidade e quanto tem. Nome próprio, amostra, marca,
// mínimo e unidade ficam em "Mais detalhes".
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Material } from '../../data/types.ts';
import { hexDaCor, TIPOS_FILAMENTO } from '../../domain/filamento.ts';
import { salvarMaterial, type DadosMaterial } from '../../services/materiais.ts';
import { Botao, Campo, Cartao, MaisDetalhes, Numero, Pagina, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { AmostraCor } from './EstoqueAbas.tsx';

function novoFilamento(): DadosMaterial {
  return { tipo: 'filamento', material: 'PLA', corNome: '', custoMedio: 100, minimo: db.config.estoque.minimoFilamentoPadraoG, saldoInicial: 1000 };
}

function novoInsumo(): DadosMaterial {
  return { tipo: 'insumo', nome: '', unidade: 'un', custoMedio: 0, minimo: 0, saldoInicial: 0 };
}

export function MaterialForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('materiais', params.id) : undefined;
  const [d, setD] = useState<DadosMaterial>(() => (atual ? { ...atual } : (query.get('tipo') as Material['tipo']) === 'insumo' ? novoInsumo() : novoFilamento()));
  if (params.id && !atual) {
    return (
      <Pagina titulo="Material" voltarPara="/estoque/materiais">
        <Vazio titulo="Material não encontrado" />
      </Pagina>
    );
  }
  const mudar = (patch: Partial<DadosMaterial>) => setD({ ...d, ...patch });
  const fil = d.tipo === 'filamento';
  const nomeSugerido = fil ? [d.material, d.corNome?.trim()].filter(Boolean).join(' ') : '';
  const amostra = d.corHex || hexDaCor(d.corNome);

  const salvar = () => {
    try {
      const m = salvarMaterial({ ...d, id: atual?.id, nome: d.nome?.trim() || (fil ? nomeSugerido : '') });
      avisar(atual ? 'Material salvo' : 'Material cadastrado');
      navegar(`/estoque/materiais/${m.id}`, { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo={atual ? `Editar ${atual.nome}` : fil ? 'Novo filamento' : 'Novo insumo'} voltarPara={atual ? `/estoque/materiais/${atual.id}` : '/estoque/materiais'} largura="estreita">
      <Cartao>
        <div class="formulario">
          {!atual && (
            <Segmentado
              bloco
              value={d.tipo}
              onChange={(tipo) => setD(tipo === 'insumo' ? novoInsumo() : novoFilamento())}
              opcoes={[
                { valor: 'filamento', rotulo: 'Filamento' },
                { valor: 'insumo', rotulo: 'Outro insumo' },
              ]}
            />
          )}

          {fil ? (
            <>
              <Campo rotulo="Tipo">
                <Segmentado value={d.material ?? 'PLA'} onChange={(v) => mudar({ material: v })} opcoes={TIPOS_FILAMENTO.map((t) => ({ valor: t, rotulo: t }))} />
              </Campo>
              <Campo rotulo="Cor" obrigatorio>
                <div class="cfg-cor">
                  <AmostraCor hex={amostra} tamanho={28} />
                  <Texto value={d.corNome} onInput={(v) => mudar({ corNome: v })} placeholder="Ex.: Azul" autoFocus={!atual} />
                </div>
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Custo do kg" dica={atual ? 'A compra de material recalcula sozinho' : 'Quanto pagou no carretel de 1 kg'}>
                  <Numero value={d.custoMedio} onChange={(v) => mudar({ custoMedio: v ?? 0 })} min={0} prefixo="R$" sufixo="/kg" />
                </Campo>
                {!atual && (
                  <Campo rotulo="Quanto tem agora" dica="Carretel novo = 1.000 g">
                    <Numero value={d.saldoInicial} onChange={(v) => mudar({ saldoInicial: v ?? 0 })} decimais={0} min={0} sufixo="g" />
                  </Campo>
                )}
              </div>
            </>
          ) : (
            <>
              <Campo rotulo="Nome" obrigatorio>
                <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Argola, corrente, ímã, saquinho" autoFocus={!atual} />
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Custo por unidade">
                  <Numero value={d.custoMedio} onChange={(v) => mudar({ custoMedio: v ?? 0 })} decimais={4} min={0} prefixo="R$" />
                </Campo>
                {!atual && (
                  <Campo rotulo="Quanto tem agora">
                    <Numero value={d.saldoInicial} onChange={(v) => mudar({ saldoInicial: v ?? 0 })} decimais={0} min={0} sufixo={d.unidade || 'un'} />
                  </Campo>
                )}
              </div>
            </>
          )}
        </div>
      </Cartao>

      <MaisDetalhes>
        <div class="campos-2">
          {fil ? (
            <>
              <Campo rotulo="Nome" dica={nomeSugerido ? `Vazio = "${nomeSugerido}"` : undefined}>
                <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder={nomeSugerido || 'Ex.: PLA Azul'} />
              </Campo>
              <Campo rotulo="Amostra da cor" dica="Escolhida pelo nome da cor; mude se quiser">
                <input
                  type="color"
                  value={amostra || '#1F1F1F'}
                  onInput={(e) => mudar({ corHex: e.currentTarget.value })}
                  aria-label="Amostra da cor"
                  style={{ width: '64px', height: '44px', borderRadius: '10px', border: '1px solid var(--borda-forte)', padding: '3px' }}
                />
              </Campo>
              <Campo rotulo="Marca">
                <Texto value={d.marca} onInput={(v) => mudar({ marca: v })} placeholder="Ex.: Bambu Lab" />
              </Campo>
            </>
          ) : (
            <Campo rotulo="Unidade">
              <Texto value={d.unidade} onInput={(v) => mudar({ unidade: v })} placeholder="un" />
            </Campo>
          )}
          <Campo rotulo="Mínimo (alerta)" dica="Abaixo disso aparece alerta">
            <Numero value={d.minimo} onChange={(v) => mudar({ minimo: v ?? 0 })} decimais={0} min={0} sufixo={fil ? 'g' : d.unidade || 'un'} />
          </Campo>
        </div>
      </MaisDetalhes>

      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Pagina>
  );
}
