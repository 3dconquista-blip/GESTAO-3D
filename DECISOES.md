# Decisões do projeto 3D gestão (antigo OCTA)

Registro das escolhas feitas onde a especificação não define, ou deixa a critério da plataforma
(regra da seção 1: "escolha a solução mais simples que funcione e registre a decisão").

## Plataforma e tecnologia

1. **Onde mora o app.** Em `octa/`, dentro do repositório do painel financeiro (é o repositório desta sessão).
   É independente do painel: tem seu próprio `index.html`, manifest e service worker com escopo `octa/`.
   Pode ser movido para um repositório próprio sem mudanças.
2. **Stack.** Preact + TypeScript + esbuild, CSS próprio e gráficos em SVG próprios, no lugar de
   React + Tailwind + shadcn/ui + Recharts. Motivos: o projeto fica no Google Drive (milhares de arquivos de
   `node_modules` sincronizando é inviável), o repositório é de HTML/CSS/JS puro publicado como site estático,
   e o app precisa abrir rápido no celular e funcionar offline. O bundle inteiro fica em poucas dezenas de KB.
   As ferramentas de build ficam fora do Drive (`npm run setup`) e o Preact fica copiado em `vendor/`.
3. **Build publicado.** `dist/` e `sw.js` são gerados por `node scripts/build.mjs` e versionados no Git, para o
   app funcionar direto no GitHub Pages sem etapa de CI.
4. **Testes.** `node --test` nativo do Node 24 (roda TypeScript sem dependências). Os exemplos A–G da seção 15
   são testes automatizados.

## Dados

5. **Armazenamento.** Local-first: os dados ficam no IndexedDB do aparelho e o app funciona offline.
   Sem nuvem configurada, aparece o aviso fixo "Seus dados estão só neste aparelho. Faça backup." com exportar
   e importar backup. A sincronização na nuvem (login por e-mail e senha, dados protegidos por usuário com
   Row Level Security) é opcional e usa um projeto Supabase do próprio dono — ver `NUVEM.md`.
6. **Tabelas filhas embutidas.** `produto_mesas`, `mesa_filamentos`, `produto_componentes`, `mix_parceiro`,
   `parceiro_percentuais`, `acerto_itens`, `pedido_itens`, `pedido_historico` e `venda_itens` ficam dentro do
   registro pai (listas). Assim cada gravação é atômica e o backup é simples.
7. **Locais.** Não há coleção `locais`: o local é o texto `'casa'` ou `'p:<id do parceiro>'` (um local automático
   por parceiro, como pede a seção 7.2).
8. **Arredondamento.** "Metade para cima" usa deslocamento decimal em texto (evita 4,485 × 100 = 448,4999…).
   Para valores negativos, o arredondamento é simétrico (afasta do zero).
9. **Rascunho do acerto** fica só no aparelho (localStorage), como pede a seção 5. Não vai para o backup nem para
   a nuvem; o acerto concluído vai.
10. **Dados de exemplo.** Ao carregar, os parâmetros de custo atuais são guardados e trocados pelos do Exemplo A;
    "Apagar dados de exemplo" remove só registros marcados como exemplo e restaura os parâmetros.

## Regras de negócio

11. **Margem do produto na lista** = a menor margem entre os canais ativos com o preço de etiqueta. Vermelho se
    algum canal dá prejuízo ou fica abaixo da margem mínima; amarelo se fica abaixo da margem desejada.
12. **Crédito do cliente** é calculado (não gravado): soma do que cada pedido não cancelado recebeu acima do total.
13. **Venda rápida gera pagamento** (origem 'venda'), para o "Dinheiro que entrou no mês" incluir as vendas diretas.
14. **Entrega de pedido** baixa os itens de catálogo com movimento `venda_direta` e referência ao pedido.
15. **Linhas opcionais das mensagens** ("se houver"): linha cujo valor de variável está vazio é removida.
16. **Service worker** não é registrado em `localhost` (evita cache durante o desenvolvimento).

## Etapa 1 — base e precificação

17. **Assistente de primeiro acesso.** O saldo de cada filamento informado vira um ajuste "Saldo inicial"
    (não é compra, porque não houve pagamento registrado). Linhas de filamento sem cor são ignoradas, então
    os passos 2 e 3 podem ser pulados. Sem nome do recebedor do PIX, usa-se o nome da empresa.
