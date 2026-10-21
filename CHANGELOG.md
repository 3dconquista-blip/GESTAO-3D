# Changelog - GESTÃO 3D

Todas as versões significativas são documentadas aqui.
Formato: [vX.Y.Z] - AAAA-MM-DD

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
