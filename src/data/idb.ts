// Adaptador IndexedDB: guarda cada registro como { k: 'colecao/id', col, rec }.
import type { Adaptador, Alteracao, Snapshot } from './db.ts';
import type { Base, Config, NomeColecao } from './types.ts';

const NOME = 'octa';
const VERSAO = 1;
const STORE = 'registros';

let aoFecharConexao: (() => void) | null = null;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const banco = req.result;
      if (!banco.objectStoreNames.contains(STORE)) banco.createObjectStore(STORE, { keyPath: 'k' });
    };
    req.onsuccess = () => {
      // Outra aba (ou uma versão nova do app) precisa atualizar ou apagar o banco: libera a conexão
      // para não travar quem pediu. A próxima gravação reabre.
      req.result.onversionchange = () => {
        req.result.close();
        aoFecharConexao?.();
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

function concluir(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function criarAdaptadorIDB(): Adaptador {
  let conexao: Promise<IDBDatabase> | null = null;
  aoFecharConexao = () => {
    conexao = null;
  };
  const banco = () => (conexao ??= abrir());

  return {
    async carregar(): Promise<Snapshot> {
      const b = await banco();
      const tx = b.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      const linhas: { k: string; col: string; rec: Base }[] = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const snap: Snapshot = { config: null, colecoes: {} };
      for (const l of linhas) {
        if (l.col === 'config') snap.config = l.rec as Config;
        else (snap.colecoes[l.col as NomeColecao] ??= []).push(l.rec);
      }
      return snap;
    },
    async gravar(alteracoes: Alteracao[]) {
      const b = await banco();
      const tx = b.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const a of alteracoes) {
        const k = `${a.col}/${a.id}`;
        if (a.rec) st.put({ k, col: a.col, rec: a.rec });
        else st.delete(k);
      }
      await concluir(tx);
    },
    async limpar() {
      const b = await banco();
      const tx = b.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await concluir(tx);
    },
  };
}
