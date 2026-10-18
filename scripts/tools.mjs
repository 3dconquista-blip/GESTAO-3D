// Localiza as ferramentas de build (esbuild e typescript).
// Elas ficam fora da pasta do projeto (que está no Google Drive) para não
// sincronizar milhares de arquivos de node_modules. Ordem de busca:
// 1) octa/node_modules  2) $OCTA_TOOLS  3) %LOCALAPPDATA%/octa-dev/node_modules  4) ~/.octa-dev/node_modules
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function toolsDir() {
  const candidates = [
    join(ROOT, 'node_modules'),
    process.env.OCTA_TOOLS,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'octa-dev', 'node_modules'),
    join(homedir(), '.octa-dev', 'node_modules'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'esbuild')) && existsSync(join(dir, 'typescript'))) return dir;
  }
  console.error('Ferramentas não encontradas. Rode: npm run setup');
  process.exit(1);
}

export function requireTool(name) {
  const req = createRequire(join(toolsDir(), 'noop.js'));
  return req(name);
}
