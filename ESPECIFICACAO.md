# Sistema de gestão para negócio de impressão 3D — especificação para construção

## 1. Seu papel e como trabalhar

Você é um desenvolvedor full-stack sênior com olhar de designer de produto. Construa um web app de gestão enxuto, objetivo e fácil de usar para um pequeno negócio de impressão 3D. Este documento é a especificação completa.

Regras de trabalho:
- Siga a ordem da seção 15. Entregue cada etapa funcionando e confira os critérios de aceite antes de passar para a próxima.
- Se algo não estiver definido aqui, escolha a solução mais simples que funcione e registre a decisão num arquivo DECISOES.md.
- Não crie funções fora do escopo (seção 17).
- Toda a interface em português do Brasil, com linguagem simples, sem jargão contábil.
- Neste documento, "o dono" é a pessoa que usa o app. Textos entre aspas são rótulos da interface.

## 2. O negócio

- Nome: OCTA (editável nas Configurações). Logo: um polvo em azul-aço. Cores: azul-aço #2B4A6B (principal), azul-marinho #18283A (títulos e barras), fundo claro neutro. Verde, amarelo e vermelho só para status.
- O dono trabalha sozinho, com 1 ou 2 impressoras Bambu Lab (A1 e A1 mini) e o fatiador Bambu Studio.
- Produtos: chaveiros (kettlebell, anilha, halter e outros temas, muitos vendidos em academias), displays de QR Code PIX, decoração e peças sob encomenda.
- Canais de venda:
  1. Venda direta: WhatsApp, Instagram, presencial e feiras.
  2. Parcerias com expositores (consignação): o dono instala um expositor com produtos em academias, lojas e outros estabelecimentos. O parceiro não paga nada. Do total vendido no expositor, o dono fica com 70% e o parceiro com 30%, ou 80% e 20%, conforme o acordo. A cada 15 ou 30 dias o dono visita, conta o que sobrou, calcula o que vendeu, acerta os valores e repõe.
  3. Pedidos personalizados: o cliente pede algo sob medida, recebe orçamento, paga um sinal e depois o saldo.
- Uso: no celular durante as visitas e no computador em casa.

## 3. Perguntas que o app responde em segundos

1. Quanto custa cada peça e por quanto vender em cada canal sem perder dinheiro?
2. Quanto tenho de cada produto em casa e em cada expositor?
3. Quanto cada parceiro vendeu, quanto tenho a receber e o que preciso repor?
4. Em que etapa está cada pedido personalizado e quanto falta receber?
5. O que preciso imprimir agora e tenho filamento para isso?

## 4. Princípios obrigatórios de produto e interface

- Celular primeiro: tudo usável com uma mão. No computador, aproveite a largura com tabelas e painéis lado a lado.
- No celular, barra inferior com 5 itens: "Início", "Estoque", "Parceiros", "Pedidos", "Mais". No computador, menu lateral com os mesmos itens.
- Botão flutuante "+" com ações rápidas: "Venda rápida", "Registrar produção", "Iniciar acerto", "Novo pedido", "Compra de material".
- Cada tela tem uma ação principal óbvia. Formulários curtos: só o essencial é obrigatório e o resto vem com valor padrão.
- Campos numéricos abrem o teclado numérico, aceitam vírgula decimal e têm botões − e + grandes (mínimo 44 px) onde houver contagem.
- Dinheiro sempre como R$ 1.234,56. Datas como dd/mm/aaaa. Fuso de Brasília.
- Cores de status: verde = em dia, amarelo = atenção, vermelho = atrasado ou prejuízo.
- Nada com histórico é apagado: produtos, parceiros, expositores e clientes são arquivados. Lançamentos concluídos são corrigidos por estorno, que fica registrado.
- Antes de qualquer ação que mexe em estoque ou dinheiro, mostre um resumo do que vai acontecer e peça confirmação.
- Toda lista tem busca e estado vazio com explicação curta e botão para criar o primeiro item.
- Primeiro acesso: assistente de 3 passos (nome da empresa e chave PIX, impressoras, filamentos), com a opção "Carregar dados de exemplo".

### Mapa de telas

- "Início": painel do dia e do mês (seção 11).
- "Estoque": abas "Produtos", "Materiais", "O que imprimir" e "Movimentações". Detalhe do produto com dados, ficha técnica e custo, simulador de preço, saldo por local e histórico.
- "Parceiros": abas "Agenda de acertos", "Parceiros" e "Expositores". Detalhe do parceiro com dados, mix, saldo no expositor, acertos, pendências e desempenho. Ações: "Iniciar acerto", "Reposição avulsa", "Recolher", "Encerrar parceria".
- "Pedidos": no computador, Kanban com colunas por etapa. No celular, lista agrupada por etapa com botão "Avançar" (arrastar é ruim no celular). Detalhe do pedido com itens, orçamento, pagamentos, histórico e mensagens.
- "Mais": "Venda rápida", "Vendas", "Clientes", "Calculadora de preço", "Relatórios", "Configurações".

## 5. Plataforma e requisitos técnicos

- Web app responsivo, instalável na tela inicial do celular (PWA).
- Banco de dados na nuvem com login por e-mail e senha, para o mesmo dado aparecer no celular e no computador. Se a plataforma tiver banco integrado (por exemplo Lovable Cloud ou Supabase), use-o e proteja os dados por usuário (Row Level Security).
- Se for um artifact do Claude, use o armazenamento persistente do artifact no escopo pessoal, sem fotos de produto (limite de espaço).
- Se a plataforma não oferecer banco na nuvem, salve no navegador (IndexedDB) e mostre o aviso fixo "Seus dados estão só neste aparelho. Faça backup." junto com exportar e importar backup.
- Sugestão de stack: React + TypeScript + Tailwind + shadcn/ui, gráficos com Recharts. Use o que a plataforma suportar melhor.
- Valores de transação (vendas, acertos, pagamentos) em centavos inteiros. Custos unitários com até 4 casas decimais. Arredonde para centavos só no resultado final, com metade para cima.
- O rascunho do acerto (seção 8.6) é salvo no aparelho a cada alteração, para não perder a contagem se a internet cair ou o app fechar. O estoque só muda quando o acerto é concluído.
- Fotos de produto são opcionais e comprimidas no envio.

