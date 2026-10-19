// "Configurações" (seção 12): lista de seções e roteamento para cada uma.
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
  { id: 'empresa', rotulo: 'Empresa', icone: 'loja', texto: 'Nome, logo, WhatsApp, chave PIX e política de cancelamento' },
  { id: 'custos', rotulo: 'Custos e preços', icone: 'dinheiro', texto: 'Energia, sua hora, falhas, margem e arredondamento' },
  { id: 'canais', rotulo: 'Canais de venda', icone: 'etiqueta', texto: 'Comissão de cada canal (PIX, cartão, parceiros, marketplace)' },
  { id: 'impressoras', rotulo: 'Impressoras', icone: 'impressora', texto: 'Valor pago, vida útil, potência e manutenção' },
  { id: 'parcerias', rotulo: 'Parcerias', icone: 'parceiros', texto: 'Divisões, frequência do acerto e avisos' },
  { id: 'pedidos', rotulo: 'Pedidos', icone: 'pedidos', texto: 'Pedido mínimo, validade, urgência, desconto e sinal' },
  { id: 'mensagens', rotulo: 'Mensagens', icone: 'whatsapp', texto: 'Modelos de mensagem do WhatsApp' },
  { id: 'categorias', rotulo: 'Categorias', icone: 'camadas', texto: 'Categorias dos produtos' },
  { id: 'dados', rotulo: 'Dados', icone: 'arquivo', texto: 'Backup, dados de exemplo e sincronização na nuvem' },
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
