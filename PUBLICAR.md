# Publicar o 3D gestão na internet

O app fica em duas partes:

- **GitHub Pages** hospeda o app (as telas). O endereço fica assim: `https://<usuario>.github.io/GESTAO-3D/`.
- **Supabase** guarda os dados e faz o login. Ele não hospeda o app (páginas HTML no Supabase saem como texto).

Com as duas ligadas, o mesmo app abre no computador e no celular, com os mesmos dados, depois de entrar com
e-mail e senha.

## Parte A — Publicar o app (GitHub Pages)

O repositório `exodus14-code/GESTAO-3D` já é público, então é só ligar o Pages:

1. Abra https://github.com/exodus14-code/GESTAO-3D (entrando na conta `exodus14-code`).
2. **Settings** (engrenagem) > na lateral, **Pages**.
3. Em **Build and deployment** > **Source**: escolha **Deploy from a branch**.
4. Em **Branch**: escolha **main** e a pasta **/ (root)** > **Save**.
5. Espere até 10 minutos. No topo da página Pages aparece **"Your site is live at
   https://exodus14-code.github.io/GESTAO-3D/"** e o botão **Visit site**. O andamento fica na aba **Actions**
   ("pages build and deployment").

Se preferir o site em **outra conta do GitHub**: entre na conta nova, clique em **+** > **Import repository**, cole
`https://github.com/exodus14-code/GESTAO-3D.git`, deixe **Public** e clique em **Begin import**. Depois faça os
passos 2 a 5 no repositório novo. O endereço passa a ser `https://<conta-nova>.github.io/<nome-do-repo>/`. Avise
o Claude para apontar a pasta do computador para o repositório novo (senão o "salve" continua indo para o antigo).

## Parte B — Criar o banco no Supabase

1. Entre em https://supabase.com com a conta que vai usar e clique em **New project**:
   - **Name**: `3d-gestao`.
   - **Database Password**: crie uma senha forte e guarde (ela não vai no app; serve só para o banco).
   - **Region**: **South America (São Paulo)**.
   - Clique em **Create new project** e espere uns 2 minutos.
2. **SQL Editor** > **New query** > cole todo o SQL do arquivo
   [NUVEM.md](https://github.com/exodus14-code/GESTAO-3D/blob/main/NUVEM.md) (o bloco que começa com
   `create table`) > **Run**. Deve aparecer **"Success. No rows returned"**.
3. **Authentication** > **Sign In / Providers** > **Email** > desligue **Confirm email** > **Save**.
4. **Authentication** > **URL Configuration** > em **Site URL** troque `http://localhost:3000` por
   `https://exodus14-code.github.io/GESTAO-3D/` > **Save**.
5. Clique em **Connect** (no topo do projeto) e copie a **Project URL** (`https://xxxx.supabase.co`) e a chave
   **Publishable** (`sb_publishable_...`). Nunca use a chave **secret** (`sb_secret_...`).

## Parte C — Ligar no computador

1. Abra `https://exodus14-code.github.io/GESTAO-3D/` no computador. É um endereço novo, então o app abre vazio,
   no assistente de primeiro acesso.
2. Clique em **Entrar na minha conta**, cole a **URL** e a **chave publishable** e clique em **Ligar a nuvem**.
3. Na tela de login, clique em **Ainda não tenho conta**, digite seu e-mail e uma senha (mínimo 6 caracteres) e
   crie a conta.
4. O assistente aparece: preencha empresa, impressoras e filamentos. Se você tinha dados no app do computador
   (endereço `localhost`), use **Restaurar um backup** com o arquivo exportado lá antes (Configurações > Dados >
   Exportar backup).
5. Tudo o que você cadastrar sobe para a nuvem sozinho. Confira em **Mais > Configurações > Dados >
   Sincronizar na nuvem**: deve aparecer "Sincronizado".
6. No Supabase, **Authentication** > **Sign In / Providers** > desligue **Allow new users to sign up** > **Save**.
   Assim ninguém mais cria conta no seu projeto (você continua entrando normalmente).

## Parte D — Outros aparelhos

1. No computador: **Mais > Configurações > Dados** > em "Usar em outro aparelho", clique em **Mandar pelo
   WhatsApp** (mande para você mesmo) ou **Copiar link**.
2. No celular: abra o link. O app já abre ligado à nuvem e pede só o **e-mail** e a **senha** > **Entrar**. Os
   dados aparecem em alguns segundos.
3. Para ter o ícone na tela do celular:
   - **Android (Chrome)**: menu **⋮** > **Instalar app** (ou **Adicionar à tela inicial**).
   - **iPhone (Safari)**: botão **Compartilhar** > **Adicionar à Tela de Início**.
4. Sem o link, também dá: abra o endereço do app, toque em **Entrar na minha conta** e cole a URL e a chave.

## Bom saber

- O app grava primeiro no aparelho e funciona sem internet; sincroniza quando a conexão volta.
- No plano grátis, o Supabase **pausa o projeto depois de 7 dias sem uso** (avisa por e-mail antes). Nada se
  perde: no painel do Supabase, abra o projeto e clique em **Resume project**. Usar o app toda semana evita a pausa.
- Mudanças no app chegam no site depois de cada **"salve"** (o GitHub Pages publica em até 10 minutos). No celular,
  feche e abra o app para pegar a versão nova.
- Exporte um backup de vez em quando (Configurações > Dados), mesmo com a nuvem ligada.
