// Peças compartilhadas da área de Parceiros.
import type { ComponentChildren } from 'preact';
import { ROTULO_TIPO_PARCEIRO } from '../../data/defaults.ts';
import type { Parceiro } from '../../data/types.ts';
import { linkWhatsApp } from '../../domain/whatsapp.ts';
import { Abas, Botao, Icon, Selo } from '../../ui/index.ts';
import './parceiros.css';

export function ParceirosAbas({ ativa }: { ativa: 'agenda' | 'lista' | 'expositores' }) {
  return (
    <Abas
      ativa={ativa}
      abas={[
        { id: 'agenda', rotulo: 'Agenda de acertos', href: '/parceiros/agenda' },
        { id: 'lista', rotulo: 'Parceiros', href: '/parceiros/lista' },
        { id: 'expositores', rotulo: 'Expositores', href: '/parceiros/expositores' },
      ]}
    />
  );
}

export const ROTULO_SITUACAO: Record<Parceiro['situacao'], string> = { ativo: 'Ativo', pausado: 'Pausado', encerrado: 'Encerrado' };

export function SeloSituacao({ p }: { p: Parceiro }) {
  if (p.arquivado) return <Selo tom="neutro">Arquivado</Selo>;
  return <Selo tom={p.situacao === 'ativo' ? 'ok' : p.situacao === 'pausado' ? 'atencao' : 'neutro'}>{ROTULO_SITUACAO[p.situacao]}</Selo>;
}

export function descricaoParceiro(p: Parceiro): string {
  return [ROTULO_TIPO_PARCEIRO[p.tipo], p.bairro].filter(Boolean).join(' · ');
}

/** Link do mapa: o informado no cadastro ou uma busca pelo endereço. */
export function linkDoMapa(p: Parceiro): string | null {
  if (p.linkMapa) return p.linkMapa;
  const q = [p.nome, p.endereco, p.bairro].filter(Boolean).join(', ');
  return p.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

export function BotaoMapa({ p, pequeno }: { p: Parceiro; pequeno?: boolean }) {
  const link = linkDoMapa(p);
  if (!link) return null;
  return (
    <a class={`btn btn-secundario ${pequeno ? 'btn-sm' : ''}`} href={link} target="_blank" rel="noopener">
      <Icon nome="mapa" tamanho={18} />
      <span>Abrir no mapa</span>
    </a>
  );
}

/** Botão que abre o WhatsApp (wa.me) com o texto já codificado. */
export function BotaoWhatsApp({ numero, texto, children = 'WhatsApp', pequeno, primario }: { numero?: string; texto?: string; children?: ComponentChildren; pequeno?: boolean; primario?: boolean }) {
  return (
    <a class={`btn ${primario ? 'btn-primario' : 'btn-secundario'} ${pequeno ? 'btn-sm' : ''}`} href={linkWhatsApp(numero, texto)} target="_blank" rel="noopener">
      <Icon nome="whatsapp" tamanho={18} />
      <span>{children}</span>
    </a>
  );
}

export function ParceiroNaoEncontrado() {
  return (
    <div class="pagina">
      <div class="vazio">
        <strong>Parceiro não encontrado</strong>
        <Botao href="/parceiros/lista" variante="primario">
          Ver parceiros
        </Botao>
      </div>
    </div>
  );
}
