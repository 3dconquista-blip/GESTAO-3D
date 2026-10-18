# GESTÃO 3D (app OCTA) - Instruções do Projeto

PWA em português para um negócio de impressão 3D: precificação, estoque e produção, parceiros em consignação
(acertos), pedidos personalizados, relatórios, CSV e backup. A especificação completa está em `ESPECIFICACAO.md`.

## Repositório GitHub
- URL: https://github.com/exodus14-code/GESTAO-3D
- Branch principal: `main`
- Diretório local: `C:\Users\osmar\Projetos\GESTAO-3D`
- Mantenha o repositório **fora do Google Drive**: o Drive cria arquivos `desktop.ini` dentro do `.git` e o
  `git fetch`/`git pull` passam a falhar ("bad object refs/desktop.ini").

## Comando de salvar no GitHub

Quando o usuário disser **"salve"**, **"suba"** ou **"atualize no github"** (ou variações), você deve:

1. Perguntar qual foi a mudança principal (se não estiver claro no contexto)
2. Rodar `npm run verify` (tipos + testes + build). Se algo falhar, **não salve**: corrija ou avise o usuário.
   O build regenera `dist/` e `sw.js`, que são versionados, para o app publicado ficar igual ao código.
3. Determinar o tipo de versão:
   - **patch** (vX.Y.Z+1): correções de bug, ajustes pequenos
   - **minor** (vX.Y+1.0): novas funcionalidades
   - **major** (vX+1.0.0): mudanças grandes na estrutura ou nos dados salvos
4. Ler a versão atual no `CHANGELOG.md`
5. Atualizar o `CHANGELOG.md` com a nova versão e a descrição das mudanças, e o campo `"version"` do `package.json`
6. Se alguma regra nova foi decidida onde a especificação não define, registrar em `DECISOES.md`
7. Rodar os comandos git:
   ```
   git add -A
   git commit -m "tipo(escopo): descricao curta

   - detalhe 1
   - detalhe 2"
   git tag vX.Y.Z -m "versao X.Y.Z - descricao"
   git push origin main --tags
   ```
8. Confirmar o push bem-sucedido e informar a URL da versão:
   `https://github.com/exodus14-code/GESTAO-3D/releases/tag/vX.Y.Z`

Os avisos "LF will be replaced by CRLF" são normais no Windows. Depois de um build, o Git pode marcar `dist/` como
alterado só por quebra de linha; isso não muda nada no commit.

## Convenções de commit

- `feat:` nova funcionalidade
- `fix:` correção de bug
- `style:` mudanças visuais/CSS
- `refactor:` refatoração sem mudança funcional
- `docs:` documentação
- `test:` testes
- `chore:` manutenção geral

## Comandos

| Comando | O que faz |
|---|---|
| `npm run setup` | Só na primeira vez: instala esbuild e typescript em `%LOCALAPPDATA%\octa-dev` |
| `npm run build` | Gera `dist/app.js`, `dist/app.css` e `sw.js` |
| `npm run dev` | Build contínuo enquanto edita |
| `npm run serve` | Servidor local em http://localhost:5180/ |
| `npm run check` | Checagem de tipos |
| `npm test` | Testes (Node 24, TypeScript nativo) |
| `npm run verify` | Tipos + testes + build (use antes de salvar) |

## Arquivos principais

| Arquivo / pasta | Descrição |
|---|---|
| `index.html` | Página do app (carrega `dist/app.js` e `dist/app.css`) |
| `src/` | Código: `lib/`, `data/`, `domain/` (regras puras), `services/` (gravações), `ui/`, `app/`, `features/` |
| `dist/` | Build gerado e versionado (não edite à mão) |
| `sw.js` | Service Worker gerado de `scripts/sw.template.js` (não edite à mão) |
| `scripts/` | build, check, serve, setup |
| `vendor/preact` | Preact copiado (não há `node_modules` no projeto) |
| `ESPECIFICACAO.md` | Especificação do produto |
| `DECISOES.md` | Decisões tomadas onde a especificação não define |
| `CONVENCOES.md` | Regras de código detalhadas (leia antes de mexer) |
| `NUVEM.md` | Sincronização opcional com o Supabase |
| `CHANGELOG.md` | Versões |

## Regras essenciais (detalhes em `CONVENCOES.md`)

- Dinheiro de transações em **centavos inteiros**; custos em reais com até 4 casas. Nunca `Math.round(x * 100)`:
  use `toCents`, `ceilToCents`, `roundTo`, `pctOfCents` de `src/lib/money.ts`.
- Os Exemplos A a G da especificação precisam continuar batendo ao centavo (estão nos testes).
- `domain/` é puro (recebe dados por parâmetro); `services/` grava sempre dentro de `db.tx(...)`; nenhum dos dois
  importa `preact`, `ui/` ou `app/`.
- Imports relativos com extensão (`'../data/db.ts'`), tipos com `import type`, sem `enum`.
- Nada com histórico é apagado: cadastros são arquivados, lançamentos são estornados.
- Interface em português simples, celular primeiro; cores só pelos tokens de `src/styles/app.css`.

## Tecnologias

- TypeScript + Preact 10 (copiado em `vendor/`), empacotado com esbuild
- PWA (manifest + Service Worker), dados no aparelho com IndexedDB
- Sincronização opcional com Supabase (`NUVEM.md`)
- Testes com o runner nativo do Node 24
