# 3D gestão

Repositório GESTÃO 3D. App **3D gestão** (antigo OCTA): gestão de um negócio de impressão 3D feito por uma pessoa só. É um PWA em português, pensado primeiro
para o celular (visitas aos parceiros) e que aproveita a tela larga no computador.

Responde em segundos:

1. Quanto custa cada peça e por quanto vender em cada canal sem perder dinheiro?
2. Quanto tenho de cada produto em casa e em cada expositor?
3. Quanto cada parceiro vendeu, quanto tenho a receber e o que preciso repor?
4. Em que etapa está cada pedido personalizado e quanto falta receber?
5. O que preciso imprimir agora e tenho filamento para isso?

## O que tem

| Área | Recursos |
|---|---|
| Precificação | Parâmetros de custo, impressoras, materiais, ficha técnica com mesas e filamentos, custo por peça, margem de lucro por produto, preço por canal, simulador e calculadora rápida |
| Estoque e produção | Casa e expositores, movimentações, compra com custo médio, "pesei o carretel" (carretel vazio de 170 g), registrar produção, venda rápida, alertas, "O que imprimir", copiar produto com um clique, excluir produto (o histórico fica) e edição em massa |
| Parceiros (consignação) | Expositores, mix, instalação, reposição, visita de acerto em 5 passos com rascunho salvo, comprovante por WhatsApp, pendências, agenda, desempenho e termo de consignação |
| Pedidos e clientes | Orçamento, Kanban de etapas, sinal e saldo, cancelamento, mensagens de WhatsApp, ficha do cliente |
| Início e relatórios | Painel do dia e do mês, relatórios por período (canal, produto, parceiro, materiais, dinheiro que entrou, receita do ano), CSV para o Excel. Sem impostos nem MEI: isso fica com o contador |
| Dados | Backup e restauração em JSON, exportação CSV, dados de exemplo, sincronização opcional na nuvem (Supabase) |

Dinheiro é sempre calculado em centavos; os exemplos A a G da especificação batem ao centavo e estão cobertos por
testes automatizados.

## Como rodar

Precisa do [Node.js](https://nodejs.org/) 24 ou mais novo. Não há `node_modules` no projeto: o Preact está em
`vendor/preact` e as ferramentas de build ficam fora da pasta (útil quando o projeto está no Google Drive).

```bash
npm run setup     # só na primeira vez: instala esbuild e typescript em %LOCALAPPDATA%/octa-dev
npm run build     # gera dist/app.js, dist/app.css e sw.js
npm run serve     # abre em http://localhost:5180/
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run dev` | Build contínuo enquanto você edita |
| `npm run check` | Checagem de tipos (TypeScript) |
| `npm test` | Testes (Node com TypeScript nativo) |
| `npm run verify` | Tipos + testes + build |

Para conhecer o app, abra **Mais > Configurações > Dados > Carregar dados de exemplo** (ou o botão no assistente de
primeiro acesso).

## Publicar

O app é estático: `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` e `dist/` (já gerado e versionado). Pode ser
servido por qualquer hospedagem estática com HTTPS, como o GitHub Pages. Os dados ficam no aparelho (IndexedDB); para
usar em mais de um aparelho, veja `NUVEM.md` ou use backup e restauração.

## Documentos

- `ESPECIFICACAO.md` — especificação completa do produto
- `DECISOES.md` — decisões tomadas onde a especificação não define
- `CONVENCOES.md` — organização do código, regras e comandos
- `NUVEM.md` — como ligar a sincronização com o Supabase
- `CHANGELOG.md` — versões