## 6. Precificação

### 6.1 Parâmetros gerais (Configurações > Custos)

| Parâmetro | Padrão | Observação |
|---|---|---|
| Tarifa de energia (R$/kWh) | 0,95 | Total da conta de luz ÷ kWh, com impostos |
| Valor da sua hora de trabalho (R$/h) | 20,00 | Preparar a mesa, acabamento, montagem e embalagem |
| Valor da hora de modelagem (R$/h) | 40,00 | Pedidos personalizados |
| Taxa de falha (%) | 5 | Aplicada só sobre o custo de impressão |
| Imposto sobre o que você recebe (%) | 0 | MEI paga DAS fixo (lance em custos fixos). Simples Nacional: informe a alíquota |
| Margem desejada (%) | 50 | Lucro como % do que você recebe |
| Margem mínima de alerta (%) | 30 | Abaixo disso o preço fica vermelho |
| Arredondamento do preço | terminar em ,90 | Opções: ,90, inteiro, nenhum. Sempre para cima |
| Taxa do cartão (%) | 3,5 | Crédito à vista na maquininha |
| Custos fixos mensais (R$) | 82,05 | DAS MEI de comércio/indústria em 2026, internet, assinaturas. Só entra no resultado do mês |
| Limite anual do MEI (R$) | 81.000,00 | Alerta quando a receita do ano passar de 80% |

Ao lado da margem desejada, mostre o multiplicador equivalente na venda direta: multiplicador = 1 ÷ (1 − imposto − margem). Com margem 50% e imposto 0: "equivale a vender por 2,0× o custo".

Canais, com comissão sobre o preço de etiqueta (lista editável):
- "Direto PIX/dinheiro": 0%.
- "Direto cartão": taxa do cartão.
- "Parceiro 80/20": 20%.
- "Parceiro 70/30": 30%.
- "Marketplace" (desligado por padrão): comissão % e tarifa fixa em R$ por item, editadas pelo dono, porque as regras mudam com frequência.

### 6.2 Impressoras

Campos: nome, modelo, valor pago (R$), vida útil estimada (horas), potência média imprimindo (W), manutenção (R$/hora, cobre bicos, placas e peças).

custo_hora_máquina = valor_pago ÷ vida_útil_horas + manutenção_por_hora

Padrões ao cadastrar: A1 mini R$ 2.179,00 e 100 W. A1 R$ 2.998,00 e 95 W. Vida útil 5.000 h. Manutenção R$ 0,05/h. Tudo editável.

### 6.3 Ficha técnica e custo do produto

O dono copia do Bambu Studio, depois de fatiar, as gramas e o tempo. A ficha é por mesa (uma impressão), porque várias peças saem juntas. Um produto pode precisar de mais de uma mesa (exemplo: display PIX com a placa numa mesa e o suporte em outra). Comece com uma mesa e ofereça "+ Adicionar outra mesa".

Por mesa:
- "Peças desta mesa" (N, padrão 1): quantas unidades do produto a mesa produz.
- "Tempo da mesa" (horas e minutos).
- "Impressora".
- "Filamentos da mesa": um ou mais (peças multicoloridas), cada um com as gramas da mesa inteira. Use o total que o fatiador mostra, que já inclui purga, torre de limpeza e suportes.

Por produto:
- "Componentes por peça": itens do cadastro de insumos (argola, corrente, ímã, saquinho, etiqueta) com quantidade.
- "Mão de obra por peça (min)": preparar a mesa, acabamento, montagem e embalagem, dividido por peça. Padrão 2.

Fórmulas:
- custo_por_grama = custo médio do kg do filamento ÷ 1000
- material_mesa = soma de (gramas × custo_por_grama) de cada filamento da mesa
- energia_mesa = (potência_W ÷ 1000) × horas_mesa × tarifa_kWh
- máquina_mesa = horas_mesa × custo_hora_máquina
- impressão_por_peça = soma, em todas as mesas do produto, de [(material_mesa + energia_mesa + máquina_mesa) × (1 + taxa_falha) ÷ N]
- custo_unitário = impressão_por_peça + soma(qtd × custo do componente) + (minutos_mão_de_obra ÷ 60) × valor_hora

Mostre a composição do custo por peça em lista e numa barra empilhada: material, energia, máquina, falhas, componentes e mão de obra. Dica fixa na tela: "Use os dados do fatiador depois de fatiar. Peças multicoloridas gastam filamento com purga; mais peças na mesma mesa diluem esse gasto."

O custo é recalculado sozinho quando mudar o preço do filamento, a tarifa ou a impressora. O preço de etiqueta não muda sozinho: se a margem cair abaixo da mínima, o produto ganha um alerta.

### 6.4 Preço por canal e simulador

Definições, com P = preço de etiqueta:
- recebido(canal) = P × (1 − comissão_canal) − tarifa_fixa_canal
- lucro(canal) = recebido × (1 − imposto) − custo_unitário
- margem(canal) = lucro ÷ recebido
- preço_sugerido(canal) = (custo_unitário ÷ (1 − imposto − margem_desejada) + tarifa_fixa_canal) ÷ (1 − comissão_canal), arredondado conforme a configuração.

Se imposto + margem desejada for 100% ou mais, ou se a comissão for 100%, bloqueie e explique o erro.

