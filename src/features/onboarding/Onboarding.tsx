// Assistente de primeiro acesso (seção 4): 3 passos — empresa e chave PIX, impressoras, filamentos —
// com as opções "Carregar dados de exemplo" e "Restaurar um backup" (aparelho novo ou banco vazio).
import { useState } from 'preact/hooks';
import { navegar } from '../../app/router.ts';
import { MODELOS_IMPRESSORA, NOME_APP } from '../../data/defaults.ts';
import type { TipoFilamento } from '../../data/types.ts';
import { custoHoraMaquina } from '../../domain/pricing.ts';
import { formatDataHora, formatReais } from '../../lib/format.ts';
import { importarBackup, validarBackup } from '../../services/backup.ts';
import { concluirOnboarding, nomeFilamento, type FilamentoInicial } from '../../services/config.ts';
import { carregarExemplo } from '../../services/exemplo.ts';
import type { DadosImpressora } from '../../services/impressoras.ts';
import { Aviso, Botao, Campo, Cartao, Escolha, Logo, Numero, Texto, avisar, confirmar } from '../../ui/index.ts';
import './onboarding.css';

const TIPOS: TipoFilamento[] = ['PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'Outro'];

interface ImpressoraRascunho extends DadosImpressora {
  chave: number;
}
interface FilamentoRascunho extends FilamentoInicial {
  chave: number;
}

let seq = 0;
const novaImpressora = (modelo: string): ImpressoraRascunho => {
  const pad = MODELOS_IMPRESSORA[modelo] ?? MODELOS_IMPRESSORA.Outra;
  return { chave: ++seq, modelo, nome: modelo === 'Outra' ? '' : modelo, valorPago: pad.valorPago, vidaUtilH: pad.vidaUtilH, potenciaW: pad.potenciaW, manutencaoH: pad.manutencaoH };
};
const novoFilamento = (): FilamentoRascunho => ({ chave: ++seq, material: 'PLA', corNome: '', corHex: '#1F1F1F', custoMedio: 100, gramasIniciais: 1000 });

const PASSOS = ['Sua empresa', 'Impressoras', 'Filamentos'];

export function Onboarding() {
  const [passo, setPasso] = useState(0);
  const [empresa, setEmpresa] = useState({ nome: NOME_APP, chavePix: '', nomePix: '', whatsapp: '' });
  const [impressoras, setImpressoras] = useState<ImpressoraRascunho[]>([novaImpressora('A1 mini')]);
  const [filamentos, setFilamentos] = useState<FilamentoRascunho[]>([novoFilamento()]);
  const [erro, setErro] = useState<string | null>(null);

  const mudarImp = (chave: number, patch: Partial<ImpressoraRascunho>) => setImpressoras((l) => l.map((i) => (i.chave === chave ? { ...i, ...patch } : i)));
  const mudarFil = (chave: number, patch: Partial<FilamentoRascunho>) => setFilamentos((l) => l.map((f) => (f.chave === chave ? { ...f, ...patch } : f)));

  const avancar = () => {
    setErro(null);
    if (passo === 0 && !empresa.nome.trim()) return setErro('Informe o nome da empresa.');
    setPasso(passo + 1);
  };

  const concluir = async () => {
    setErro(null);
    try {
      // Linhas de filamento sem cor são ignoradas (o dono pode pular este passo).
      concluirOnboarding({
        empresa,
        impressoras: impressoras.map(({ chave: _c, ...i }) => i),
        filamentos: filamentos.filter((f) => f.corNome.trim()).map(({ chave: _c, ...f }) => f),
      });
      avisar('Tudo pronto! Agora cadastre seus produtos.');
      navegar('/', { substituir: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const exemplo = async () => {
    const ok = await confirmar({
      titulo: 'Carregar dados de exemplo?',
      itens: [
        'Cria impressoras, filamentos, insumos e produtos dos exemplos da especificação.',
        'Usa os parâmetros de custo do Exemplo A (tarifa R$ 1,00, hora R$ 25,00, falha 10%, cartão 4%).',
        'Tudo fica marcado como exemplo e pode ser apagado em Configurações > Dados.',
      ],
      confirmar: 'Carregar exemplo',
    });
    if (!ok) return;
    try {
      carregarExemplo();
      avisar('Dados de exemplo carregados');
      navegar('/estoque/produtos', { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  const restaurar = async (arquivo: File) => {
    const texto = await arquivo.text();
    const v = validarBackup(texto);
    if (!v.ok) return avisar(v.erros.join(' '), 'ruim');
    const ok = await confirmar({
      titulo: 'Restaurar este backup?',
      texto: `Backup de ${formatDataHora(v.exportadoEm)}. Os dados e as configurações do arquivo passam a valer neste aparelho.`,
      confirmar: 'Restaurar',
    });
    if (!ok) return;
    try {
      await importarBackup(texto);
      avisar('Backup restaurado');
      navegar('/', { substituir: true });
    } catch (e) {
      avisar(e instanceof Error ? e.message : String(e), 'ruim');
    }
  };

  return (
    <div class="onb">
      <header class="onb-topo">
        <Logo tamanho={48} />
        <div>
          <h1>Bem-vindo ao {NOME_APP}</h1>
          <p>Em 3 passos o app fica pronto para calcular custos e preços.</p>
        </div>
      </header>

      <div class="onb-corpo">
        <Cartao tom="info" compacto>
          <div class="onb-exemplo">
            <span>Quer só conhecer o app primeiro?</span>
            <Botao variante="secundario" icone="camadas" onClick={exemplo}>
              Carregar dados de exemplo
            </Botao>
          </div>
          <div class="onb-exemplo">
            <span>Já usa o {NOME_APP} em outro aparelho?</span>
            <label class="btn btn-fantasma">
              <span>Restaurar um backup</span>
              <input
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.value = '';
                  if (f) restaurar(f);
                }}
              />
            </label>
          </div>
        </Cartao>

        <ol class="onb-passos">
          {PASSOS.map((p, i) => (
            <li key={p} class={i === passo ? 'atual' : i < passo ? 'feito' : ''}>
              <span class="onb-num">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>

        <Cartao>
          {passo === 0 && (
            <div class="formulario">
              <h2>Sua empresa</h2>
              <Campo rotulo="Nome da empresa" obrigatorio>
                <Texto value={empresa.nome} onInput={(v) => setEmpresa({ ...empresa, nome: v })} autoFocus />
              </Campo>
              <div class="campos-2">
                <Campo rotulo="Chave PIX" dica="Vai nas mensagens de cobrança">
                  <Texto value={empresa.chavePix} onInput={(v) => setEmpresa({ ...empresa, chavePix: v })} placeholder="CPF, CNPJ, e-mail, celular ou aleatória" />
                </Campo>
                <Campo rotulo="Nome de quem recebe o PIX">
                  <Texto value={empresa.nomePix} onInput={(v) => setEmpresa({ ...empresa, nomePix: v })} placeholder="Como aparece no banco" />
                </Campo>
              </div>
              <Campo rotulo="WhatsApp da empresa (opcional)">
                <Texto type="tel" inputMode="tel" value={empresa.whatsapp} onInput={(v) => setEmpresa({ ...empresa, whatsapp: v })} placeholder="(71) 99999-8888" />
              </Campo>
            </div>
          )}

          {passo === 1 && (
            <div class="formulario">
              <h2>Suas impressoras</h2>
              <p class="muted">Os valores já vêm com o padrão de cada modelo. Ajuste o que pagou, se quiser.</p>
              {impressoras.map((imp) => (
                <fieldset key={imp.chave} class="onb-item">
                  <legend>
                    {imp.modelo}
                    <button type="button" class="onb-remover" onClick={() => setImpressoras((l) => l.filter((i) => i.chave !== imp.chave))}>
                      Remover
                    </button>
                  </legend>
                  <div class="campos-2">
                    <Campo rotulo="Nome">
                      <Texto value={imp.nome} onInput={(v) => mudarImp(imp.chave, { nome: v })} placeholder={imp.modelo} />
                    </Campo>
                    <Campo rotulo="Valor pago">
                      <Numero value={imp.valorPago} onChange={(v) => mudarImp(imp.chave, { valorPago: v ?? 0 })} min={0} prefixo="R$" />
                    </Campo>
                    <Campo rotulo="Vida útil estimada">
                      <Numero value={imp.vidaUtilH} onChange={(v) => mudarImp(imp.chave, { vidaUtilH: v ?? 0 })} decimais={0} min={1} sufixo="horas" />
                    </Campo>
                    <Campo rotulo="Potência média imprimindo">
                      <Numero value={imp.potenciaW} onChange={(v) => mudarImp(imp.chave, { potenciaW: v ?? 0 })} decimais={0} min={0} sufixo="W" />
                    </Campo>
                    <Campo rotulo="Manutenção" dica="Bicos, placas e peças">
                      <Numero value={imp.manutencaoH} onChange={(v) => mudarImp(imp.chave, { manutencaoH: v ?? 0 })} decimais={2} min={0} prefixo="R$" sufixo="/h" />
                    </Campo>
                    <Campo rotulo="Custo da hora de máquina">
                      <div class="onb-calculado">
                        {formatReais(custoHoraMaquina({ valorPago: imp.valorPago ?? 0, vidaUtilH: imp.vidaUtilH || 1, manutencaoH: imp.manutencaoH ?? 0 }), 4)}/h
                      </div>
                    </Campo>
                  </div>
                </fieldset>
              ))}
              <div class="barra-acoes">
                <Botao icone="plus" onClick={() => setImpressoras((l) => [...l, novaImpressora('A1 mini')])}>
                  A1 mini
                </Botao>
                <Botao icone="plus" onClick={() => setImpressoras((l) => [...l, novaImpressora('A1')])}>
                  A1
                </Botao>
                <Botao icone="plus" onClick={() => setImpressoras((l) => [...l, novaImpressora('Outra')])}>
                  Outra
                </Botao>
              </div>
            </div>
          )}

          {passo === 2 && (
            <div class="formulario">
              <h2>Seus filamentos</h2>
              <p class="muted">Informe o custo do quilo e quanto tem em casa. Depois dá para pesar o carretel e corrigir.</p>
              {filamentos.map((f) => (
                <fieldset key={f.chave} class="onb-item">
                  <legend>
                    {f.corNome.trim() ? nomeFilamento(f.material, f.corNome) : 'Novo filamento'}
                    <button type="button" class="onb-remover" onClick={() => setFilamentos((l) => l.filter((x) => x.chave !== f.chave))}>
                      Remover
                    </button>
                  </legend>
                  <div class="campos-2">
                    <Campo rotulo="Material">
                      <Escolha value={f.material} onChange={(v) => mudarFil(f.chave, { material: v })} opcoes={TIPOS.map((t) => ({ valor: t, rotulo: t }))} />
                    </Campo>
                    <Campo rotulo="Cor">
                      <div class="onb-cor">
                        <input type="color" value={f.corHex} onInput={(e) => mudarFil(f.chave, { corHex: e.currentTarget.value })} aria-label="Amostra da cor" />
                        <Texto value={f.corNome} onInput={(v) => mudarFil(f.chave, { corNome: v })} placeholder="Ex.: Preto" />
                      </div>
                    </Campo>
                    <Campo rotulo="Custo do kg">
                      <Numero value={f.custoMedio} onChange={(v) => mudarFil(f.chave, { custoMedio: v ?? 0 })} min={0} prefixo="R$" sufixo="/kg" />
                    </Campo>
                    <Campo rotulo="Quanto tem em casa">
                      <Numero value={f.gramasIniciais} onChange={(v) => mudarFil(f.chave, { gramasIniciais: v ?? 0 })} decimais={0} min={0} sufixo="g" />
                    </Campo>
                  </div>
                </fieldset>
              ))}
              <div>
                <Botao icone="plus" onClick={() => setFilamentos((l) => [...l, novoFilamento()])}>
                  Adicionar filamento
                </Botao>
              </div>
              <p class="muted">Argolas, saquinhos e outros insumos você cadastra depois em Estoque &gt; Materiais.</p>
            </div>
          )}

          {erro && (
            <div style={{ marginTop: '12px' }}>
              <Aviso tom="ruim">{erro}</Aviso>
            </div>
          )}

          <div class="onb-rodape">
            {passo > 0 ? (
              <Botao variante="fantasma" icone="voltar" onClick={() => setPasso(passo - 1)}>
                Voltar
              </Botao>
            ) : (
              <span />
            )}
            {passo < 2 ? (
              <Botao variante="primario" onClick={avancar}>
                Próximo
              </Botao>
            ) : (
              <Botao variante="primario" icone="check" onClick={concluir}>
                Concluir
              </Botao>
            )}
          </div>
        </Cartao>
      </div>
    </div>
  );
}
