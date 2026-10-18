// Ganchos de interface para o banco.
import { useEffect, useState } from 'preact/hooks';
import { db, type Store } from './db.ts';

/** Devolve o banco e redesenha o componente sempre que algo mudar. */
export function useDb(): Store {
  const [, setV] = useState(db.version);
  useEffect(() => {
    const cancelar = db.subscribe(() => setV(db.version));
    // O banco pode ter mudado entre o primeiro desenho e a inscrição.
    setV(db.version);
    return cancelar;
  }, []);
  return db;
}
