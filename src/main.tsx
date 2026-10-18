// Ponto de entrada: abre o banco local, inicia a nuvem (se configurada) e desenha o app.
import { render } from 'preact';
import './styles/app.css';
import { App } from './app/App.tsx';
import { db } from './data/db.ts';
import { criarAdaptadorIDB } from './data/idb.ts';
import { iniciarNuvem } from './data/nuvem.ts';
import { avisar } from './ui/index.ts';

// Acesso para depuração no console do navegador: octa.db
(globalThis as unknown as { octa: unknown }).octa = { db };

async function iniciar() {
  const raiz = document.getElementById('app')!;
  render(<App />, raiz);
  db.aoErro = () => avisar('Não foi possível salvar no aparelho. Exporte um backup.', 'ruim');
  try {
    db.usarAdaptador(criarAdaptadorIDB());
    await db.iniciar();
  } catch (e) {
    console.error(e);
    db.usarAdaptador(null);
    await db.iniciar();
    avisar('Armazenamento do navegador indisponível: os dados não serão salvos.', 'ruim');
  }
  iniciarNuvem().catch((e) => console.error('Nuvem', e));
}

iniciar();

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/localhost|127\.0\.0\.1/.test(location.hostname)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
