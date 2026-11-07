# Changelog - GESTÃO 3D

Todas as versões significativas são documentadas aqui.
Formato: [vX.Y.Z] - AAAA-MM-DD

---

## [v2.4.0] - 2026-11-06

Nenhuma mudança regrava os dados que já existem (produtos, estoque, vendas, parceiros).

### Adicionado
- Tela "Outros custos e despesas" (Mais e menu lateral). Mostra o total do mês, mês a mês, com a lista e "Desfazer".
  Ao lançar, há atalhos para entregador, gasolina, embalagem e anúncio. Tudo entra no lucro do mês
- Cadastro de produto com a quantidade em Casa: as peças entram como "Estoque inicial (cadastro)", sem gastar filamento
- "Novo produto" no botão "+"
- Estoque > Produtos mostra peças e valor pelo preço de venda em Casa e nos parceiros (com o preço de cada parceiro),
  com o custo em letra menor

### Mudado
- Sai o custo fixo do MEI (R$ 82,05) do lucro do mês. O padrão passa a ser R$ 0, e um valor digitado pelo dono continua
- Gramas por peça saem do cadastro e ficam opcionais em "Mais detalhes". Sem elas, a produção não baixa filamento
- "Gastos avulsos" passam a se chamar "Outros custos e despesas" no Início, nos relatórios e no CSV
- No celular, o título da página não fica mais espremido pelos botões
- Decisões 110 a 113; 375 testes

---

## [v2.3.0] - 2026-11-02

### Mudado
- O app abre só na tela de login (e-mail e senha). O assistente de primeiro acesso ("Bem-vindo", 2 passos, dados de
  exemplo) saiu. No primeiro login o app abre vazio no Início. Dados de exemplo e backup continuam em
  Configurações > Dados
- O servidor (URL e chave pública do Supabase) vem do novo arquivo `nuvem.json`, editável no próprio GitHub. Vazio,
  a tela de login pede a URL e a chave uma vez por aparelho. A chave secreta é recusada
- Sem login o app não abre: saem "Usar só neste aparelho" (login) e "Desligar a nuvem" (Configurações). Com o
  `nuvem.json` preenchido, a tela de login não mostra "Trocar servidor"
- `NUVEM.md`, `PUBLICAR.md` (Partes C e D), `README.md` e decisão 109 atualizados; 369 testes

---

## [v2.2.2] - 2026-10-23

### Corrigido
- Deploy na Vercel falhava com "Ferramentas não encontradas. Rode: npm run setup": `"buildCommand": null` no
  `vercel.json` não desliga o build (a Vercel volta a rodar `npm run build`). Agora a instalação e o build viram
  `echo` e a Vercel só publica os arquivos. Reproduzido e testado com o programa da Vercel (65.1.0)
- `PUBLICAR.md` (Parte A2) e decisão 108 atualizados com isso

---

## [v2.2.1] - 2026-10-23

### Adicionado
- Publicação na Vercel: `vercel.json` manda publicar os arquivos como estão (sem instalar nada e sem rodar o build,
  que só funciona no computador do dono). Passo a passo em `PUBLICAR.md` (Parte A2)

### Corrigido
- Ícones PNG que o app pedia e não existiam (`octa-180.png`, `octa-192.png` e `octa-512.png`): o ícone na tela de
  início do iPhone, a instalação no Android e os ícones dos atalhos apontavam para arquivos ausentes

---

## [v2.2.0] - 2026-10-23

Cadastro de produto rápido e a conta detalhada numa Calculadora à parte (decisão 107).

### Adicionado
- Calculadora de custo (aba do Estoque, Mais e menu lateral): mesas, peças por mesa, tempo, impressora, gramas, tipo,
  insumos e mão de obra, ou "Importar do fatiador". Mostra custo, gramas e tempo por peça e manda o resultado para um
  produto novo ("Criar produto com este custo") ou existente ("Usar"). A conta fica guardada no aparelho

### Alterado
- Cadastro de produto só com nome, custo por peça, gramas de filamento por peça e preço (com o sugerido). Categoria,
  mínimo, margem, foto, tempo, insumos, licença e preço por canal ficam em "Mais detalhes"
- O custo digitado vale em todo o app (preço sugerido, margens, produção, pedidos, acertos e relatórios); produtos
  antigos com ficha detalhada continuam calculando pela ficha até o custo ou as gramas mudarem
- Produção e "O que imprimir" falam em peças (não em mesas) para os produtos com custo da Calculadora

---

## [v2.1.0] - 2026-10-21

Menos digitação no dia a dia (decisões 102 a 106).

### Adicionado
- "Importar do fatiador" no cadastro do produto e na peça personalizada do pedido: lê o .3mf fatiado (Bambu
  Studio/OrcaSlicer) ou o .gcode (Bambu, Orca, PrusaSlicer, Cura) e preenche peças por mesa, tempo, gramas e tipo de
  filamento (e o nome, se estiver vazio)
- Estoque mínimo automático: produto sem mínimo usa o que vende direto em 15 dias (média dos últimos 30)
- "Imprimi" com um toque em "O que imprimir", com "Desfazer"
- Atalhos no ícone do app: Venda rápida, Registrar produção, O que imprimir e Fazer acerto
- Gastos avulsos (com o que foi e quanto custou), descontados do lucro, com atalhos das descrições recentes

### Alterado
- O aviso fixo "Faça backup" virou um lembrete semanal com "Baixar backup" em um toque e "Depois"

---

## [v2.0.0] - 2026-10-21

App simplificado pelo princípio de Pareto (80/20): cada tela mostra o que se usa quase sempre e o resto fica em
"Mais detalhes". Registrar produção, compra, venda, pagamento, acerto e remessa não abre mais janela de confirmação:
o aviso traz "Desfazer". Os dados já gravados continuam valendo (decisões 85 a 101).