18. **Produto sem preço de etiqueta** é salvo com a etiqueta sugerida (maior preço sugerido entre os canais
    ativos). Uma categoria digitada que ainda não existe é adicionada à lista.
19. **Impressoras** não são apagadas nem arquivadas: são desativadas. Somem da escolha nas fichas novas, mas os
    produtos que já as usam continuam com custo.
20. **Precisão do simulador.** Os preços sugeridos usam o custo com precisão total (2,48733...), como no
    Exemplo A (preço exato 4,9747). A tabela do simulador mostra o custo arredondado; os centavos não mudam.
21. **Dados de exemplo da Etapa 1:** parâmetros do Exemplo A, impressoras "A1 mini (exemplo)" e "A1 (exemplo)",
    PLA Preto/Rosa/Vermelho/Cinza/Branco (R$ 100,00/kg, 1.000 g cada, comprados em 01/09/2026), 100 argolas e
    100 saquinhos, e os produtos Kettlebell Preto e Rosa (R$ 15,00), Anilha Vermelha e Halter Cinza (R$ 12,00)
    com a ficha do Exemplo A, e Display PIX (R$ 35,00) com 2 mesas. A ficha do Display PIX não está na
    especificação; foi definida assim: placa (1 por mesa, 2 h, 45 g PLA Preto) e suporte (2 por mesa, 1 h 30,
    30 g PLA Branco), 1 saquinho e 5 min de mão de obra. As próximas etapas acrescentam produção, parceiros,
    cliente e pedido: para vê-los, apague e carregue o exemplo de novo.
22. **Apagar dados de exemplo** avisa quando produtos do dono usam impressoras ou materiais de exemplo
    (eles ficariam sem custo até trocar na ficha técnica).
23. **Backup** (exportar e importar JSON) já está em Configurações > Dados desde a Etapa 1, por causa do aviso
    de dados só no aparelho. A exportação em CSV dos relatórios entra na Etapa 5.
24. **Botão "+"** fica escondido nas telas de formulário que têm barra de "Salvar" fixa, para não cobrir o botão.

## Etapa 2 — estoque e produção

25. **Venda rápida.** Lucro estimado = total − taxa do cartão − imposto − custo do momento. A taxa do cartão incide
    sobre o total já com desconto; desconto em % é arredondado com metade para cima e nunca passa do subtotal.
    "Cliente avulso" é o padrão. Vender mais do que há em Casa é permitido com aviso (o saldo fica negativo).
26. **Cancelar venda** lança o estorno das saídas (os itens voltam para Casa) e um pagamento de devolução; a venda
    continua no histórico marcada como cancelada.
27. **Estornar produção** tira de Casa as peças que ela colocou e devolve os materiais. Se Casa já não tem essas
    peças (foram vendidas ou remetidas), o estorno é recusado e o dono corrige com um ajuste de inventário.
28. **Estorno manual** (Movimentações e detalhe do material) só vale para ajustes, perdas e compras lançados à mão.
    Os demais lançamentos são desfeitos pelo próprio fluxo: cancelar venda, estornar produção, reabrir acerto.
    Estornar uma compra desfaz o efeito dela no custo médio.
29. **Compra de material**: filamento em kg (vira gramas no saldo), insumo em unidades. O custo médio usa o saldo de
    antes da compra; com saldo zero ou negativo vale o custo da compra (7.3).
30. **"Pesei o carretel"**: gramas restantes = peso na balança − carretel vazio (nunca menos que zero); o ajuste
    lançado é a diferença para o saldo do sistema.
31. **"O que imprimir"**: a necessidade é arredondada para cima (a reposição prevista é uma média). O filamento
    necessário é o das mesas inteiras que serão impressas (mesas × gramas da mesa), como o tempo total. Ordem:
    falta para pedidos aprovados, sem estoque em Casa, abaixo do mínimo, só reposição dos parceiros.
32. **Alerta "sem venda há 60 dias"** só aparece para produtos com peças em estoque; conta desde a última venda
    (direta ou no parceiro) ou, sem venda, desde o cadastro/primeiro movimento.