Arredondar para terminar em ,90 significa subir até o próximo valor X,90. Em centavos: c = valor arredondado para cima ao centavo; preço_final = teto((c − 90) ÷ 100) × 100 + 90. Exemplos: 4,97 vira 5,90; 5,90 continua 5,90; 117,67 vira 117,90.

A hora do dono já entra no custo. O lucro é o que sobra além dela.

Tela "Simulador de preço" (dentro do produto e avulsa em "Mais"):
- Preço sugerido por canal ativo.
- Campo "Preço de etiqueta" com uma tabela embaixo: Canal | Você recebe | Custo | Lucro (R$) | Margem (%).
- Linha vermelha quando a margem ficar abaixo da mínima. Se o lucro ficar negativo, mostre "Com este preço você perde dinheiro em: Parceiro 70/30".
- Um preço de etiqueta por produto vale para todos os canais, para não competir com os próprios parceiros. Sugira como etiqueta o maior preço sugerido entre os canais ativos. O mix de cada parceiro pode ter preço próprio (seção 8.3).

### 6.5 Calculadora rápida

A mesma conta da ficha técnica, com campos livres (mesas, gramas por filamento, tempo, impressora, componentes, mão de obra, quantidade), para cotar algo sem cadastrar produto. Botão "Criar pedido com este cálculo".

## 7. Estoque e produção

### 7.1 Produtos

Campos: nome, modelo (agrupa as cores do mesmo produto, por exemplo "Chaveiro Kettlebell"), cor, categoria (Chaveiro, Display, Decoração, Personalizado, Outro, editável), foto, código automático, preço de etiqueta, ficha técnica (6.3), estoque mínimo em Casa, ativo ou arquivado, origem do modelo (próprio ou de terceiro, com link e "licença permite venda: sim/não/não sei"). Produto de terceiro com licença "não" ou "não sei" ganha um alerta discreto.

Ação "Duplicar para outra cor". Cada cor é um item de estoque separado.

Lista de produtos: foto, nome, em Casa, nos parceiros, total, custo, preço e margem com cor de status. Filtros por categoria e modelo. No topo: "Valor parado em estoque (a custo): em Casa R$ X, nos parceiros R$ Y".

### 7.2 Locais e movimentações

Locais: "Casa" (estoque central) e um local automático para cada parceiro.

O saldo de um produto num local é sempre a soma das movimentações. Nunca edite o saldo direto.

| Tipo | Efeito |
|---|---|
| Produção | entra em Casa |
| Venda direta | sai de Casa |
| Remessa ao parceiro | Casa → Parceiro (instalação ou reposição) |
| Venda no parceiro | sai do Parceiro (gerada no acerto) |
| Recolhimento | Parceiro → Casa |
| Perda | sai do local (motivo: avaria, falta abonada, defeito, brinde, uso próprio) |
| Ajuste de inventário | entra ou sai, motivo obrigatório |
| Estorno | anula uma movimentação anterior |

Cada movimentação guarda: data, produto, quantidade, origem, destino, tipo, motivo, referência (venda, acerto, pedido ou produção), custo unitário do momento e preço do momento.

Saídas maiores que o saldo: bloqueadas em remessas e acertos. Na venda rápida e nos pedidos, permitidas com aviso, deixando o saldo negativo em vermelho até o próximo ajuste.

### 7.3 Materiais e insumos

- Filamentos: material (PLA, PETG, TPU, ABS, ASA, outro), cor (nome e amostra), marca, custo médio por kg, saldo em gramas, mínimo em gramas (padrão 250), peso do carretel vazio em gramas (varia por marca; 0 para refil).
- Outros insumos: argola, corrente, ímã, saquinho, etiqueta, cola, tinta. Unidade, custo médio unitário, saldo e mínimo.
- "Compra de material": item, quantidade (kg ou unidades), valor total pago com frete. Soma ao saldo e recalcula o custo médio: novo_custo = (saldo × custo_atual + qtd_comprada × custo_da_compra) ÷ (saldo + qtd_comprada). Se o saldo for zero ou negativo, novo_custo = custo_da_compra.
- "Pesei o carretel": peso na balança − peso do carretel vazio = gramas restantes. Gera um ajuste. Saldo negativo de filamento fica em vermelho com a sugestão "Pese o carretel".
- Movimentos de material: compra, consumo em produção, consumo em pedido, ajuste e perda.

### 7.4 Registrar produção

Campos: produto, quantidade boa, quantidade perdida em falhas (padrão 0), data. Atalho por mesas: "2 mesas de 8" = 16 peças.

Efeitos:
- Quantidade boa entra em Casa.
- Filamento consumido = para cada mesa e filamento, (gramas da mesa ÷ N) × (boa + perdida).
- Componentes consumidos = quantidade por peça × boa.
- Opção "Informar gramas reais" substitui o cálculo do filamento.
- A falha real não muda o custo do produto, que já tem a taxa de falha. Mostre em Relatórios a taxa de falha real (perdidas ÷ total) para o dono ajustar o parâmetro.

### 7.5 O que imprimir

Lista sugerida, do mais urgente ao menos urgente:
- necessidade = estoque_mínimo_casa + reposição_prevista − saldo_casa (só aparece se maior que zero)
- reposição_prevista = soma, nos parceiros ativos, da média de unidades vendidas desse produto nos últimos 3 acertos. Sem histórico, use o nível ideal do mix menos o saldo no parceiro.
- Mostre: produto, necessidade, mesas = arredondar para cima(necessidade ÷ N), tempo total, filamento necessário e se o saldo de filamento é suficiente.
- Embaixo, pedidos personalizados em "Aprovado" ou "Em produção", ordenados pelo prazo.

### 7.6 Alertas de estoque

Produto abaixo do mínimo em Casa, filamento ou insumo abaixo do mínimo, saldo negativo, produto sem venda há 60 dias.

## 8. Parceiros e expositores (consignação)

### 8.1 Parceiro

