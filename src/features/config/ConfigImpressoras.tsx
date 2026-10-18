// Configurações > Impressoras (seção 6.2): lista e formulário.
import { useState } from 'preact/hooks';
import { navegar } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { MODELOS_IMPRESSORA } from '../../data/defaults.ts';
import { custoHoraMaquina } from '../../domain/pricing.ts';
import { formatReais, formatQtd } from '../../lib/format.ts';
import { desativarImpressora, salvarImpressora, type DadosImpressora } from '../../services/impressoras.ts';
import { Botao, Campo, Cartao, Escolha, ItemLista, Lista, Numero, Pagina, Selo, Texto, Vazio, confirmar } from '../../ui/index.ts';
import { BarraSalvar, tentar } from './comum.tsx';

export function ConfigImpressoras() {
  const impressoras = db.all('impressoras').slice().sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return (
    <Pagina
      titulo="Impressoras"
      subtitulo="Custo hora máquina = valor pago ÷ vida útil + manutenção por hora"
      voltarPara="/config"
      largura="estreita"
      acoes={
        <Botao variante="primario" icone="plus" href="/config/impressoras/novo">
          Nova impressora
        </Botao>
      }
    >
      {impressoras.length === 0 ? (
        <Vazio icone="impressora" titulo="Nenhuma impressora" texto="Cadastre suas impressoras para o app calcular a energia e o desgaste de cada impressão." acao={{ rotulo: 'Cadastrar impressora', href: '/config/impressoras/novo' }} />
      ) : (
        <Lista>
          {impressoras.map((i) => (
            <ItemLista
              key={i.id}
              icone="impressora"
              titulo={i.nome}
              subtitulo={`${i.modelo} · ${formatQtd(i.potenciaW, 0)} W · vida útil ${formatQtd(i.vidaUtilH, 0)} h`}
              direita={i.ativa ? `${formatReais(custoHoraMaquina(i), 4)}/h` : <Selo>Desativada</Selo>}
              href={`/config/impressoras/${i.id}`}
            />
          ))}
        </Lista>
      )}
    </Pagina>
  );
}

export function ImpressoraForm({ id }: { id: string }) {
  const atual = id === 'novo' ? undefined : db.get('impressoras', id);
  const [d, setD] = useState<DadosImpressora>(() =>
    atual ? { ...atual } : { nome: '', ...MODELOS_IMPRESSORA['A1 mini'] },
  );
  if (id !== 'novo' && !atual) {
    return (
      <Pagina titulo="Impressora" voltarPara="/config/impressoras">
        <Vazio titulo="Impressora não encontrada" />
      </Pagina>
    );
  }
  const mudar = (patch: Partial<DadosImpressora>) => setD({ ...d, ...patch });
  const trocarModelo = (modelo: string) => {
    const pad = MODELOS_IMPRESSORA[modelo];
    // No cadastro novo, trocar o modelo aplica os padrões dele.
    setD(atual ? { ...d, modelo } : { ...d, ...pad, modelo });
  };
  const custoHora = custoHoraMaquina({ valorPago: d.valorPago ?? 0, vidaUtilH: d.vidaUtilH || 1, manutencaoH: d.manutencaoH ?? 0 });

  const salvar = () => {
    if (tentar(() => salvarImpressora({ ...d, id: atual?.id }), atual ? 'Impressora salva' : 'Impressora cadastrada')) navegar('/config/impressoras');
  };

  const alternarAtiva = async () => {
    if (!atual) return;
    if (atual.ativa) {
      const ok = await confirmar({
        titulo: `Desativar "${atual.nome}"?`,
        itens: ['Ela some da escolha de impressora nas novas fichas técnicas.', 'Produtos que já usam esta impressora continuam com o custo calculado.'],
        confirmar: 'Desativar',
      });
      if (!ok) return;
    }
    tentar(() => desativarImpressora(atual.id, !atual.ativa), atual.ativa ? 'Impressora desativada' : 'Impressora reativada');
  };

  return (
    <Pagina titulo={atual ? atual.nome : 'Nova impressora'} voltarPara="/config/impressoras" largura="estreita">
      <Cartao>
        <div class="formulario">
          <div class="campos-2">
            <Campo rotulo="Modelo">
              <Escolha
                value={Object.keys(MODELOS_IMPRESSORA).includes(d.modelo ?? '') ? d.modelo : 'Outra'}
                onChange={trocarModelo}
                opcoes={Object.keys(MODELOS_IMPRESSORA).map((m) => ({ valor: m, rotulo: m }))}
              />
            </Campo>
            <Campo rotulo="Nome" dica="Como aparece nas fichas técnicas">
              <Texto value={d.nome} onInput={(v) => mudar({ nome: v })} placeholder={d.modelo} />
            </Campo>
            <Campo rotulo="Valor pago">
              <Numero value={d.valorPago} onChange={(v) => mudar({ valorPago: v })} min={0} prefixo="R$" />
            </Campo>
            <Campo rotulo="Vida útil estimada">
              <Numero value={d.vidaUtilH} onChange={(v) => mudar({ vidaUtilH: v })} decimais={0} min={1} sufixo="horas" />
            </Campo>
            <Campo rotulo="Potência média imprimindo">
              <Numero value={d.potenciaW} onChange={(v) => mudar({ potenciaW: v })} decimais={0} min={0} sufixo="W" />
            </Campo>
            <Campo rotulo="Manutenção" dica="Cobre bicos, placas e peças">
              <Numero value={d.manutencaoH} onChange={(v) => mudar({ manutencaoH: v })} decimais={2} min={0} prefixo="R$" sufixo="/h" />
            </Campo>
          </div>
          <div class="cfg-destaque">
            Custo da hora de máquina: <strong>{formatReais(custoHora, 4)}/h</strong>
          </div>
        </div>
      </Cartao>
      {atual && (
        <Botao variante="fantasma" icone={atual.ativa ? 'arquivar' : 'atualizar'} onClick={alternarAtiva}>
          {atual.ativa ? 'Desativar impressora' : 'Reativar impressora'}
        </Botao>
      )}
      <BarraSalvar>
        <Botao variante="primario" icone="check" onClick={salvar}>
          Salvar
        </Botao>
      </BarraSalvar>
    </Pagina>
  );
}