33. **Saldo de filamento** é sempre mostrado em gramas ("1.744 g"); kg só nos relatórios de consumo.
34. **Dados de exemplo da Etapa 2**: a produção do Exemplo G em 15/10/2026 (2 mesas de 8 Kettlebell Preto, 1 perdida).

## Etapa 3 — parceiros e acertos

35. **Datas da visita.** A data da visita fica no passo 1 (padrão: hoje) e define o período e o próximo acerto;
    a data do pagamento fica no passo 5.
36. **Contagem desatualizada.** Se o estoque do parceiro mudar depois de começar a contagem (ex.: reposição avulsa
    em outro aparelho), o acerto não conclui até "Atualizar" a contagem — evita vender o que não estava lá.
37. **Pagamento na visita** não pode passar do "Total a receber hoje" (valor do acerto + pendências). Pagamento a mais
    não vira crédito automático; se precisar, registre a diferença como recebimento depois.
38. **Pendência vencida** = valor em aberto de acerto com data anterior a hoje (não foi pago por inteiro no dia).
    Pagamentos — na visita ou em "Receber pendência" — abatem primeiro o acerto mais antigo.
39. **Reabrir acerto**: estorna as movimentações (com a data de hoje) e os pagamentos (com a data do pagamento
    original, para os dois se anularem nas contas por data), marca o acerto como estornado e devolve o rascunho
    ao aparelho no passo 3. Produtos que entraram no mix nesse acerto continuam no mix.
40. **Produto novo no expositor** (item encontrado ou incluído na reposição) entra no mix ao concluir o acerto.
41. **Agenda**: "último valor" = sua parte do último acerto. Desempenho: sua parte por mês = Σ sua parte ÷ Σ dias × 30;
    o ranking usa os 3 últimos acertos de cada parceiro. Retorno do expositor = (Σ sua parte − imposto − custo das
    peças vendidas, avariadas e abonadas) ÷ custo dos expositores que estão no parceiro.
42. **Acerto final** (encerrar parceria): o que está bom é recolhido automaticamente e não há reposição; depois do
    acerto final a tela segue para "Encerrar parceria", que devolve os expositores para Casa.
43. **Instalação**: o expositor é opcional; produtos que não estavam no mix entram com nível ideal = quantidade
    levada; ao instalar, o app abre o Termo de consignação para imprimir ou enviar.
44. **Mudar a divisão** pela edição do parceiro registra a nova divisão com vigência a partir de hoje: o acerto em
    andamento usa a divisão de quando o ciclo começou e a nova vale a partir do próximo. O app lembra de reimprimir
    o termo.
45. **Dados de exemplo da Etapa 3**: produção em setembro para abastecer os expositores; EXP-01 (R$ 60,00) e EXP-02
    (R$ 80,00); Academia Alfa (responsável Carlos) instalada em 16/09 com 10, 8 e 6, e acerto anterior em 01/10
    (vendeu 4 Kettlebell e 2 Anilhas, nenhum Halter; pago R$ 58,80 no PIX; repôs para 10, 8 e 6); Loja Beta
    (responsável Fernanda) instalada em 16/09 com 12 e 3. A visita dos Exemplos B e C é em 16/10/2026.

## Etapa 4 — pedidos e clientes

46. **Etapas só avançam.** Pular etapas (ex.: arrastar no Kanban de Orçamento para Pronto) aplica os efeitos das
    etapas do meio, na ordem. Voltar não existe: para desistir, cancela-se o pedido. O botão "Avançar" vai uma
    etapa por vez; no computador também dá para arrastar o cartão para a coluna seguinte.
47. **Aprovar exige** registrar o sinal ou "dispensar sinal" com motivo (a menos que já exista pagamento).
48. **Valor final editável**: o total digitado fica no pedido até alguém mudar o que muda o cálculo; vazio volta ao
    total calculado. Toda mudança de valor grava "Valor alterado de R$ X para R$ Y" no histórico.
49. **Precisão do orçamento**: cada item guarda também o custo com precisão total, para o preço de produção bater ao
    centavo com o Exemplo D (38,83666… ÷ 0,5 = 77,6733) mesmo depois de gravado.