Campos: nome do estabelecimento, tipo (academia, loja, salão, café, escritório, outro), responsável, WhatsApp, endereço, bairro, link do mapa, divisão ("Você 70% / Parceiro 30%", "Você 80% / Parceiro 20%" ou personalizada), frequência do acerto (15 ou 30 dias), quem recebe dos clientes ("O parceiro", "Meu PIX no expositor" ou "Ambos"), data de início, situação (ativo, pausado, encerrado), termo assinado (sim/não, data e foto), nº da nota de remessa (opcional), observações.

Mudança de divisão: vale a partir do próximo acerto. O acerto em andamento usa o percentual de quando o ciclo começou. Guarde o histórico de percentuais e lembre o dono de reimprimir o termo.

### 8.2 Expositor

O expositor é patrimônio do dono. Campos: código (EXP-01), modelo, capacidade (ganchos ou vagas), custo (R$), data de instalação, onde está (parceiro ou Casa), estado (ok, danificado ou perdido), foto. Um parceiro pode ter mais de um. Mostre o retorno do investimento: lucro acumulado no parceiro ÷ custo do expositor. Expositor perdido vira perda pelo custo.

### 8.3 Mix do parceiro

Lista de produtos do expositor com "nível ideal" (quanto deve ficar após cada reposição) e preço de etiqueta (padrão do produto, pode ser trocado só para esse parceiro). Sugestão para o nível ideal: venda média por ciclo + 30%, mínimo 2 por produto.

### 8.4 Instalação (primeira remessa)

Escolher expositor e quantidades (padrão = nível ideal). Gera remessas Casa → Parceiro e o "Termo de consignação" com a lista de itens para imprimir ou enviar pelo WhatsApp.

### 8.5 Reposição avulsa

Levar mais itens entre acertos, sem acertar. Entra no saldo do parceiro e no esperado do próximo acerto.

### 8.6 Visita de acerto (fluxo no celular, 5 passos, rascunho salvo sozinho)

1. "Contagem": para cada produto com saldo no parceiro, mostre "Esperado" (saldo do sistema) e o campo "Contei", com − e +, começando no esperado. Botão "Adicionar item encontrado" para algo que não estava no sistema.
2. "Ocorrências" (opcional, recolhido): por produto, "Avariados" (estão lá, mas estragados), "Recolhidos" (bons, voltam para Casa, por exemplo itens parados) e "Faltas abonadas" (sumiram e o dono decide não cobrar, com motivo).
3. "Resumo": por produto, vendidos, preço (editável na linha, com aviso amarelo se o preço mudou desde o último acerto) e valor. Totais: "Total vendido", "Parte do parceiro", "Sua parte", "Recebido no seu PIX no período" e "Valor do acerto". Mostre também as pendências de acertos anteriores e o "Total a receber hoje".
4. "Reposição": sugestão por produto = nível ideal − (Contei − Avariados − Recolhidos), nunca menor que zero e limitada ao saldo em Casa. Quando faltar, avise e mande a diferença para "O que imprimir". Editável. Permite incluir produto novo no mix.
5. "Pagamento": valor recebido agora, forma (PIX ou dinheiro) e data. Se for menor que o devido, o restante fica "A receber". Se o valor do acerto for negativo, registre o pagamento feito ao parceiro.

O campo "Recebido no seu PIX no período" depende de quem recebe: "O parceiro" esconde o campo (vale 0). "Meu PIX no expositor" começa com o total vendido. "Ambos" começa vazio. Sempre editável.

Ao concluir: gerar as movimentações, gravar o acerto com a fotografia de preços e percentual, calcular a data do próximo acerto e abrir o "Comprovante" com "Enviar no WhatsApp", "Copiar texto" e "Imprimir/PDF".

Validações:
- Se Contei for maior que Esperado, peça para recontar. Se o dono confirmar, crie um ajuste de entrada com a diferença (motivo "contagem maior que o esperado") e considere 0 vendidos nessa linha. Nunca gere venda negativa.
- Avariados + Recolhidos ≤ Contei.
- Faltas abonadas ≤ Esperado − Contei.

Visita sem acerto (responsável ausente): o rascunho fica salvo e nada muda no estoque até concluir.

"Reabrir acerto": só o último acerto de cada parceiro. Estorna movimentações e pagamentos dele e volta ao rascunho. Acertos mais antigos não são editados.

### 8.7 Cálculos do acerto (exatos, em centavos)

- vendidos = esperado − contei − faltas_abonadas
- bruto = soma(vendidos × preço da linha)
- parte_parceiro = bruto × % do parceiro ÷ 100, arredondado com metade para cima. Com centavos e percentual inteiros: piso((bruto × % + 50) ÷ 100)
- sua_parte = bruto − parte_parceiro (assim a soma fecha exatamente)
- valor_do_acerto = sua_parte − recebido_no_seu_PIX. Positivo: o parceiro paga ao dono. Negativo: o dono paga ao parceiro.
- estoque_final = contei − avariados − recolhidos + repostos
- dias_do_período = data do acerto − data do acerto anterior (ou da instalação)
- giro = vendidos ÷ esperado
- Avariados e faltas abonadas viram "Perda" pelo custo do produto. Faltas sem explicação contam como vendidas (o parceiro guarda os itens; ver termo).
- Pendências: cada acerto com valor positivo não pago por inteiro vira um valor a receber. Pagamentos abatem primeiro o mais antigo. Mostre o alerta "Pendência vencida" no Início e pergunte, na reposição, se o dono quer repor mesmo assim.

### 8.8 Agenda de acertos

Lista dos parceiros ativos ordenada pelo vencimento: atrasado (vermelho), vence em até 3 dias (amarelo), em dia (verde). Cada cartão mostra dias desde a última visita, peças no expositor, último valor e pendência. Botões "Iniciar acerto" e "Abrir no mapa". Parceiros pausados ficam fora.

