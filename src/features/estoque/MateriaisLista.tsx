// Estoque > Materiais: filamentos (gramas) e outros insumos (unidades).
import { useState } from 'preact/hooks';
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { saldoMaterial } from '../../data/selectors.ts';
import type { Material } from '../../data/types.ts';
import { statusMaterial } from '../../domain/materiais.ts';
import { combinaBusca, formatGramas, formatQtd, formatReais } from '../../lib/format.ts';
import { Botao, Busca, Cartao, Chave, Pagina, Segmentado, Selo, Tabela, Vazio, type Coluna } from '../../ui/index.ts';
import { AmostraCor, EstoqueAbas } from './EstoqueAbas.tsx';

/** Saldo formatado na unidade do material. */
export function textoSaldo(m: Material, saldo: number): string {
  return m.tipo === 'filamento' ? formatGramas(saldo) : `${formatQtd(saldo)} ${m.unidade}`;
}

/** Custo médio formatado: R$/kg (filamento) ou R$/unidade. */
export function textoCusto(m: Material): string {
  return m.tipo === 'filamento' ? `${formatReais(m.custoMedio)}/kg` : `${formatReais(m.custoMedio, m.custoMedio < 1 ? 4 : 2)}/${m.unidade}`;
}

export function SeloMaterial({ m, saldo }: { m: Material; saldo: number }) {
  const st = statusMaterial(saldo, m.minimo);
  if (st === 'negativo') return <Selo tom="ruim">{m.tipo === 'filamento' ? 'Negativo — pese o carretel' : 'Negativo'}</Selo>;
  if (st === 'baixo') return <Selo tom="atencao">Abaixo do mínimo</Selo>;
  return <Selo tom="ok">Ok</Selo>;
}

export function MateriaisLista({ query }: TelaProps) {
  useDb();
  const [tipo, setTipo] = useState<Material['tipo']>((query.get('tipo') as Material['tipo']) || 'filamento');
  const [busca, setBusca] = useState('');
  const [arquivados, setArquivados] = useState(false);

  const todos = db.all('materiais');
  const lista = todos
    .filter((m) => m.tipo === tipo && (arquivados ? m.arquivado : !m.arquivado))
    .filter((m) => combinaBusca(busca, m.nome, m.marca, m.corNome, m.material))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const colunas: Coluna<Material>[] = [
    {
      id: 'nome',
      rotulo: tipo === 'filamento' ? 'Filamento' : 'Insumo',
      principal: true,
      render: (m) => (
        <span class="est-nome">
          {m.tipo === 'filamento' && <AmostraCor hex={m.corHex} />}
          <span class="est-nome-textos">
            <strong>{m.nome}</strong>
            {m.marca && <small>{m.marca}</small>}
          </span>
        </span>
      ),
    },
    { id: 'saldo', rotulo: 'Saldo', alinhar: 'dir', render: (m) => <strong>{textoSaldo(m, saldoMaterial(m.id))}</strong> },
    { id: 'minimo', rotulo: 'Mínimo', alinhar: 'dir', render: (m) => textoSaldo(m, m.minimo) },
    { id: 'custo', rotulo: 'Custo médio', alinhar: 'dir', render: (m) => textoCusto(m) },
    { id: 'status', rotulo: 'Situação', render: (m) => <SeloMaterial m={m} saldo={saldoMaterial(m.id)} /> },
  ];

  const nTipo = (t: Material['tipo']) => todos.filter((m) => m.tipo === t && !m.arquivado).length;

  return (
    <Pagina
      titulo="Estoque"
      acoes={
        <>
          <Botao variante="secundario" icone="carrinho" href="/compra">
            Compra
          </Botao>
          <Botao variante="primario" icone="plus" href={`/estoque/materiais/novo?tipo=${tipo}`}>
            Novo material
          </Botao>
        </>
      }
    >
      <EstoqueAbas ativa="materiais" />
      <div class="est-filtros">
        <Busca value={busca} onInput={setBusca} placeholder="Buscar material..." />
        <Segmentado
          value={tipo}
          onChange={setTipo}
          opcoes={[
            { valor: 'filamento', rotulo: `Filamentos (${nTipo('filamento')})` },
            { valor: 'insumo', rotulo: `Outros insumos (${nTipo('insumo')})` },
          ]}
        />
        <span />
        <Chave checked={arquivados} onChange={setArquivados}>
          Arquivados
        </Chave>
      </div>
      {lista.length === 0 ? (
        busca || arquivados ? (
          <Vazio icone="busca" titulo="Nada encontrado" texto={arquivados ? 'Nenhum material arquivado.' : 'Tente outra busca.'} />
        ) : (
          <Vazio
            icone="rolo"
            titulo={tipo === 'filamento' ? 'Nenhum filamento cadastrado' : 'Nenhum insumo cadastrado'}
            texto={
              tipo === 'filamento'
                ? 'Cadastre seus filamentos com o custo do quilo para o app calcular o custo das peças.'
                : 'Argolas, correntes, ímãs, saquinhos e etiquetas entram no custo de cada peça.'
            }
            acao={{ rotulo: tipo === 'filamento' ? 'Cadastrar filamento' : 'Cadastrar insumo', href: `/estoque/materiais/novo?tipo=${tipo}` }}
          />
        )
      ) : (
        <Cartao>
          <Tabela
            colunas={colunas}
            linhas={lista}
            chave={(m) => m.id}
            onClickLinha={(m) => navegar(`/estoque/materiais/${m.id}`)}
            tomLinha={(m) => (statusMaterial(saldoMaterial(m.id), m.minimo) === 'negativo' ? 'ruim' : undefined)}
          />
        </Cartao>
      )}
    </Pagina>
  );
}
