// Botões e campos de formulário. Campos numéricos aceitam vírgula decimal,
// abrem o teclado numérico e podem ter botões − e + grandes (44 px).
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Cents } from '../lib/money.ts';
import { centsParaCampo, numeroParaCampo, parseCents, parseDecimal } from '../lib/format.ts';
import { Icon } from './Icon.tsx';

// ---------------------------------------------------------------- Botões

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'sucesso';

export interface BotaoProps {
  children?: ComponentChildren;
  variante?: VarianteBotao;
  pequeno?: boolean;
  bloco?: boolean;
  icone?: string;
  /** Navega para esta rota (ex.: '/estoque/produtos/novo'). */
  href?: string;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  class?: string;
}

export function Botao({ children, variante = 'secundario', pequeno, bloco, icone, href, onClick, disabled, type = 'button', title, class: cls }: BotaoProps) {
  const classes = ['btn', `btn-${variante}`, pequeno && 'btn-sm', bloco && 'btn-bloco', !children && 'btn-icone', cls].filter(Boolean).join(' ');
  const conteudo = (
    <>
      {icone && <Icon nome={icone} tamanho={pequeno ? 18 : 20} />}
      {children && <span>{children}</span>}
    </>
  );
  if (href && !disabled) {
    return (
      <a class={classes} href={`#${href}`} title={title} onClick={onClick as unknown as JSX.MouseEventHandler<HTMLAnchorElement>}>
        {conteudo}
      </a>
    );
  }
  return (
    <button class={classes} type={type} onClick={onClick as unknown as JSX.MouseEventHandler<HTMLButtonElement>} disabled={disabled} title={title} aria-label={!children ? title : undefined}>
      {conteudo}
    </button>
  );
}

// ---------------------------------------------------------------- Campo (rótulo + dica + erro)

export function Campo({ rotulo, dica, erro, obrigatorio, children, class: cls }: { rotulo?: ComponentChildren; dica?: ComponentChildren; erro?: string | null; obrigatorio?: boolean; children: ComponentChildren; class?: string }) {
  return (
    <label class={`campo ${erro ? 'campo-erro' : ''} ${cls ?? ''}`}>
      {rotulo && (
        <span class="campo-rotulo">
          {rotulo}
          {obrigatorio && <span class="obrigatorio"> *</span>}
        </span>
      )}
      {children}
      {erro ? <span class="campo-msg-erro">{erro}</span> : dica ? <span class="campo-dica">{dica}</span> : null}
    </label>
  );
}

// ---------------------------------------------------------------- Texto

export function Texto({ value, onInput, placeholder, type = 'text', autoFocus, maxLength, inputMode, disabled, class: cls }: { value: string | undefined | null; onInput: (v: string) => void; placeholder?: string; type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'date' | 'search'; autoFocus?: boolean; maxLength?: number; inputMode?: 'text' | 'tel' | 'email' | 'url' | 'numeric' | 'decimal' | 'search'; disabled?: boolean; class?: string }) {
  return (
    <input
      class={`input ${cls ?? ''}`}
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      inputMode={inputMode}
      disabled={disabled}
      onInput={(e) => onInput(e.currentTarget.value)}
    />
  );
}

export function AreaTexto({ value, onInput, placeholder, linhas = 3 }: { value: string | undefined | null; onInput: (v: string) => void; placeholder?: string; linhas?: number }) {
  return <textarea class="input textarea" rows={linhas} value={value ?? ''} placeholder={placeholder} onInput={(e) => onInput(e.currentTarget.value)} />;
}

export function Data({ value, onInput, min, max }: { value: string | undefined | null; onInput: (v: string) => void; min?: string; max?: string }) {
  return <input class="input" type="date" value={value ?? ''} min={min} max={max} onInput={(e) => onInput(e.currentTarget.value)} />;
}

// ---------------------------------------------------------------- Números

export interface NumeroProps {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  /** Casas decimais aceitas (0 = inteiro). */
  decimais?: number;
  min?: number;
  max?: number;
  /** Mostra botões − e + grandes. */
  stepper?: boolean;
  passo?: number;
  sufixo?: string;
  prefixo?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Destaque visual (ex.: contagem diferente do esperado). */
  tom?: 'ok' | 'atencao' | 'ruim';
  autoFocus?: boolean;
  class?: string;
  ariaLabel?: string;
}

/** Campo numérico com vírgula decimal. Mantém o texto digitado enquanto edita. */
export function Numero({ value, onChange, decimais = 2, min, max, stepper, passo = 1, sufixo, prefixo, placeholder, disabled, tom, autoFocus, class: cls, ariaLabel }: NumeroProps) {
  const [texto, setTexto] = useState(numeroParaCampo(value ?? null, decimais));
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(numeroParaCampo(value ?? null, decimais));
  }, [value, decimais]);

  const limitar = (n: number) => {
    let v = n;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  };

  const aoDigitar = (s: string) => {
    setTexto(s);
    const n = parseDecimal(s);
    onChange(n == null ? null : decimais === 0 ? Math.trunc(n) : n);
  };

  const passar = (delta: number) => {
    const atual = value ?? 0;
    const novo = limitar(Math.round((atual + delta) * 1e6) / 1e6);
    setTexto(numeroParaCampo(novo, decimais));
    onChange(novo);
  };

  const input = (
    <div class={`input-afixo ${tom ? `tom-${tom}` : ''} ${cls ?? ''}`}>
      {prefixo && <span class="afixo">{prefixo}</span>}
      <input
        class="input input-numero"
        type="text"
        inputMode={decimais === 0 ? 'numeric' : 'decimal'}
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onFocus={(e) => {
          focado.current = true;
          (e.currentTarget as HTMLInputElement).select();
        }}
        onBlur={() => {
          focado.current = false;
          const n = parseDecimal(texto);
          if (n != null) {
            const v = limitar(decimais === 0 ? Math.trunc(n) : n);
            if (v !== n) onChange(v);
            setTexto(numeroParaCampo(v, decimais));
          }
        }}
        onInput={(e) => aoDigitar(e.currentTarget.value)}
      />
      {sufixo && <span class="afixo">{sufixo}</span>}
    </div>
  );

  if (!stepper) return input;
  return (
    <div class="stepper">
      <button type="button" class="stepper-btn" onClick={() => passar(-passo)} disabled={disabled || (min != null && (value ?? 0) <= min)} aria-label="Diminuir">
        <Icon nome="minus" />
      </button>
      {input}
      <button type="button" class="stepper-btn" onClick={() => passar(passo)} disabled={disabled || (max != null && (value ?? 0) >= max)} aria-label="Aumentar">
        <Icon nome="plus" />
      </button>
    </div>
  );
}

