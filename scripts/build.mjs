// Build do app: src/main.tsx -> dist/app.js + dist/app.css, e gera sw.js com a versão do build.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, requireTool } from './tools.mjs';

const esbuild = requireTool('esbuild');
const watch = process.argv.includes('--watch');

const options = {
  absWorkingDir: ROOT,
  entryPoints: { app: 'src/main.tsx' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  nodePaths: [join(ROOT, 'vendor')],
  minify: !watch,
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  plugins: [
    {
      name: 'sw-version',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length) return;
          const js = readFileSync(join(ROOT, 'dist', 'app.js'));
          const css = readFileSync(join(ROOT, 'dist', 'app.css'));
          const hash = createHash('sha1').update(js).update(css).digest('hex').slice(0, 10);
          const tpl = readFileSync(join(ROOT, 'scripts', 'sw.template.js'), 'utf8');
          writeFileSync(join(ROOT, 'sw.js'), tpl.replace('__BUILD__', hash));
        });
      },
    },
  ],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Observando alterações...');
} else {
  await esbuild.build(options);
}
