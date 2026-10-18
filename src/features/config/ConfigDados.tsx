// Configurações > Dados: backup (exportar/importar), exportar CSV, dados de exemplo e sincronização na nuvem.
import { useState } from 'preact/hooks';
import { navegar } from '../../app/router.ts';
import { db } from '../../data/db.ts';
import { hojeISO } from '../../lib/dates.ts';
import { formatDataHora } from '../../lib/format.ts';
import { exportarBackup, importarBackup, nomeArquivoBackup, validarBackup } from '../../services/backup.ts';
import { apagarExemplo, carregarExemplo, contagemExemplo, produtosQueUsamExemplo } from '../../services/exemplo.ts';
import { PLANILHAS, contagemPlanilha, csvPlanilha } from '../../services/exportacao.ts';
import { nomeArquivoCSV } from '../../domain/csv.ts';
import { Aviso, Botao, Cartao, Icon, Linha, Pagina, avisar, baixarArquivo, confirmar } from '../../ui/index.ts';
import { NuvemConfig } from '../conta/NuvemConfig.tsx';

const NOMES: Record<string, string> = {
  impressoras: 'impressoras',
  materiais: 'materiais',
  movMateriais: 'movimentos de material',
  produtos: 'produtos',
  movEstoque: 'movimentações de estoque',
  producoes: 'produções',
  parceiros: 'parceiros',
  expositores: 'expositores',
  acertos: 'acertos',
  clientes: 'clientes',
  pedidos: 'pedidos',
  vendas: 'vendas',
  pagamentos: 'pagamentos',
};

export function ConfigDados() {
  const [ocupado, setOcupado] = useState(false);
  const exemplos = contagemExemplo();

  const exportar = async () => {
    const texto = await exportarBackup();
    baixarArquivo(nomeArquivoBackup(hojeISO()), texto, 'application/json');
    avisar('Backup exportado. Guarde o arquivo em um lugar seguro (Drive, e-mail).');
  };

  const importar = async (arquivo: File) => {
    const texto = await arquivo.text();
    const v = validarBackup(texto);
    if (!v.ok) return avisar(v.erros.join(' '), 'ruim');
    const linhas = Object.entries(v.resumo)
      .filter(([, n]) => n)
      .map(([c, n]) => `${n} ${NOMES[c] ?? c}`);
    const ok = await confirmar({
      titulo: 'Importar este backup?',
      texto: `Backup de ${formatDataHora(v.exportadoEm)}. TUDO o que está neste aparelho será substituído pelo conteúdo do arquivo.`,
      itens: linhas.length ? linhas : ['Backup sem registros (só configurações).'],
      confirmar: 'Substituir e importar',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await importarBackup(texto);
      avisar('Backup importado');
      navegar('/');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    } finally {
      setOcupado(false);
    }
  };

  const carregar = async () => {
    const ok = await confirmar({
      titulo: 'Carregar dados de exemplo?',
      itens: [
        'Cria impressoras, filamentos, insumos e produtos dos exemplos da especificação.',
        'Troca os parâmetros de custo pelos do Exemplo A (os atuais voltam quando apagar o exemplo).',
        'Tudo fica marcado como exemplo.',
      ],
      confirmar: 'Carregar exemplo',
    });
    if (!ok) return;
    try {
      carregarExemplo();
      avisar('Dados de exemplo carregados');
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const apagar = async () => {
    const afetados = produtosQueUsamExemplo();
    const ok = await confirmar({
      titulo: 'Apagar dados de exemplo?',
      itens: [
        `${exemplos} registro(s) marcados como exemplo serão removidos.`,
        'Os parâmetros de custo de antes do exemplo voltam.',
        'Seus próprios cadastros não são apagados.',
        afetados.length
          ? `Atenção: ${afetados.length} produto(s) seu(s) usam impressora ou material de exemplo (${afetados.slice(0, 3).join(', ')}${afetados.length > 3 ? '...' : ''}) e vão ficar sem custo até você trocar na ficha técnica.`
          : '',
      ].filter(Boolean),
      confirmar: 'Apagar exemplo',
      perigo: true,
    });
    if (!ok) return;
    try {
      const r = apagarExemplo();
      avisar(`${r.removidos} registro(s) de exemplo apagados`);
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <Pagina titulo="Dados" voltarPara="/config" largura="estreita">
      <Cartao titulo="Backup">
        <div class="pilha pilha-m">
          <p class="muted">O backup é um arquivo com todos os seus dados. Exporte com frequência, principalmente se não usa a nuvem.</p>
          <Linha>
            <Botao variante="primario" icone="baixar" onClick={exportar}>
              Exportar backup
            </Botao>
            <label class={`btn btn-secundario ${ocupado ? 'disabled' : ''}`}>
              <span>Importar backup</span>
              <input
                type="file"
                accept="application/json,.json"
                hidden
                disabled={ocupado}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (f) importar(f);
                }}
              />
            </label>
          </Linha>
        </div>
      </Cartao>

      <Cartao titulo="Exportar CSV">
        <div class="pilha pilha-m">
          <p class="muted">
            Planilhas para abrir no Excel ou mandar ao contador (separadas por ponto e vírgula, com vírgula decimal). Os relatórios do período ficam em Mais &gt;
            Relatórios, cada um com o seu botão de CSV.
          </p>
          <div class="cfg-csv">
            {PLANILHAS.map((p) => {
              const n = contagemPlanilha(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  class="cfg-csv-item"
                  disabled={n === 0}
                  onClick={() => {
                    baixarArquivo(nomeArquivoCSV(p.rotulo, hojeISO()), csvPlanilha(p.id), 'text/csv;charset=utf-8');
                    avisar(`${p.rotulo}: planilha baixada`);
                  }}
                >
                  <Icon nome="baixar" tamanho={18} />
                  <span>
                    <strong>{p.rotulo}</strong>
                    <small>
                      {p.descricao} · {n} registro(s)
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Dados de exemplo">
        <div class="pilha pilha-m">
          {exemplos > 0 || db.config.exemploCarregado ? (
            <>
              <Aviso tom="info">Há {exemplos} registro(s) de exemplo carregados.</Aviso>
              <div>
                <Botao variante="perigo" icone="lixeira" onClick={apagar}>
                  Apagar dados de exemplo
                </Botao>
              </div>
            </>
          ) : (
            <>
              <p class="muted">Carrega os exemplos da especificação para conhecer o app e conferir os cálculos.</p>
              <div>
                <Botao variante="secundario" icone="camadas" onClick={carregar}>
                  Carregar dados de exemplo
                </Botao>
              </div>
            </>
          )}
        </div>
      </Cartao>

      <NuvemConfig />
    </Pagina>
  );
}