### 8.9 Desempenho

Por parceiro: unidades e valores por período, média por dia, sua parte por mês (sua parte ÷ dias × 30), giro, mais vendidos, itens parados (zero vendas em 2 acertos seguidos, com sugestão de recolher e levar para o parceiro onde esse produto vende mais), retorno do expositor e histórico de acertos. Ranking de parceiros por sua parte por mês. Alerta de baixo desempenho quando a sua parte por mês ficar abaixo do limite configurado (padrão R$ 50,00) em 2 acertos seguidos.

### 8.10 Encerrar parceria

Acerto final com recolhimento de tudo, expositor volta para Casa, situação "encerrado". Pendências continuam cobráveis e o histórico continua.

### 8.11 Mensagem do comprovante (modelo editável)

```
Olá, {responsavel}! Segue o acerto da parceria {empresa} × {parceiro}, de {data_inicio} a {data_fim}:
{linhas: • Produto: qtd × R$ preço = R$ valor}
Total vendido: R$ {bruto}
Parte de vocês ({pct_parceiro}%): R$ {parte_parceiro}
Parte {empresa} ({pct_dono}%): R$ {sua_parte}
{se houver: Já recebido no PIX do expositor: R$ {pix_direto}}
{se houver: Pendência anterior: R$ {pendencia}}
Total a acertar: R$ {total} — PIX {chave_pix} ({nome_pix})
Reposição de hoje: {itens repostos}. Ficaram {total_pecas} peças no expositor.
Próximo acerto: {data_proximo}. Obrigado pela parceria!
```

Se o valor for negativo, troque a linha do total por "Valor que vamos repassar a vocês: R$ {valor}".

### 8.12 Termo de consignação (modelo simples para imprimir)

Partes, endereço, lista de itens com quantidade e preço de etiqueta, código do expositor, divisão percentual, periodicidade do acerto, forma de pagamento, livre acesso do dono para conferir, guarda dos itens pelo parceiro até a devolução (itens que faltarem sem explicação contam como vendidos), regra para avarias, furto e perda, propriedade do expositor, aviso prévio de 15 dias para encerrar, local, data e assinaturas. Rodapé: "Modelo simples baseado no contrato estimatório (Código Civil, arts. 534 a 537). Não substitui orientação jurídica nem contábil."

## 9. Pedidos personalizados e clientes

### 9.1 Clientes

Campos: nome (único obrigatório), WhatsApp, Instagram, cidade e bairro, endereço (só se houver entrega), aniversário (opcional), como conheceu (Instagram, indicação, parceiro, feira, outro), "Aceita receber novidades" (padrão não), observações. Não peça CPF nem e-mail como obrigatórios.

A ficha mostra pedidos, compras, total gasto, última compra, ticket médio, crédito do cliente (se pagou a mais) e botão de WhatsApp. Ação "Excluir dados do cliente" anonimiza nome e contatos e mantém só os totais de vendas (LGPD).

Na venda rápida, "Cliente avulso" é permitido. Não force cadastro.

### 9.2 Pedido

