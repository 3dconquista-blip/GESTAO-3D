// Utilidades das telas de configuração.
import type { ComponentChildren } from 'preact';
import { Cartao, ItemLista, Lista, avisar } from '../../ui/index.ts';

/** Roda uma gravação mostrando o erro de regra (ErroNegocio) para o dono. Retorna true se deu certo. */
export function tentar(fn: () => void, sucesso = 'Configuração salva'): boolean {
  try {
    fn();
    if (sucesso) avisar(sucesso);
    return true;
  } catch (e) {
    avisar(e instanceof Error ? e.message : String(e), 'ruim');
    return false;
  }
}

/** Mostra avisos que não bloqueiam (ex.: produtos que ficaram com margem baixa). */
export function mostrarAvisos(avisos: string[]) {
  for (const a of avisos) avisar(a, 'atencao');
}

/** Telas que agora ficam dentro de uma das 5 seções (decisão 100): links no fim da tela principal da seção. */
export function TambemNestaSecao({ itens }: { itens: { rotulo: string; texto: string; href: string; icone: string }[] }) {
  return (
    <Cartao titulo="Também nesta seção">
      <Lista>
        {itens.map((i) => (
          <ItemLista key={i.href} icone={i.icone} titulo={i.rotulo} subtitulo={i.texto} href={i.href} />
        ))}
      </Lista>
    </Cartao>
  );
}

/** Barra fixa com o botão principal de salvar. */
export function BarraSalvar({ children }: { children: ComponentChildren }) {
  return <div class="barra-acoes-fixa">{children}</div>;
}
