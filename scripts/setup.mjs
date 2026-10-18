// Instala esbuild e typescript fora do Google Drive (em %LOCALAPPDATA%/octa-dev).
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.env.OCTA_TOOLS
  ? join(process.env.OCTA_TOOLS, '..')
  : process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'octa-dev')
    : join(homedir(), '.octa-dev');

mkdirSync(base, { recursive: true });
if (!existsSync(join(base, 'package.json'))) {
  writeFileSync(join(base, 'package.json'), JSON.stringify({ name: 'octa-dev-tools', private: true }, null, 2));
}
execSync('npm install --no-audit --no-fund esbuild@0.28.2 typescript@5.9.3', { cwd: base, stdio: 'inherit' });
console.log(`Ferramentas instaladas em ${base}`);
