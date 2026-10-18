// Checagem de tipos (tsc --noEmit) usando o typescript instalado fora do Drive.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, toolsDir } from './tools.mjs';

const tsc = join(toolsDir(), 'typescript', 'bin', 'tsc');
const res = spawnSync(process.execPath, [tsc, '-p', join(ROOT, 'tsconfig.json'), '--pretty', 'false'], {
  stdio: 'inherit',
  cwd: ROOT,
});
process.exit(res.status ?? 1);
