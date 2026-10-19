// Banco em memória com persistência plugável (IndexedDB no navegador; nada nos testes).
// Uso:
//   import { db } from '../data/db.ts';
//   db.all('produtos'); db.get('produtos', id); db.config
//   db.tx((t) => { t.insert('movEstoque', {...}); t.update('produtos', id, { precoEtiquetaCentavos: 790 }); });
// Toda alteração passa por db.tx(): é atômica (se der erro, nada muda), gera uma nova
// versão, avisa a interface e persiste numa única transação do adaptador.
import { agoraISO } from '../lib/dates.ts';
import { novoId } from '../lib/id.ts';
import { configPadrao, migrarConfig } from './defaults.ts';
import type { Base, Colecoes, Config, ID, NomeColecao, Novo } from './types.ts';
import { COLECOES } from './types.ts';

export type ColOuConfig = NomeColecao | 'config';

export interface Alteracao {
  col: ColOuConfig;
  id: ID;
  /** null = remoção física (só para dados de exemplo e importação de backup). */
  rec: Base | null;
}

export interface Snapshot {
  config: Config | null;
  colecoes: Partial<Record<NomeColecao, Base[]>>;
}

export interface Adaptador {
  carregar(): Promise<Snapshot>;
  gravar(alteracoes: Alteracao[]): Promise<void>;
  limpar(): Promise<void>;
}

export interface Tx {
  insert<K extends NomeColecao>(col: K, rec: Novo<Colecoes[K]>): Colecoes[K];
  update<K extends NomeColecao>(
    col: K,
    id: ID,
    patch: Partial<Colecoes[K]> | ((atual: Colecoes[K]) => Colecoes[K]),
  ): Colecoes[K];
  /** Remoção física. Use só para dados de exemplo; cadastros são arquivados. */
  remove(col: NomeColecao, id: ID): void;
  config(patch: Partial<Config> | ((atual: Config) => Config)): Config;
  get<K extends NomeColecao>(col: K, id: ID): Colecoes[K] | undefined;
  all<K extends NomeColecao>(col: K): Colecoes[K][];
}

type Mapas = { [K in NomeColecao]: Map<ID, Colecoes[K]> };

function mapasVazios(): Mapas {
  const m = {} as Record<NomeColecao, Map<ID, Base>>;
  for (const c of COLECOES) m[c] = new Map();
  return m as unknown as Mapas;
}

