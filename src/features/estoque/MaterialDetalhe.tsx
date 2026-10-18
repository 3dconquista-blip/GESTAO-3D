// Detalhe do material: saldo, custo, produtos que usam e histórico de movimentos.
import { useState } from 'preact/hooks';
import type { TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { saldoMaterial } from '../../data/selectors.ts';
import type { MovMaterial } from '../../data/types.ts';
import { formatBRL, formatData, formatGramas, formatQtd } from '../../lib/format.ts';
import { arquivarMaterial, bloqueioEstornoMaterial, estornarMovMaterial } from '../../services/materiais.ts';
import { Botao, Cartao, Grade, Indicador, ItemLista, Linha, Lista, Pagina, Resumo, Selo, Tabela, Vazio, avisar, confirmar, type Coluna } from '../../ui/index.ts';
import { ModalAjusteMaterial, ModalPesagem } from './AcoesMaterial.tsx';
import { ModalMotivo, executar } from './comum.tsx';
import { AmostraCor } from './EstoqueAbas.tsx';
import { SeloMaterial, textoCusto, textoSaldo } from './MateriaisLista.tsx';

const ROTULO_MOV: Record<string, string> = {
  compra: 'Compra',
  producao: 'Consumo em produção',
  pedido: 'Consumo em pedido',
  ajuste: 'Ajuste',
  perda: 'Perda',
  estorno: 'Estorno',
};

export function MaterialDetalhe({ params }: TelaProps) {
  useDb();
  const [modal, setModal] = useState<'pesagem' | 'ajuste' | 'perda' | null>(null);
  const [estornando, setEstornando] = useState<MovMaterial | null>(null);
  const m = db.get('materiais', params.id);
  if (!m) {
    return (
      <Pagina titulo="Material" voltarPara="/estoque/materiais">
        <Vazio titulo="Material não encontrado" acao={{ rotulo: 'Voltar aos materiais', href: '/estoque/materiais' }} />
      </Pagina>
    );
  }
  const saldo = saldoMaterial(m.id);
  const movs = db
    .all('movMateriais')
    .filter((x) => x.materialId === m.id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const usadoEm = db
    .all('produtos')
    .filter((p) => !p.arquivado && (p.mesas.some((me) => me.filamentos.some((f) => f.materialId === m.id)) || p.componentes.some((c) => c.materialId === m.id)));
  const qtd = (q: number) => (m.tipo === 'filamento' ? formatGramas(q) : `${formatQtd(q)} ${m.unidade}`);

  const colunas: Coluna<MovMaterial>[] = [
    { id: 'data', rotulo: 'Data', render: (x) => formatData(x.data), principal: true },
    { id: 'tipo', rotulo: 'Tipo', render: (x) => ROTULO_MOV[x.tipo] ?? x.tipo },
    { id: 'qtd', rotulo: 'Quantidade', alinhar: 'dir', render: (x) => <span class={x.quantidade < 0 ? 'txt-ruim' : 'txt-ok'}>{x.quantidade > 0 ? '+' : ''}{qtd(x.quantidade)}</span> },
    { id: 'valor', rotulo: 'Valor pago', alinhar: 'dir', render: (x) => (x.valorTotalCentavos ? formatBRL(x.valorTotalCentavos) : '') },
    { id: 'motivo', rotulo: 'Motivo', render: (x) => x.motivo ?? '', esconderNoCelular: true },
    {
      id: 'acao',
      rotulo: '',
      alinhar: 'dir',
      render: (x) =>
        bloqueioEstornoMaterial(x.id) ? null : (
          <Botao pequeno variante="fantasma" onClick={() => setEstornando(x)}>
            Estornar
          </Botao>
        ),
    },
  ];

  const arquivar = async () => {
    if (!m.arquivado) {
      const ok = await confirmar({
        titulo: `Arquivar "${m.nome}"?`,
        itens: ['Some das listas e da escolha de materiais.', 'O histórico continua guardado. Dá para reativar depois.', usadoEm.length ? `Ainda é usado em ${usadoEm.length} produto(s).` : ''].filter(Boolean),
        confirmar: 'Arquivar',
      });
      if (!ok) return;
    }
    try {
      arquivarMaterial(m.id, !m.arquivado);
      avisar(m.arquivado ? 'Material reativado' : 'Material arquivado');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina
      titulo={
        <span class="est-nome">
          {m.tipo === 'filamento' && <AmostraCor hex={m.corHex} tamanho={26} />}
          {m.nome}
        </span>
      }
      subtitulo={[m.tipo === 'filamento' ? m.material : 'Insumo', m.marca, m.arquivado ? 'Arquivado' : ''].filter(Boolean).join(' · ')}
      voltarPara="/estoque/materiais"
      acoes={
        <Botao variante="primario" icone="editar" href={`/estoque/materiais/${m.id}/editar`}>
          Editar
        </Botao>
      }
    >
      <div class="indicadores">
        <Indicador rotulo="Saldo" valor={textoSaldo(m, saldo)} tom={saldo < 0 ? 'ruim' : saldo < m.minimo ? 'atencao' : undefined} detalhe={<SeloMaterial m={m} saldo={saldo} />} />
        <Indicador rotulo="Custo médio" valor={textoCusto(m)} />
        <Indicador rotulo="Mínimo" valor={textoSaldo(m, m.minimo)} />
        {m.tipo === 'filamento' ? <Indicador rotulo="Carretel vazio" valor={formatGramas(m.taraCarretelG ?? 0)} /> : <Indicador rotulo="Unidade" valor={m.unidade} />}
      </div>

      {saldo < 0 && m.tipo === 'filamento' && (
        <Cartao tom="ruim" compacto>
          Saldo negativo: o consumo calculado passou do que foi registrado. Pese o carretel e ajuste o saldo.
        </Cartao>
      )}

      {!m.arquivado && (
        <Linha>
          <Botao variante="secundario" icone="carrinho" href={`/compra?material=${m.id}`}>
            Compra de material
          </Botao>
          {m.tipo === 'filamento' && (
            <Botao variante="secundario" icone="balanca" onClick={() => setModal('pesagem')}>
              Pesei o carretel
            </Botao>
          )}
          <Botao variante="fantasma" icone="editar" onClick={() => setModal('ajuste')}>
            Ajuste
          </Botao>
          <Botao variante="fantasma" icone="alerta" onClick={() => setModal('perda')}>
            Perda
          </Botao>
        </Linha>
      )}
      {modal === 'pesagem' && <ModalPesagem material={m} onFechar={() => setModal(null)} />}
      {(modal === 'ajuste' || modal === 'perda') && <ModalAjusteMaterial material={m} modo={modal} onFechar={() => setModal(null)} />}
      {estornando && (
        <ModalMotivo
          aberto
          titulo="Estornar este movimento?"
          rotuloConfirmar="Estornar"
          perigo
          onFechar={() => setEstornando(null)}
          onConfirmar={(motivo) => executar(() => estornarMovMaterial(estornando.id, motivo), 'Movimento estornado')}
        >
          <p>
            {ROTULO_MOV[estornando.tipo]} de {formatData(estornando.data)}: {estornando.quantidade > 0 ? '+' : ''}
            {qtd(estornando.quantidade)}. Será lançado o movimento inverso
            {estornando.tipo === 'compra' ? ' e o custo médio volta ao de antes da compra' : ''}.
          </p>
        </ModalMotivo>
      )}

      <Grade colunas={2}>
        <Cartao titulo="Usado em">
          {usadoEm.length ? (
            <Lista>
              {usadoEm.map((p) => (
                <ItemLista key={p.id} titulo={p.nome} subtitulo={p.codigo} href={`/estoque/produtos/${p.id}`} />
              ))}
            </Lista>
          ) : (
            <p class="muted">Nenhum produto usa este material ainda.</p>
          )}
        </Cartao>
        <Cartao titulo="Dados">
          <Resumo
            linhas={[
              { rotulo: 'Tipo', valor: m.tipo === 'filamento' ? `Filamento ${m.material ?? ''}` : 'Insumo' },
              m.corNome ? { rotulo: 'Cor', valor: m.corNome } : null,
              m.marca ? { rotulo: 'Marca', valor: m.marca } : null,
              { rotulo: 'Situação', valor: m.arquivado ? <Selo>Arquivado</Selo> : <Selo tom="ok">Ativo</Selo> },
            ]}
          />
        </Cartao>
      </Grade>

      <Cartao titulo="Histórico de movimentos">
        <Tabela colunas={colunas} linhas={movs} chave={(x) => x.id} vazio={<p class="muted">Nenhum movimento ainda.</p>} />
      </Cartao>

      <div>
        <Botao variante="fantasma" icone={m.arquivado ? 'atualizar' : 'arquivar'} onClick={arquivar}>
          {m.arquivado ? 'Reativar material' : 'Arquivar material'}
        </Botao>
      </div>
    </Pagina>
  );
}