/** Campo de dinheiro: digita '12,90', devolve centavos. */
export function Dinheiro({ value, onChange, placeholder = '0,00', disabled, autoFocus, permitirNegativo }: { value: Cents | null | undefined; onChange: (c: Cents | null) => void; placeholder?: string; disabled?: boolean; autoFocus?: boolean; permitirNegativo?: boolean }) {
  const [texto, setTexto] = useState(centsParaCampo(value ?? null));
  const focado = useRef(false);
  useEffect(() => {
    if (!focado.current) setTexto(centsParaCampo(value ?? null));
  }, [value]);
  return (
    <div class="input-afixo">
      <span class="afixo">R$</span>
      <input
        class="input input-numero"
        type="text"
        inputMode="decimal"
        value={texto}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={(e) => {
          focado.current = true;
          (e.currentTarget as HTMLInputElement).select();
        }}
        onBlur={() => {
          focado.current = false;
          const c = parseCents(texto);
          setTexto(centsParaCampo(c));
        }}
        onInput={(e) => {
          const s = e.currentTarget.value;
          setTexto(s);
          const c = parseCents(s);
          onChange(c != null && !permitirNegativo && c < 0 ? 0 : c);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Escolhas

export interface Opcao<T extends string | number = string> {
  valor: T;
  rotulo: string;
}

export function Escolha<T extends string | number>({ value, onChange, opcoes, placeholder, disabled }: { value: T | null | undefined; onChange: (v: T) => void; opcoes: Opcao<T>[]; placeholder?: string; disabled?: boolean }) {
  return (
    <select
      class="input select"
      value={value == null ? '' : String(value)}
      disabled={disabled}
      onChange={(e) => {
        const s = e.currentTarget.value;
        const op = opcoes.find((o) => String(o.valor) === s);
        if (op) onChange(op.valor);
      }}
    >
      {(value == null || placeholder) && (
        <option value="" disabled>
          {placeholder ?? 'Escolha...'}
        </option>
      )}
      {opcoes.map((o) => (
        <option key={String(o.valor)} value={String(o.valor)}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

/** Botões lado a lado para poucas opções (ex.: PIX / Dinheiro / Cartão). */
export function Segmentado<T extends string | number>({ value, onChange, opcoes, bloco }: { value: T; onChange: (v: T) => void; opcoes: Opcao<T>[]; bloco?: boolean }) {
  return (
    <div class={`segmentado ${bloco ? 'segmentado-bloco' : ''}`} role="radiogroup">
      {opcoes.map((o) => (
        <button key={String(o.valor)} type="button" role="radio" aria-checked={o.valor === value} class={o.valor === value ? 'ativo' : ''} onClick={() => onChange(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Marcador({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children?: ComponentChildren; disabled?: boolean }) {
  return (
    <label class={`marcador ${disabled ? 'desativado' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Chave({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children?: ComponentChildren }) {
  return (
    <label class="chave">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="chave-trilho" aria-hidden="true" />
      {children && <span>{children}</span>}
    </label>
  );
}

export function Busca({ value, onInput, placeholder = 'Buscar...' }: { value: string; onInput: (v: string) => void; placeholder?: string }) {
  return (
    <div class="busca">
      <Icon nome="busca" tamanho={18} />
      <input class="input" type="search" value={value} placeholder={placeholder} onInput={(e) => onInput(e.currentTarget.value)} />
      {value && (
        <button type="button" class="busca-limpar" onClick={() => onInput('')} aria-label="Limpar busca">
          <Icon nome="fechar" tamanho={16} />
        </button>
      )}
    </div>
  );
}

/** Lê uma imagem, reduz para no máximo `lado` px e devolve data URL JPEG comprimido. */
export function comprimirImagem(arquivo: File, lado = 640, qualidade = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(leitor.error);
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Sem canvas'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.src = String(leitor.result);
    };
    leitor.readAsDataURL(arquivo);
  });
}

/** Escolher foto (opcional), comprimida no envio. */
export function Foto({ value, onChange, rotulo = 'Adicionar foto' }: { value?: string; onChange: (dataUrl: string | undefined) => void; rotulo?: string }) {
  return (
    <div class="foto-campo">
      {value ? <img src={value} alt="" class="foto-previa" /> : <div class="foto-previa foto-vazia"><Icon nome="camadas" /></div>}
      <div class="foto-acoes">
        <label class="btn btn-secundario btn-sm">
          <Icon nome="enviar" tamanho={18} />
          <span>{value ? 'Trocar' : rotulo}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (f) onChange(await comprimirImagem(f));
            }}
          />
        </label>
        {value && <Botao pequeno variante="fantasma" onClick={() => onChange(undefined)}>Remover</Botao>}
      </div>
    </div>
  );
}
