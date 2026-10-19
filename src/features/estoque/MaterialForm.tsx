// Cadastro e edição de material: filamento (custo por kg, gramas) ou outro insumo (custo por unidade).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import type { Material, TipoFilamento } from '../../data/types.ts';
import { salvarMaterial, type DadosMaterial } from '../../services/materiais.ts';
import { Botao, Campo, Cartao, Escolha, Numero, Pagina, Segmentado, Texto, Vazio, avisar } from '../../ui/index.ts';
import { AmostraCor } from './EstoqueAbas.tsx';

const TIPOS: TipoFilamento[] = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro'];

export function MaterialForm({ params, query }: TelaProps) {
  useDb();
  const atual = params.id ? db.get('materiais', params.id) : undefined;
  const [d, setD] = useState<DadosMaterial>(() =>
    atual
      ? { ...atual }
      : (query.get('tipo') as Material['tipo']) === 'insumo'
        ? { tipo: 'insumo', nome: '', unidade: 'un', custoMedio: 0, minimo: 0, saldoInicial: 0 }
        : { tipo: 'filamento', material: 'PLA', corNome: '', corHex: '#1F1F1F', custoMedio: 100, minimo: db.config.estoque.minimoFilamentoPadraoG, saldoInicial: 0 },
  );
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
    <Pagina titulo={atual ? `Editar ${atual.nome}` : 'Novo material'} voltarPara={atual ? `/estoque/materiais/${atual.id}` : '/estoque/materiais'} largura="estreita">
      <Cartao>
        <div class="formulario">
          {!atual && (
            <Segmentado
              bloco
              value={d.tipo}
              onChange={(tipo) =>
                setD(
                  tipo === 'insumo'
                    ? { tipo: 'insumo', nome: '', unidade: 'un', custoMedio: 0, minimo: 0, saldoInicial: 0 }
                    : { tipo: 'filamento', material: 'PLA', corNome: '', corHex: '#1F1F1F', custoMedio: 100, minimo: db.config.estoque.minimoFilamentoPadraoG, saldoInicial: 0 },
                )
              }
              opcoes={[
                { valor: 'filamento', rotulo: 'Filamento' },
                { valor: 'insumo', rotulo: 'Outro insumo' },
              ]}
            />
          )}

          {fil ? (
            <>
              <div class="campos-2">
                <Campo rotulo="Material">
                  <Escolha value={d.material} onChange={(v) => mudar({ material: v })} opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))} />
                </Campo>
                <Campo rotulo="Cor">
                  <div class="cfg-cor">
                    <input type="color" value={d.corHex || '#1F1F1F'} onInput={(e) => mudar({ corHex: e.currentTarget.value })} aria-label="Amostra da cor" style={{ width: '48px', minWidth: '48px', height: '44px', borderRadius: '10px', border: '1px solid var(--borda-forte)', padding: '3px' }} />
                    <Texto value={d.corNome} onInput={(v) => mudar({ corNome: v })} placeholder="Ex.: Preto" />
                  </div>
                </Campo>
                <Campo rotulo="Nome" dica={nomeSugerido ? `Vazio = "${nomeSugerido}"` : undefined}>
                  <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder={nomeSugerido || 'Ex.: PLA Preto'} />
                </Campo>
                <Campo rotulo="Marca">
                  <Texto value={d.marca} onInput={(v) => mudar({ marca: v })} placeholder="Ex.: Bambu Lab" />
                </Campo>
                <Campo rotulo="Custo médio do kg" dica="A compra de material recalcula sozinho">
                  <Numero value={d.custoMedio} onChange={(v) => mudar({ custoMedio: v ?? 0 })} min={0} prefixo="R$" sufixo="/kg" />
                </Campo>
                <Campo rotulo="Mínimo" dica="Abaixo disso aparece alerta">
                  <Numero value={d.minimo} onChange={(v) => mudar({ minimo: v ?? 0 })} decimais={0} min={0} sufixo="g" />
                </Campo>
                {!atual && (
                  <Campo rotulo="Quanto tem agora" dica="Vira um ajuste de saldo inicial">
                    <Numero value={d.saldoInicial} onChange={(v) => mudar({ saldoInicial: v ?? 0 })} decimais={0} min={0} sufixo="g" />
                  </Campo>
                )}
              </div>
              {d.corHex && (
                <p class="muted">
                  <AmostraCor hex={d.corHex} tamanho={16} /> Custo por grama: R$ {((d.custoMedio ?? 0) / 1000).toFixed(4).replace('.', ',')}
                </p>
              )}
            </>
          ) : (
            <div class="campos-2">
              <Campo rotulo="Nome" obrigatorio>
                <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder="Ex.: Argola, corrente, ímã, saquinho" autoFocus={!atual} />
              </Campo>
              <Campo rotulo="Unidade">
                <Texto value={d.unidade} onInput={(v) => mudar({ unidade: v })} placeholder="un" />
              </Campo>
              <Campo rotulo="Custo médio por unidade">
                <Numero value={d.custoMedio} onChange={(v) => mudar({ custoMedio: v ?? 0 })} decimais={4} min={0} prefixo="R$" />
              </Campo>
              <Campo rotulo="Mínimo">
                <Numero value={d.minimo} onChange={(v) => mudar({ minimo: v ?? 0 })} decimais={0} min={0} sufixo={d.unidade || 'un'} />
              </Campo>
              {!atual && (
                <Campo rotulo="Quanto tem agora" dica="Vira um ajuste de saldo inicial">
                  <Numero value={d.saldoInicial} onChange={(v) => mudar({ saldoInicial: v ?? 0 })} decimais={0} min={0} sufixo={d.unidade || 'un'} />
                </Campo>
              )}
            </div>
          )}
        </div>
      </Cartao>
      <div class="barra-acoes-fixa">
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </div>
    </Pagina>
  );
}