### Alterado
- Produto sem cor fixa: a ficha guarda o tipo do filamento (PLA, PETG...) e as gramas; a cor é escolhida em cada
  produção, com botões de cor já marcando a última usada. O custo usa a média do kg dos carretéis do tipo, e o estoque
  do produto não separa por cor. "O que imprimir" soma o filamento por tipo (todas as cores)
- Cadastro de produto em um cartão (nome, peças por mesa, tempo, gramas e preço); filamento só com tipo, cor, custo do
  kg e quanto tem; compra de material cadastra uma cor nova na hora
- Venda rápida em 3 toques (produtos, forma de pagamento e Registrar), com "Desfazer" que devolve o carrinho
- Pedidos: "Aprovado" e "Em produção" viraram uma etapa só; peça personalizada só com descrição, quantidade, tempo,
  gramas e tipo, e a cor escolhida ao passar para "Pronto"; título automático; formulário e detalhe enxutos
- Cliente só com nome e WhatsApp à vista
- Parceiros: uma tela só no lugar das 3 abas; cadastro em 6 campos; "Levar peças" faz a instalação e a reposição;
  acerto em 3 passos (Contagem, Reposição e Fechar), e o acerto final já encerra a parceria; expositor só com o custo
- Início mostra o que fazer hoje numa lista só, mais a receita e o lucro do mês
- Relatórios em 3 abas (Resultado, Vendas e Materiais) e Configurações em 5 seções
- Primeiro acesso em 2 passos (empresa e impressora, depois filamentos)

### Adicionado
- App publicado na internet pelo GitHub Pages, com dados no Supabase (passo a passo em `PUBLICAR.md`)
- "Entrar na minha conta" no primeiro acesso e link para configurar outro aparelho em Configurações > Dados

### Removido
- Calculadora e Simulador de preço (o preço por canal fica no produto e a cotação avulsa é o orçamento do pedido)
- Campos "Modelo" e "Cor" do produto, "Duplicar para outra cor", checklist do pedido e a aba Movimentações do Estoque
  (continua como link na lista de produtos)

### Corrigido
- Sincronização na nuvem: um aparelho novo não sobrescreve mais os dados da nuvem (busca antes de enviar, e o banco
  recusa gravar uma versão mais velha por cima de uma mais nova)
- Itens de catálogo em pedidos eram gravados sem o custo do filamento
- Tocar no texto de um campo com botões (forma de pagamento, cores, contador) mudava o valor sem querer
- Ao ir de "editar pedido" direto para "novo pedido", o formulário herdava os dados anteriores

---

## [v1.1.0] - 2026-10-19

### Adicionado
- Copiar produto com um clique: cópia com `"cópia"` no nome (depois `"cópia 2"`...), mesmos dados, código novo e
  estoque zerado (ícone em cada linha da lista e botão no detalhe)
- Excluir produto (além de arquivar): some das listas e não volta; o histórico continua mostrando "(excluído)".
  Peças em Casa saem com ajuste "Produto excluído"; bloqueado se houver peças em parceiros ou pedido em aberto
- Margem de lucro por produto: preços sugeridos, simulador e cor da margem usam a margem do produto
- Edição em massa no Estoque > Produtos: categoria, estoque mínimo, margem, preço (mesmo valor, reajuste % ou
  sugerido), arquivar/reativar e excluir, com prévia dos preços

### Alterado
- Nome do app: "3D gestão" (identificadores internos continuam `octa`; backups antigos seguem valendo)
- Peso do carretel vazio fixo em 170 g em "Pesei o carretel"; o campo saiu do cadastro de filamento

### Removido
- Impostos e limite do MEI: fora da configuração, do preço sugerido, dos pedidos, das vendas e dos relatórios
  (a aba "Ano e MEI" virou "Ano")

### Corrigido
- Formulário de produto: campos da mesa espremidos e tabela de preços fazendo a página rolar para o lado

---

## [v1.0.1] - 2026-10-18

### Documentação
- `CLAUDE.md` com as instruções do projeto: fluxo de salvar no GitHub ("salve"), comandos, arquivos principais e
  regras essenciais do código
- `.claude/launch.json` com o servidor local (http://localhost:5180/) para o preview do Claude

---

## [v1.0.0] - 2026-10-18

Primeira versão do app OCTA, construída em 5 etapas a partir de `ESPECIFICACAO.md`.

### Adicionado
- Etapa 1 - Precificação: assistente de primeiro acesso, configurações, impressoras, materiais, produtos com ficha
  técnica, custo por peça, preço por canal, simulador e calculadora rápida (Exemplo A)
- Etapa 2 - Estoque: locais e movimentações, compra de material com custo médio, registrar produção, venda rápida,
  alertas e "O que imprimir" (Exemplo G)
- Etapa 3 - Parceiros: expositores, mix, instalação, reposição avulsa, visita de acerto em 5 passos, comprovante,
  pendências, agenda, desempenho e termo de consignação (Exemplos B, C, E e F)
- Etapa 4 - Pedidos e clientes: orçamento, Kanban de etapas, sinal e saldo, cancelamento, mensagens de WhatsApp e
  ficha do cliente (Exemplo D)
- Etapa 5 - Início, relatórios e backup: painel do dia e do mês, relatórios por período, CSV para o Excel, backup e
  restauração (resultado do mês sem contar nada duas vezes; backup importado num banco vazio reproduz os números)
- Dados de exemplo com os Exemplos A a G, sincronização opcional na nuvem (Supabase) e 298 testes automatizados