50. **Itens de catálogo** ficam reservados em Casa da aprovação até a entrega (entram em "O que imprimir" quando
    faltam) e saem de Casa na entrega como venda direta ligada ao pedido; podem deixar o saldo negativo, com aviso.
51. **Itens não mudam depois de "Pronto"**, porque os materiais já foram baixados.
52. **Cancelamento**: o que já foi pago é retido, devolvido inteiro ou em parte (pagamento de devolução); o material
    gasto continua baixado. Pagamentos lançados errado são corrigidos por estorno (o original fica no histórico).
53. **Crédito do cliente** = o que um pedido recebeu acima do total; aparece no pedido e na ficha do cliente.
54. **"Excluir dados do cliente"** troca o nome por "Cliente removido" + código, apaga contatos, endereço,
    aniversário e observações, desliga as novidades e arquiva. Pedidos e vendas continuam, com os totais.
55. **Mensagens**: cada informação opcional (frete, saldo, PIX) fica numa linha própria do modelo, porque a linha
    com variável vazia some — sem chave PIX cadastrada, a mensagem continua com o saldo.
56. **Dados de exemplo da Etapa 4**: cliente Marina e o pedido #0001 (Exemplo D) em "Orçamento", criado em
    16/10/2026 com prazo 30/10/2026. Para a produção de setembro que abastece os expositores, o exemplo compra mais
    100 argolas e 100 saquinhos (mesmo preço) em 08/09/2026.
57. **Banco no navegador**: o app libera a conexão quando outra aba precisa atualizar ou apagar o banco, para nunca
    ficar parado em "Abrindo o OCTA...".

## Etapa 5 — início, relatórios e backup

58. **Cada real de receita entra uma vez, por um canal só**: venda direta = total − taxa do cartão, na data da venda;
    parceiros = "sua parte" dos acertos concluídos, na data do acerto; pedidos = total − frete − taxas de cartão dos
    pagamentos do pedido, na data de entrega. Pagamentos (sinal, saldo, acerto pago, venda) e movimentações de estoque
    nunca geram receita: são caixa e quantidade. Assim o sinal de um pedido não soma de novo quando ele é entregue.
59. **Custo dos produtos vendidos** vem das fotografias: custo do item na venda e no acerto; no pedido, custo de
    produção + modelagem (igual ao lucro do Exemplo D, R$ 39,06).
60. **Impostos** = receita × imposto % da configuração atual (o "percentual simples" da seção 17), arredondado por
    canal.
61. **Perdas** = produtos com movimentação "perda" (avaria, falta abonada, defeito, brinde, uso próprio) pelo custo do
    momento + expositores marcados como perdidos (pelo custo, na data em que foram perdidos) + materiais com perda.
    Falhas de impressão não entram (já estão no custo pela taxa de falha).
62. **Custos fixos** entram inteiros em cada mês completo; num período parcial (quinzena, personalizado) entram
    proporcionais aos dias: 1 a 15/10 com R$ 82,05 = R$ 39,70. O Início usa o mês inteiro, mesmo antes de o mês acabar.
63. **Venda cancelada** sai da receita do mês em que foi feita; o estorno do pagamento desconta do "dinheiro que
    entrou" na data do cancelamento.
64. **Pedido cancelado com valor retido**: o que o dono ficou (pago − devolvido − taxas) entra como receita de
    "Pedidos" na data do cancelamento, sem custo de produto; o material já baixado para ele vira perda nessa data.
65. **"Dinheiro que entrou"** = pagamentos recebidos no período, pela data do pagamento, menos estornos e devoluções
    a clientes, mais o "recebido no seu PIX" no expositor dos acertos do período (o cliente pagou direto ao dono).
    Repasses a parceiros aparecem à parte, fora do total.
66. **Total a receber** (Início) = pendências dos parceiros + saldo dos pedidos aprovados, em produção, prontos e
    entregues. Orçamentos não entram.
67. **Produtos parados** (Relatórios) = com peças em Casa ou nos parceiros e nenhuma venda no período. O alerta de
    estoque "sem venda há 60 dias" continua igual.
68. **Retorno do expositor** = lucro acumulado no parceiro até o fim do período (sua parte − impostos − custo dos
    vendidos) ÷ custo dos expositores que estão com ele.
