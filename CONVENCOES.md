# OCTA — convenções do código

Leia antes de mexer no código. A especificação completa está em `ESPECIFICACAO.md`;
decisões tomadas onde a especificação não define estão em `DECISOES.md`.

## Comandos (rode de dentro de `octa/`)

| Comando | O que faz |
|---|---|
| `node scripts/check.mjs` | Checagem de tipos (tsc --noEmit). Precisa terminar sem erros. |
| `node --test "src/**/*.test.ts"` | Testes (Node 24, TypeScript nativo, sem dependências). |
| `node scripts/build.mjs` | Gera `dist/app.js`, `dist/app.css` e `sw.js`. |
| `node scripts/serve.mjs` | Servidor local em http://localhost:5180/ |
| `npm run setup` | Instala esbuild e typescript fora do Google Drive (só na primeira vez). |

As ferramentas (esbuild, typescript) ficam em `%LOCALAPPDATA%/octa-dev/node_modules`, fora do Drive.
O Preact está copiado em `vendor/preact` (sem node_modules no projeto).

## Pastas

```
src/
  lib/        utilidades puras: money.ts (centavos e arredondamento), format.ts (R$, datas, números BR), dates.ts, id.ts
  data/       types.ts (modelo), db.ts (banco), idb.ts (IndexedDB), selectors.ts (custos e saldos), defaults.ts,
              hooks.ts (useDb), local.ts (localStorage do aparelho), nuvem.ts (sincronização opcional)
  domain/     regras de negócio PURAS (sem db, sem interface) + testes *.test.ts
  services/   operações que gravam (sempre via db.tx) + testes
  ui/         kit de interface (importe de 'ui/index.ts')
  app/        casca, rotas (routes.tsx), roteador (router.ts)
  features/   telas por área: estoque, parceiros, pedidos, clientes, vendas, precos, relatorios, config, inicio, mais, onboarding, conta
  styles/     app.css (tokens e componentes base)
```

## Regras de TypeScript (obrigatórias)

- Imports relativos SEMPRE com extensão: `import { db } from '../data/db.ts'`, `'./Tela.tsx'`.
- Tipos com `import type { ... }` (ou `import { type X }`). O Node roda os testes removendo os tipos.
- Proibido: `enum`, `namespace`, propriedades no construtor (`constructor(private x)`), decorators.
- `domain/` e `services/` NUNCA importam `preact`, `ui/`, `data/hooks.ts`, `data/nuvem.ts`, `data/idb.ts` ou `app/`
  (os testes rodam no Node, sem navegador).
- `domain/` não importa `data/db.ts` nem `selectors.ts`: recebe os dados por parâmetro.

## Dinheiro, custos e datas

- Transações (vendas, acertos, pagamentos, preços de etiqueta, frete) em **centavos inteiros** (`Cents`).
- Custos unitários em **reais** (number) com até 4 casas: `round4()`. Arredonde para centavos só no resultado final,
  com `toCents()` (metade para cima). Percentual de centavos: `pctOfCents(bruto, 30)`.
- Percentuais são 0–100 (`margemDesejadaPct: 50`).
- Exibição: `formatBRL(cents)` → "R$ 1.234,56"; `formatReais(reais)`; `formatPct(83.42)` → "83,4%";
  `formatData('2026-10-16')` → "16/10/2026". Datas civis em 'YYYY-MM-DD' no fuso de Brasília: `hojeISO()`.
- Nunca use `Math.round(x * 100)` direto: use `toCents`, `ceilToCents`, `roundTo` de `lib/money.ts`.

## Banco

- Leitura: `db.all('produtos')`, `db.get('produtos', id)`, `db.config`. Derivados: `selectors.ts`
  (`custoProduto`, `saldoCasa`, `saldoNoParceiro`, `saldoMaterial`, `estoqueDoParceiro`, ...).
- Escrita: SEMPRE dentro de `db.tx((t) => { ... })`. Dentro da transação leia com `t.get`/`t.all`
  (veem o que já foi alterado na própria transação). Se lançar erro, nada é gravado.
- Estoque: use `lancarMov`, `estornarMov`, `saldoTx` de `services/estoque.ts`. O saldo é a soma das movimentações.
  Erros de regra: `throw new ErroNegocio('mensagem para o dono')`.
- Nada com histórico é apagado: cadastros têm `arquivado: true`; lançamentos são estornados (`estornoDe`).
  `t.remove` só para dados de exemplo e importação de backup.
- Fotografias: vendas, acertos, pedidos e movimentações guardam preço, custo e percentual do momento.
- `db.modoExemplo = true` faz todo `insert` ganhar `exemplo: true` (usado pelo carregador de exemplo).

## Interface

- Português do Brasil, linguagem simples, sem jargão contábil. Rótulos entre aspas na especificação são literais.
- Toda tela: `<Pagina titulo=... acoes={<Botao variante="primario">...}>`. Uma ação principal óbvia.
- Celular primeiro. Toques ≥ 44 px. Contagens com `<Numero stepper decimais={0} />`.
  Dinheiro com `<Dinheiro />` (centavos). Números com `<Numero />` (aceita vírgula).
- Antes de mexer em estoque ou dinheiro: `if (!(await confirmar({ titulo, itens: [resumo...] }))) return;`
- Depois: `avisar('Venda registrada')`. Erros: `catch (e) { avisar(e instanceof Error ? e.message : String(e), 'ruim') }`.
- Toda lista: `<Busca />` + `<Vazio titulo texto acao={{ rotulo, href }} />` quando vazia.
- Tabelas: `<Tabela colunas linhas chave />` (vira cartões no celular). Status: `<Selo tom="ok|atencao|ruim">`.
- Cores só pelos tokens de `styles/app.css`. Verde/amarelo/vermelho apenas para status.
- CSS de uma área: `src/features/<area>/<area>.css`, importado por um .tsx da área, com classes prefixadas pela área
  (ex.: `.acerto-linha`). Não edite `styles/app.css` sem necessidade.
- Telas recebem `TelaProps` (`params`, `query`). Navegação: `navegar('/pedidos/123')`, links `href="#/..."`,
  `<Botao href="/estoque/produtos/novo">`.
- Componentes: hooks do Preact (`useState`, `useMemo`, `useEffect` de 'preact/hooks'). Para redesenhar quando o banco
  muda, chame `useDb()` no topo da tela.
