# Changelog - GESTÃO 3D

Todas as versões significativas são documentadas aqui.
Formato: [vX.Y.Z] - AAAA-MM-DD

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
