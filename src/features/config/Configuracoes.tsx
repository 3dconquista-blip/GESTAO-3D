// "Configurações" (seção 12), em 5 seções (decisão 100). Canais e categorias ficam dentro de "Custos e preços";
// mensagens dentro de "Empresa"; parcerias dentro de "Pedidos e parcerias" (links no fim de cada tela).
import type { TelaProps } from '../../app/router.ts';
import { useDb } from '../../data/hooks.ts';
import { ItemLista, Lista, Pagina } from '../../ui/index.ts';
import { ConfigEmpresa } from './ConfigEmpresa.tsx';
import { ConfigCustos } from './ConfigCustos.tsx';
import { ConfigCanais } from './ConfigCanais.tsx';
import { ConfigImpressoras, ImpressoraForm } from './ConfigImpressoras.tsx';
import { ConfigParcerias, ConfigPedidos } from './ConfigPadroes.tsx';
import { ConfigMensagens } from './ConfigMensagens.tsx';
import { ConfigCategorias } from './ConfigCategorias.tsx';
import { ConfigDados } from './ConfigDados.tsx';
import './config.css';

export const SECOES = [
  { id: 'empresa', rotulo: 'Empresa e mensagens', icone: 'loja', texto: 'Nome, WhatsApp, chave PIX, política de cancelamento e modelos de mensagem' },
  { id: 'custos', rotulo: 'Custos e preços', icone: 'dinheiro', texto: 'Energia, sua hora, falhas, margem, canais de venda e categorias' },
  { id: 'impressoras', rotulo: 'Impressoras', icone: 'impressora', texto: 'Valor pago, vida útil, potência e manutenção' },
  { id: 'pedidos', rotulo: 'Pedidos e parcerias', icone: 'pedidos', texto: 'Pedido mínimo, sinal, validade, divisões e frequência do acerto' },
  { id: 'dados', rotulo: 'Dados e nuvem', icone: 'arquivo', texto: 'Backup, dados de exemplo e sincronização na nuvem' },
];

export function Configuracoes({ params }: TelaProps) {
  useDb();
  switch (params.secao) {
    case 'empresa':
      return <ConfigEmpresa />;
    case 'custos':
      return <ConfigCustos />;
    case 'canais':
      return <ConfigCanais />;
    case 'impressoras':
      return params.id ? <ImpressoraForm id={params.id} /> : <ConfigImpressoras />;
    case 'parcerias':
      return <ConfigParcerias />;
    case 'pedidos':
      return <ConfigPedidos />;
    case 'mensagens':
      return <ConfigMensagens />;
    case 'categorias':
      return <ConfigCategorias />;
    case 'dados':
      return <ConfigDados />;
  }
  return (
    <Pagina titulo="Configurações" voltarPara="/mais" largura="estreita">
      <Lista>
        {SECOES.map((s) => (
          <ItemLista key={s.id} icone={s.icone} titulo={s.rotulo} subtitulo={s.texto} href={`/config/${s.id}`} />
        ))}
      </Lista>
    </Pagina>
  );
}