function clonar<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export class Store {
  version = 0;
  config: Config = configPadrao();
  pronto = false;
  private mapas: Mapas = mapasVazios();
  private cache = new Map<NomeColecao, { v: number; arr: Base[] }>();
  private ouvintes = new Set<() => void>();
  private adaptador: Adaptador | null = null;
  private fila: Promise<void> = Promise.resolve();
  /** Chamado após cada transação persistida (usado pela sincronização na nuvem). */
  aoGravar: ((alteracoes: Alteracao[]) => void) | null = null;
  /** Chamado quando a persistência falha. */
  aoErro: ((erro: unknown) => void) | null = null;
  /** Enquanto true, todo registro inserido ganha `exemplo: true` (usado por "Carregar dados de exemplo"). */
  modoExemplo = false;

  usarAdaptador(a: Adaptador | null) {
    this.adaptador = a;
  }

  async iniciar(): Promise<void> {
    if (this.adaptador) {
      const snap = await this.adaptador.carregar();
      this.aplicarSnapshot(snap);
    }
    this.pronto = true;
    this.version++;
    this.notificar();
  }

  /** Substitui tudo em memória (sem persistir). */
  aplicarSnapshot(snap: Snapshot) {
    this.mapas = mapasVazios();
    this.config = snap.config ? migrarConfig({ ...configPadrao(), ...snap.config }) : configPadrao();
    for (const c of COLECOES) {
      const lista = snap.colecoes[c] || [];
      const mapa = this.mapas[c] as Map<ID, Base>;
      for (const r of lista) mapa.set(r.id, r);
    }
    this.version++;
    this.cache.clear();
  }

  /** Exporta tudo (backup). */
  snapshot(): Snapshot {
    const colecoes: Partial<Record<NomeColecao, Base[]>> = {};
    for (const c of COLECOES) colecoes[c] = this.all(c).map(clonar);
    return { config: clonar(this.config), colecoes };
  }

  /** Substitui tudo e persiste (importar backup, apagar tudo). */
  async substituirTudo(snap: Snapshot): Promise<void> {
    this.aplicarSnapshot(snap);
    if (this.adaptador) {
      await this.adaptador.limpar();
      const alt: Alteracao[] = [{ col: 'config', id: 'config', rec: this.config }];
      for (const c of COLECOES) for (const r of this.all(c)) alt.push({ col: c, id: r.id, rec: r });
      await this.adaptador.gravar(alt);
      this.aoGravar?.(alt);
    }
    this.notificar();
  }

  /**
   * Aplica registros vindos de fora (sincronização na nuvem): grava no aparelho e
   * avisa a interface, mas NÃO chama aoGravar (para não reenviar à nuvem).
   */
  aplicarExternos(alteracoes: Alteracao[]) {
    if (!alteracoes.length) return;
    for (const a of alteracoes) {
      if (a.col === 'config') {
        if (a.rec) this.config = { ...configPadrao(), ...(a.rec as Config) };
        continue;
      }
      const mapa = this.mapas[a.col] as Map<ID, Base> | undefined;
      if (!mapa) continue;
      if (a.rec) mapa.set(a.id, a.rec);
      else mapa.delete(a.id);
    }
    this.version++;
    this.cache.clear();
    if (this.adaptador) {
      const ad = this.adaptador;
      this.fila = this.fila.then(() => ad.gravar(alteracoes)).catch((e) => {
        console.error('Falha ao salvar', e);
        this.aoErro?.(e);
      });
    }
    this.notificar();
  }

  /** Todas as chaves 'colecao/id' (inclui 'config/config'). */
  todasAsChaves(): string[] {
    const out = ['config/config'];
    for (const c of COLECOES) for (const id of this.mapas[c].keys()) out.push(`${c}/${id}`);
    return out;
  }

  /** Registro por chave 'colecao/id' (ou undefined). */
  porChave(chave: string): Base | undefined {
    const i = chave.indexOf('/');
    const col = chave.slice(0, i) as ColOuConfig;
    const id = chave.slice(i + 1);
    if (col === 'config') return this.config;
    return (this.mapas[col] as Map<ID, Base> | undefined)?.get(id);
  }

  /** Zera a memória (testes). */
  resetar() {
    this.aplicarSnapshot({ config: null, colecoes: {} });
    this.notificar();
  }

  all<K extends NomeColecao>(col: K): Colecoes[K][] {
    const c = this.cache.get(col);
    if (c && c.v === this.version) return c.arr as Colecoes[K][];
    const arr = Array.from(this.mapas[col].values()) as Colecoes[K][];
    this.cache.set(col, { v: this.version, arr });
    return arr;
  }

  get<K extends NomeColecao>(col: K, id: ID | null | undefined): Colecoes[K] | undefined {
    if (!id) return undefined;
    return this.mapas[col].get(id) as Colecoes[K] | undefined;
  }

  subscribe(fn: () => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private notificar() {
    for (const fn of Array.from(this.ouvintes)) fn();
  }

  tx<R>(fn: (t: Tx) => R): R {
    const originais = new Map<string, { col: ColOuConfig; id: ID; antes: Base | undefined }>();
    const tocados = new Map<string, { col: ColOuConfig; id: ID }>();
    const agora = agoraISO();
    const mapas = this.mapas;
    const self = this;

    const lembrar = (col: ColOuConfig, id: ID) => {
      const k = `${col}/${id}`;
      if (!originais.has(k)) {
        const antes = col === 'config' ? self.config : (mapas[col].get(id) as Base | undefined);
        originais.set(k, { col, id, antes });
      }
      tocados.set(k, { col, id });
    };

    const t: Tx = {
      insert(col, rec) {
        const id = rec.id || novoId();
        if (mapas[col].has(id)) throw new Error(`Registro duplicado em ${col}: ${id}`);
        lembrar(col, id);
        const extra = self.modoExemplo ? { exemplo: true } : {};
        const novo = { ...rec, ...extra, id, criadoEm: agora, atualizadoEm: agora } as unknown as Colecoes[typeof col];
        (mapas[col] as Map<ID, Base>).set(id, novo as unknown as Base);
        return novo;
      },
      update(col, id, patch) {
        const atual = mapas[col].get(id);
        if (!atual) throw new Error(`Registro não encontrado em ${col}: ${id}`);
        lembrar(col, id);
        const base = typeof patch === 'function' ? patch(clonar(atual)) : { ...atual, ...patch };
        const novo = { ...base, id, criadoEm: atual.criadoEm, atualizadoEm: agora } as Colecoes[typeof col];
        (mapas[col] as Map<ID, Base>).set(id, novo as unknown as Base);
        return novo;
      },
      remove(col, id) {
        if (!mapas[col].has(id)) return;
        lembrar(col, id);
        mapas[col].delete(id);
      },
      config(patch) {
        lembrar('config', 'config');
        const base = typeof patch === 'function' ? patch(clonar(self.config)) : { ...self.config, ...patch };
        self.config = { ...base, id: 'config', atualizadoEm: agora };
        return self.config;
      },
      get(col, id) {
        return mapas[col].get(id) as Colecoes[typeof col] | undefined;
      },
      all(col) {
        return Array.from(mapas[col].values()) as Colecoes[typeof col][];
      },
    };

    let resultado: R;
    try {
      resultado = fn(t);
    } catch (e) {
      // Desfaz tudo o que a transação mexeu.
      for (const { col, id, antes } of originais.values()) {
        if (col === 'config') self.config = antes as Config;
        else if (antes) (mapas[col] as Map<ID, Base>).set(id, antes);
        else mapas[col].delete(id);
      }
      throw e;
    }

    if (tocados.size === 0) return resultado;
    this.version++;
    this.cache.clear();
    const alteracoes: Alteracao[] = [];
    for (const { col, id } of tocados.values()) {
      const rec = col === 'config' ? this.config : ((mapas[col].get(id) as Base | undefined) ?? null);
      alteracoes.push({ col, id, rec });
    }
    this.persistir(alteracoes);
    this.notificar();
    return resultado;
  }

  private persistir(alteracoes: Alteracao[]) {
    if (!this.adaptador) {
      this.aoGravar?.(alteracoes);
      return;
    }
    const a = this.adaptador;
    this.fila = this.fila
      .then(() => a.gravar(alteracoes))
      .then(() => this.aoGravar?.(alteracoes))
      .catch((e) => {
        console.error('Falha ao salvar', e);
        this.aoErro?.(e);
      });
  }

  /** Aguarda as gravações pendentes (útil antes de exportar). */
  async aguardarGravacoes(): Promise<void> {
    await this.fila;
  }
}

/** Banco único do app. */
export const db = new Store();