69. **Comparação com o mês anterior** no Início: em % quando o mês anterior foi positivo; quando foi zero ou prejuízo,
    mostra o valor do mês anterior (porcentagem sobre zero ou sobre prejuízo não diz nada).
70. **Receita do ano e MEI**: amarelo acima de 80% do limite, vermelho acima do limite. A tabela por mês começa no
    primeiro mês com registros (antes disso só haveria custo fixo).
71. **CSV** no formato do Excel em português: separador ";", vírgula decimal sem separador de milhar, datas
    dd/mm/aaaa, BOM UTF-8 (acentos certos) e texto começando com = + - @ protegido com apóstrofo. Cada seção de
    Relatórios exporta o seu; Configurações > Dados exporta as planilhas de cadastros e lançamentos (vendas e acertos
    com uma linha por item).
72. **Backup**: o arquivo JSON leva configurações e todas as coleções; importar substitui tudo. O teste da Etapa 5
    exporta, zera o banco, importa e confere resultado de setembro e outubro, dinheiro que entrou, saldos de estoque
    e de material e todas as planilhas CSV.

## Melhorias de 19/10/2026

73. **Nome do app: "3D gestão"** (título, menu, assistente, manifesto, nomes de arquivo `3d-gestao-...`). Os
    identificadores internos continuam `octa` (banco no aparelho, campo `app` do backup, cache) para não perder
    dados nem invalidar backups antigos. Quem ainda tinha o nome padrão da empresa "OCTA" passa a ver "3D gestão".
74. **Sem impostos e sem MEI.** O contador cuida disso: o imposto saiu da configuração, do preço sugerido
    (preço = custo ÷ (1 − margem)), do orçamento de pedidos, do lucro da venda, do retorno do expositor e dos
    relatórios (resultado = receita − custo dos produtos vendidos − perdas − custos fixos). O limite e o alerta do
    MEI saíram do Início, dos Relatórios (a aba virou "Ano", com a receita mês a mês) e das Configurações. Isso
    substitui as partes da especificação sobre imposto e MEI (6.1, 9.2, 11.1 e 11.2). Com imposto 0% (como nos
    Exemplos A e D), os números não mudam.
75. **Copiar produto (um clique)**: cria outro produto com tudo igual (modelo, cor, categoria, foto, ficha técnica,
    preço, mínimo, margem, licença), nome `Nome "cópia"` (depois `"cópia 2"`, `"cópia 3"`...), código novo e estoque
    zerado, e abre a edição da cópia. Fica no detalhe do produto e no ícone de copiar de cada linha da lista.
76. **Excluir produto** (além de arquivar): o produto some de vez das listas, seleções, venda rápida e relatórios de
    produtos, e não dá para reativar nem editar. O registro fica guardado com a data da exclusão, então
    movimentações, vendas, acertos e pedidos antigos continuam mostrando o nome, com "(excluído)". Peças em Casa saem
    com um ajuste "Produto excluído" (não é perda); o produto sai do mix dos parceiros. Não deixa excluir enquanto
    houver peças em parceiros (recolher ou acertar antes) ou pedido em aberto com o produto.
77. **Peso do carretel vazio fixo em 170 g** em "Pesei o carretel" (gramas restantes = balança − 170 g). O campo
    saiu do cadastro de filamento; valores antigos gravados são ignorados.
78. **Margem de lucro por produto**: campo opcional no produto (vazio = margem padrão da configuração). Os preços
    sugeridos, a etiqueta sugerida, o simulador e a cor da margem do produto usam a margem dele. Se a margem do
    produto for menor que a "margem mínima de alerta", a mínima desce junto para esse produto (senão o próprio preço
    sugerido já nasceria vermelho). Pedidos personalizados continuam com a margem padrão.
79. **Edição em massa no Estoque > Produtos**: "Editar em massa" liga a seleção (marcar um a um ou todos os
    filtrados). Dá para mudar de uma vez a categoria, o estoque mínimo, a margem (definir ou voltar à padrão), o
    preço de etiqueta (mesmo valor, reajuste em % arredondado como os preços sugeridos, ou o sugerido de cada
    produto) e arquivar/reativar, com prévia dos preços; ou excluir os selecionados. É tudo ou nada: se um produto
    não puder ser alterado, nenhum é.