Campos: número sequencial (#0001), cliente, título, descrição, referências (fotos, links e arquivos STL/3MF, opcionais), itens, prazo prometido, entrega (retirada, entrega própria ou Correios/transportadora) com frete e código de rastreio, canal de origem (incluindo "Expositor de parceiro", que continua sendo venda direta e não entra no acerto), observações internas.

Itens:
- "Produto do catálogo": usa a ficha técnica. Fica reservado em Casa na aprovação e sai na entrega. Se faltar estoque, avisa "faltam N unidades" e manda para "O que imprimir".
- "Peça personalizada": mesas, gramas por filamento, tempo, impressora, componentes, mão de obra e quantidade.

Orçamento:
- custo_produção = soma do custo dos itens (motor da seção 6)
- preço_produção = custo_produção ÷ (1 − imposto − margem_desejada)
- modelagem = horas_de_modelagem × valor_hora_modelagem (cobrada sem margem)
- subtotal = preço_produção + modelagem
- total = arredondar(máximo(pedido_mínimo, subtotal × (1 + urgência% − desconto%))) + frete
- sinal = total × sinal%, arredondado ao centavo (padrão 50%)
- Padrões: pedido mínimo R$ 30,00, validade do orçamento 7 dias, urgência 20% quando marcada, desconto por quantidade sugerido de 10% a partir de 10 unidades (o dono decide).
- O valor final é editável. Ao editar, mostre lucro e margem do novo valor.
- lucro_pedido = (total − frete) × (1 − imposto) − taxas de cartão dos pagamentos − custo_produção − modelagem
- O texto do orçamento inclui a política de cancelamento definida nas Configurações.

### 9.3 Etapas (Kanban)

| Etapa | Ao entrar nela |
|---|---|
| Orçamento | Gera a mensagem de orçamento. Alerta quando a validade vence sem resposta. Ação "Duplicar orçamento" recalcula com os custos atuais |
| Aprovado | Pede o registro do sinal ou "dispensar sinal" com motivo. Entra em "O que imprimir". O prazo começa a contar aqui |
| Em produção | Checklist: modelo aprovado pelo cliente, impresso, acabamento |
| Pronto | Baixa os materiais estimados das peças personalizadas (editável com gramas reais e falhas). Sugere a mensagem "pedido pronto" |
| Entregue | Baixa os itens de catálogo de Casa. Exige saldo pago ou registra o restante como "A receber". Sugere a mensagem de pós-venda |
| Cancelado | Pede motivo e o destino do sinal (reter, devolver tudo ou parte). Material já gasto continua baixado |

Alertas: prazo em 2 dias ou menos (amarelo), atrasado (vermelho), "Aprovado sem sinal há 3 dias", "Pronto e não retirado há mais de 5 dias".

Pagamentos do pedido: sinal, parcelas e saldo, com forma (PIX, dinheiro ou cartão; cartão desconta a taxa no lucro). Pagamento acima do total vira crédito do cliente. Mudar itens depois da aprovação recalcula total e saldo, mantém os pagamentos e grava "valor alterado de X para Y" no histórico.

### 9.4 Mensagens de WhatsApp

Links no formato https://wa.me/NUMERO?text=TEXTO:
- Número só com dígitos: 55 + DDD + número (13 dígitos para celular, ex.: 5571999998888). Remova espaços, parênteses, hífens, "+" e zeros à esquerda. Número que já começa com outro código de país fica como está. Valide de 10 a 13 dígitos e avise que o número precisa ter WhatsApp.
- Texto sempre codificado com encodeURIComponent ("#", "&" e emojis cortam a mensagem sem isso).

Modelos editáveis com variáveis entre chaves: orçamento, sinal recebido, pedido pronto, lembrete de saldo, pós-venda e comprovante de acerto. Mensagens de promoção ou aniversário só para clientes com "Aceita receber novidades".

## 10. Venda rápida (venda direta)

Grade de produtos com foto e busca. Tocar adiciona 1. Ajuste de quantidade, preço (padrão = etiqueta, editável), desconto em R$ ou %, forma de pagamento (PIX, dinheiro, cartão), canal (presencial, WhatsApp, Instagram, feira), cliente opcional e data. Sai do estoque de Casa e grava receita, taxa, custo do momento e lucro. Cancelar uma venda gera estorno.

## 11. Início e relatórios

### 11.1 Início

- "Hoje": acertos atrasados e da semana, pedidos com prazo próximo ou atrasados, alertas de estoque e total a receber.
- "Este mês": vendas, lucro estimado e divisão por canal, comparando com o mês anterior.
- Gráfico de barras dos últimos 6 meses por canal.
- Top 5 produtos e top 5 parceiros do mês.

### 11.2 Relatórios

Filtros de período: esta quinzena (dias 1 a 15 ou 16 ao fim do mês), quinzena anterior, este mês, mês anterior e personalizado.
- Vendas e lucro por canal, produto e parceiro.
- Parceiros: ranking, giro, a receber e retorno do expositor.
- Produtos: mais vendidos, parados, margem.
- Materiais: consumo de filamento em kg e custo por mês, e taxa de falha real.
- Resultado do mês: receita − impostos − custo dos produtos vendidos − perdas − custos fixos = lucro estimado.
- "Dinheiro que entrou no mês": soma dos pagamentos recebidos (inclui sinais e acertos pagos).
- Receita do ano com alerta do limite do MEI.
- Exportar CSV de cada relatório.

Regras:
- Receita = o que fica com o dono: venda direta menos taxa do cartão, sua parte nos acertos e pedidos entregues. Mostre também o "Total vendido nos parceiros" (bruto), porque o contador pode pedir um ou outro.
- Venda direta conta na data da venda. Venda em parceiro conta na data do acerto. Pedido conta na data de entrega.
- Falhas de impressão já estão no custo pela taxa de falha e não entram de novo em perdas.

## 12. Configurações

- Empresa: nome, logo, cor principal, WhatsApp, chave PIX e nome do recebedor (usados nas mensagens), cidade, política de cancelamento de pedidos.
- Custos e preços (6.1) e impressoras (6.2).
- Parcerias: divisões disponíveis, frequência padrão, dias de aviso, limite de baixo desempenho.
- Mensagens: modelos com variáveis entre chaves.
- Categorias.
- Dados: exportar backup (JSON), importar backup, exportar CSV, carregar e apagar dados de exemplo.

## 13. Modelo de dados

Adapte os nomes ao padrão da plataforma. Todo registro tem id, criado_em e atualizado_em.

- configuracoes: dados da empresa, parâmetros de custo, canais, padrões de parceria, política de cancelamento.
- impressoras: nome, modelo, valor_pago, vida_util_h, potencia_w, manutencao_h, ativa.
- materiais: tipo (filamento ou insumo), nome, material, cor_nome, cor_hex, marca, unidade (g ou un), custo_medio, minimo, tara_carretel_g, ativo.
- movimentos_material: material_id, data, tipo (compra, producao, pedido, ajuste, perda), quantidade (+/−), valor_total_centavos, referencia_tipo, referencia_id.
- produtos: nome, modelo, cor, categoria, foto, codigo, preco_etiqueta_centavos, estoque_minimo, mao_de_obra_min, origem_modelo, link_modelo, licenca_venda, ativo.
- produto_mesas: produto_id, pecas_por_mesa, tempo_min, impressora_id.
- mesa_filamentos: mesa_id, material_id, gramas.
- produto_componentes: produto_id, material_id, quantidade.
- locais: tipo (casa ou parceiro), parceiro_id.
- movimentos_estoque: data, produto_id, quantidade, local_origem_id, local_destino_id, tipo, motivo, referencia_tipo, referencia_id, custo_unit_snapshot, preco_unit_snapshot_centavos.
- producoes: data, produto_id, qtd_boa, qtd_perdida, gramas_reais.
- parceiros: campos da 8.1, pct_parceiro, frequencia_dias, quem_recebe.
- parceiro_percentuais: parceiro_id, pct_parceiro, vigente_desde.
- expositores: campos da 8.2, parceiro_id.
- mix_parceiro: parceiro_id, produto_id, nivel_ideal, preco_etiqueta_centavos (opcional).
- acertos: parceiro_id, data, data_anterior, pct_parceiro_snapshot, bruto_centavos, parte_parceiro_centavos, sua_parte_centavos, pix_direto_centavos, valor_acerto_centavos, situacao (rascunho, concluido, estornado), status_pagamento (pago, parcial, pendente).
- acerto_itens: acerto_id, produto_id, esperado, contei, avariados, recolhidos, faltas_abonadas, vendidos, preco_unit_centavos, valor_centavos, repostos, estoque_final.
- clientes: campos da 9.1, credito_centavos.
- pedidos: numero, cliente_id, titulo, descricao, etapa, prazo, entrega, frete_centavos, rastreio, canal_origem, horas_modelagem, urgencia_pct, desconto_pct, sinal_pct, total_centavos, custo_producao, validade, motivo_cancelamento.
- pedido_itens: pedido_id, tipo (catalogo ou personalizada), produto_id, descricao, quantidade, mesas e filamentos (para personalizada), componentes, mao_de_obra_min, custo_calculado.
- pedido_historico: pedido_id, evento, data.
- vendas: data, canal, forma_pagamento, cliente_id, desconto_centavos, taxa_centavos, total_centavos.
- venda_itens: venda_id, produto_id, quantidade, preco_unit_centavos, custo_unit_snapshot.
- pagamentos: origem (acerto, pedido, venda), referencia_id, direcao (recebido ou pago), valor_centavos, forma, data.
- mensagens_modelo: chave, texto.

## 14. Regras gerais

- Fotografias (snapshots): vendas, acertos, pedidos e movimentações guardam preço, custo e percentual do momento. Mudar um cadastro depois não altera o passado.
- Recalcule o custo dos produtos quando mudar preço de filamento, insumo, tarifa, impressora ou parâmetros.
- Próximo acerto = data do acerto + frequência do parceiro.
- Arquivar no lugar de apagar. Estornar no lugar de editar lançamentos concluídos.
- Nenhuma nota fiscal é emitida pelo app. Onde fizer sentido, há só um campo opcional para o número da nota.

## 15. Ordem de construção e critérios de aceite

Para testar, carregue os dados de exemplo (seção 16), que usam exatamente os valores abaixo. Os resultados precisam bater ao centavo.

- Etapa 1 — Base e precificação: layout, navegação, login, assistente de primeiro acesso, configurações, impressoras, materiais, produtos com ficha técnica, custo, simulador e calculadora rápida. Critério: Exemplo A.
- Etapa 2 — Estoque: locais, movimentações, compra de material com custo médio, registrar produção, venda rápida, alertas e "O que imprimir". Critério: Exemplo G.
- Etapa 3 — Parceiros: parceiros, expositores, mix, instalação, reposição avulsa, visita de acerto, comprovante, pendências, agenda, desempenho e termo. Critério: Exemplos B, C, E e F.
- Etapa 4 — Pedidos e clientes: clientes, pedidos, orçamento, etapas, pagamentos e mensagens. Critério: Exemplo D.
- Etapa 5 — Início, relatórios, backup e exportação. Critério: o resultado do mês soma os exemplos sem contar nada duas vezes, e um backup exportado e importado num banco vazio reproduz os mesmos números.

### Exemplo A — Custo e preço do Chaveiro Kettlebell Preto

Parâmetros do exemplo: tarifa R$ 1,00/kWh, hora de trabalho R$ 25,00, falha 10%, imposto 0%, margem 50%, arredondamento ,90, cartão 4%.
Impressora A1 mini do exemplo: R$ 2.000,00, vida útil 4.000 h, manutenção R$ 0,10/h, 80 W. Custo hora máquina = 2.000 ÷ 4.000 + 0,10 = R$ 0,60.
PLA Preto R$ 100,00/kg (R$ 0,10/g). Argola R$ 0,30. Saquinho R$ 0,10.
Ficha: 1 mesa com 8 peças, 4 h, 64 g de PLA Preto. 1 argola e 1 saquinho por peça. 2 min de mão de obra por peça.

- Material = 64 × 0,10 = 6,40
- Energia = 0,08 × 4 × 1,00 = 0,32
- Máquina = 4 × 0,60 = 2,40
- Impressão por peça = (6,40 + 0,32 + 2,40) × 1,10 ÷ 8 = 10,032 ÷ 8 = 1,254
- Componentes = 0,40. Mão de obra = 2 ÷ 60 × 25 = 0,8333
- Custo unitário = 2,4873, exibido R$ 2,49

Preços sugeridos: Direto PIX 4,9747 → R$ 5,90. Direto cartão 5,1819 → R$ 5,90. Parceiro 80/20 6,2183 → R$ 6,90. Parceiro 70/30 7,1067 → R$ 7,90. Etiqueta sugerida: R$ 7,90.

Simulador com etiqueta R$ 15,00:

| Canal | Você recebe | Lucro | Margem |
|---|---|---|---|
| Direto PIX | R$ 15,00 | R$ 12,51 | 83,4% |
| Direto cartão | R$ 14,40 | R$ 11,91 | 82,7% |
| Parceiro 80/20 | R$ 12,00 | R$ 9,51 | 79,3% |
| Parceiro 70/30 | R$ 10,50 | R$ 8,01 | 76,3% |

### Exemplo B — Acerto 70/30 quinzenal

Academia Alfa, parceiro 30%, a cada 15 dias, quem recebe: o parceiro. Mix: Kettlebell Preto (ideal 10, R$ 15,00), Anilha Vermelha (ideal 8, R$ 12,00), Halter Cinza (ideal 6, R$ 12,00). O acerto anterior, em 01/10/2026, deixou 10, 8 e 6.
Visita em 16/10/2026. Contei: 4, 5 e 6.

- Vendidos: 6, 3 e 0 (9 peças). Bruto = 6 × 15,00 + 3 × 12,00 = R$ 126,00
- Parte do parceiro 30% = R$ 37,80. Sua parte = R$ 88,20. Valor do acerto = R$ 88,20, pago pelo parceiro
- Reposição sugerida: 6, 3 e 0. Estoque final: 10, 8 e 6 (24 peças)
- Recebido no PIX R$ 88,20: acerto pago. Próximo acerto: 31/10/2026
- Período de 15 dias, média de 0,60 peça por dia, giro 9 ÷ 24 = 37,5%
- Se o Halter também teve zero vendas no acerto anterior, ele aparece como parado.

### Exemplo C — Acerto 80/20 mensal com avaria, PIX no expositor e pagamento parcial

Loja Beta, parceiro 20%, a cada 30 dias, quem recebe: ambos. Mix: Kettlebell Rosa (ideal 12, R$ 15,00) e Display PIX (ideal 3, R$ 35,00). Esperado: 12 e 3.
Contei: 5 Kettlebell Rosa, 1 deles avariado, e 2 Display PIX.

- Vendidos: 7 e 1. Bruto = 105,00 + 35,00 = R$ 140,00
- Parte do parceiro 20% = R$ 28,00. Sua parte = R$ 112,00
- Recebido no seu PIX no período = R$ 30,00. Valor do acerto = 112,00 − 30,00 = R$ 82,00, pago pelo parceiro
- Avaria: 1 Kettlebell Rosa vira perda pelo custo. Ficam 4 bons
- Reposição sugerida: 12 − 4 = 8 e 3 − 2 = 1. Estoque final: 12 e 3
- Recebido agora R$ 50,00: acerto parcial com R$ 32,00 a receber. No próximo acerto aparece "Pendência anterior: R$ 32,00"
- Conferência: a loja recebeu 140,00 − 30,00 = 110,00, fica com 28,00 e repassa 82,00

### Exemplo D — Pedido personalizado

20 chaveiros com nome. Peça personalizada: 1 mesa com 20 peças, 120 g de PLA Branco a R$ 100,00/kg, 3 h na A1 do exemplo (R$ 3.500,00, vida útil 5.000 h, manutenção R$ 0,10/h, 100 W), 1 argola de R$ 0,30 por peça, 2 min de mão de obra por peça, 1 h de modelagem a R$ 40,00. Sem urgência, desconto ou frete. Margem 50%, imposto 0%, falha 10%, tarifa R$ 1,00, hora R$ 25,00.

- Material 12,00. Energia 0,1 × 3 × 1,00 = 0,30. Máquina 3 × (3.500 ÷ 5.000 + 0,10) = 2,40
- Impressão = (12,00 + 0,30 + 2,40) × 1,10 = 16,17
- Componentes 20 × 0,30 = 6,00. Mão de obra 40 ÷ 60 × 25 = 16,6667
- Custo de produção = 38,8367
- Preço de produção = 38,8367 ÷ 0,5 = 77,6733. Subtotal = 77,6733 + 40,00 = 117,6733
- Total = R$ 117,90. Sinal de 50% = R$ 58,95. Saldo R$ 58,95
- Lucro = 117,90 − 38,8367 − 40,00 = R$ 39,06 (33,1% do total)

### Exemplo E — Arredondamento da divisão

Uma peça de R$ 14,95 vendida em parceiro 70/30: parte do parceiro = R$ 4,49 (4,485 arredondado para cima). Sua parte = R$ 10,46.

### Exemplo F — Contagem maior que o esperado

Esperado 4, contei 5: aparece o pedido de recontagem. Confirmado, a linha fica com 0 vendidos e é criado um ajuste de entrada de 1 peça no parceiro.

### Exemplo G — Produção

Registrar 2 mesas de 8 Kettlebell Preto com 1 peça perdida: 15 boas entram em Casa. Baixa de PLA Preto = (64 ÷ 8) × (15 + 1) = 128 g. Baixa de 15 argolas e 15 saquinhos.

## 16. Dados de exemplo

Botão "Carregar dados de exemplo" com tudo dos exemplos A a G: parâmetros do Exemplo A, impressoras A1 mini e A1 do exemplo, PLA Preto, Rosa, Vermelho, Cinza e Branco a R$ 100,00/kg com 1.000 g cada, 100 argolas e 100 saquinhos, produtos (Kettlebell Preto, Kettlebell Rosa, Anilha Vermelha, Halter Cinza, Display PIX com 2 mesas), Academia Alfa e Loja Beta com expositores EXP-01 e EXP-02, a cliente Marina e o pedido #0001. Todos ficam marcados como exemplo, com o botão "Apagar dados de exemplo".

## 17. Fora do escopo

- Emissão de nota fiscal e cálculo de impostos além do percentual simples.
- Integração com marketplaces, loja virtual e envio automático pela API do WhatsApp.
- Conexão com as impressoras, fila automática por impressora, câmeras e leitura de RFID do AMS.
- Contabilidade completa, contas a pagar e conciliação bancária.
- Vários usuários com permissões, portal do parceiro e portal do cliente.
- Código de barras, QR Code e controle individual de cada carretel.
- Roteirização com mapa ou GPS.
- App nativo: o PWA basta.
- Fase 2, só se o dono pedir depois: importar gramas e tempo de um arquivo .gcode.3mf exportado do Bambu Studio.

## 18. Referências de mercado

O desenho combina padrões de ferramentas que já existem:
- Custo da peça: calculadora de preço da Prusa, Calc3D e Precifi3D (energia, depreciação, falha e mão de obra) e o custo de filamento do Bambu Studio e do OrcaSlicer.
- Filamento em gramas, peso do carretel vazio e alerta de fim de carretel: Spoolman.
- Ficha técnica e custo das mercadorias vendidas: Craftybase.
- Sistemas brasileiros para impressão 3D: 3D Control e MeuAssessor3D.
- Venda rápida e catálogo: Kyte.
- Acerto de consignação e extrato do parceiro: ConsignCloud e sistemas de maleta consignada de semijoias, como Gestão Joias.
- Visitas e reposição em rota: Mercos.
- Pedidos em colunas: quadros Kanban no estilo Trello.
- Mensagens prontas: links wa.me do WhatsApp.
