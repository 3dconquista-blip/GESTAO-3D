// "Comprovante" do acerto: resumo, itens, situação do pagamento e a mensagem (8.11) com
// "Enviar no WhatsApp", "Copiar texto" e "Imprimir/PDF". "Reabrir acerto" só no último de cada parceiro.
import { navegar, type TelaProps } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { useDb } from '../../data/hooks.ts';
import { nomeProduto } from '../../data/selectors.ts';
import type { AcertoItem } from '../../data/types.ts';
import { formatBRL, formatData, formatNumero } from '../../lib/format.ts';
import { pendenciasDoParceiro, podeReabrir, reabrirUltimoAcerto, textoComprovante } from '../../services/acertos.ts';
import { Aviso, Botao, Cartao, Grade, Linha, Pagina, Resumo, Selo, Tabela, Vazio, avisar, confirmar, copiarTexto, type Coluna } from '../../ui/index.ts';
import { BotaoWhatsApp } from './comum.tsx';

const TOM = { pago: 'ok', parcial: 'atencao', pendente: 'ruim' } as const;
const ROTULO = { pago: 'Pago', parcial: 'Pago em parte', pendente: 'A receber' } as const;

export function Comprovante({ params }: TelaProps) {
  useDb();
  const a = db.get('acertos', params.id);
  if (!a) {
    return (
      <div class="pagina">
        <Vazio titulo="Acerto não encontrado" acao={{ rotulo: 'Agenda de acertos', href: '/parceiros/agenda' }} />
      </div>
    );
  }
  const p = db.get('parceiros', a.parceiroId);
  const texto = textoComprovante(a.id);
  const al = pendenciasDoParceiro(a.parceiroId).acertos.find((x) => x.acertoId === a.id);

  const colunas: Coluna<AcertoItem>[] = [
    { id: 'produto', rotulo: 'Produto', principal: true, render: (i) => nomeProduto(i.produtoId) },
    { id: 'esp', rotulo: 'Esperado', alinhar: 'dir', render: (i) => String(i.esperado) },
    { id: 'contei', rotulo: 'Contei', alinhar: 'dir', render: (i) => String(i.contei) },
    { id: 'vend', rotulo: 'Vendidos', alinhar: 'dir', render: (i) => <strong>{i.vendidos}</strong> },
    { id: 'preco', rotulo: 'Preço', alinhar: 'dir', render: (i) => formatBRL(i.precoUnitCentavos) },
    { id: 'valor', rotulo: 'Valor', alinhar: 'dir', render: (i) => formatBRL(i.valorCentavos) },
    { id: 'ocorr', rotulo: 'Ocorrências', render: (i) => [i.avariados ? `${i.avariados} avariado(s)` : '', i.recolhidos ? `${i.recolhidos} recolhido(s)` : '', i.faltasAbonadas ? `${i.faltasAbonadas} abonada(s)` : '', i.ajusteEntrada ? `+${i.ajusteEntrada} ajuste` : ''].filter(Boolean).join(', ') || '—', esconderNoCelular: true },
    { id: 'rep', rotulo: 'Repostos', alinhar: 'dir', render: (i) => String(i.repostos) },
    { id: 'final', rotulo: 'Ficou', alinhar: 'dir', render: (i) => String(i.estoqueFinal) },
  ];

  const reabrir = async () => {
    const ok = await confirmar({
      titulo: 'Reabrir este acerto?',
      itens: ['As movimentações e os pagamentos deste acerto são estornados (ficam registrados).', 'O acerto volta para o rascunho, para corrigir e concluir de novo.', 'Só o último acerto de cada parceiro pode ser reaberto.'],
      confirmar: 'Reabrir acerto',
      perigo: true,
    });
    if (!ok) return;
    try {
      reabrirUltimoAcerto(a.parceiroId);
      avisar('Acerto reaberto');
      navegar(`/parceiros/${a.parceiroId}/acerto`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina
      titulo={`Acerto de ${formatData(a.data)}`}
      subtitulo={`${p?.nome ?? 'Parceiro'} · ${formatData(a.dataAnterior)} a ${formatData(a.data)}${a.final ? ' · acerto final' : ''}`}
      voltarPara={`/parceiros/${a.parceiroId}`}
      acoes={
        <Botao variante="secundario" icone="baixar" onClick={() => window.print()}>
          Imprimir / PDF
        </Botao>
      }
    >
      {a.situacao === 'estornado' ? (
        <Aviso tom="neutro">Este acerto foi reaberto: as movimentações e os pagamentos dele foram estornados.</Aviso>
      ) : (
        <Linha>
          <Selo tom={TOM[a.statusPagamento]}>{ROTULO[a.statusPagamento]}</Selo>
          {al && al.aberto > 0 && <Selo tom="ruim">Falta receber {formatBRL(al.aberto)}</Selo>}
          {al && al.aberto < 0 && <Selo tom="atencao">Falta repassar {formatBRL(-al.aberto)}</Selo>}
        </Linha>
      )}
      {a.avisos?.map((x) => (
        <Aviso key={x} tom="atencao">
          {x}
        </Aviso>
      ))}

      <Grade colunas={2}>
        <Cartao titulo="Valores">
          <Resumo
            linhas={[
              { rotulo: 'Total vendido', valor: formatBRL(a.brutoCentavos) },
              { rotulo: `Parte do parceiro (${formatNumero(a.pctParceiro, 0)}%)`, valor: formatBRL(a.parteParceiroCentavos) },
              { rotulo: `Sua parte (${formatNumero(100 - a.pctParceiro, 0)}%)`, valor: formatBRL(a.suaParteCentavos) },
              a.pixDiretoCentavos ? { rotulo: 'Recebido no seu PIX no período', valor: formatBRL(a.pixDiretoCentavos) } : null,
              { rotulo: 'Valor do acerto', valor: formatBRL(a.valorAcertoCentavos), destaque: true },
              { rotulo: 'Próximo acerto', valor: a.final ? '—' : formatData(a.proximoAcerto) },
            ]}
          />
        </Cartao>
        <Cartao titulo="Mensagem do comprovante">
          <pre class="acerto-msg">{texto}</pre>
          <Linha class="parc-dados-acoes nao-imprimir">
            <BotaoWhatsApp numero={p?.whatsapp} texto={texto} primario>
              Enviar no WhatsApp
            </BotaoWhatsApp>
            <Botao icone="copiar" onClick={() => copiarTexto(texto)}>
              Copiar texto
            </Botao>
          </Linha>
        </Cartao>
      </Grade>

      <Cartao titulo="Itens">
        <Tabela colunas={colunas} linhas={a.itens} chave={(i) => i.produtoId} />
      </Cartao>

      {podeReabrir(a.id) && (
        <div class="nao-imprimir">
          <Botao variante="fantasma" icone="atualizar" onClick={reabrir}>
            Reabrir acerto
          </Botao>
        </div>
      )}
    </Pagina>
  );
}
