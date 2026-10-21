# Sincronizar o 3D gestão na nuvem (Supabase)

Sem nuvem, o app guarda tudo no próprio aparelho (IndexedDB) e mostra o aviso
"Seus dados estão só neste aparelho. Faça backup.". Para ver os mesmos dados no celular e no
computador, ligue a sincronização com um projeto **Supabase** (o plano gratuito basta).

O Supabase guarda os dados e faz o login. Ele **não** hospeda o app: páginas HTML no Supabase Storage saem como
texto puro. O app em si fica no GitHub Pages (veja `PUBLICAR.md`).

## 1. Criar o projeto

1. Crie uma conta em https://supabase.com e, no painel, clique em **New project**: escolha um nome, crie uma
   **senha do banco** (guarde; ela não vai no app) e a região **South America (São Paulo)**. Deixe ligada a
   opção da **Data API** se ela aparecer.
2. Em **SQL Editor > New query**, cole o SQL abaixo e clique em **Run**. Deve aparecer "Success. No rows returned".
3. Em **Authentication > Sign In / Providers > Email**, desligue **Confirm email** e salve. O e-mail grátis do
   Supabase só envia para os membros do projeto, no máximo 2 por hora; sem a confirmação, a conta já nasce pronta.
4. Em **Authentication > URL Configuration**, troque o **Site URL** (vem `http://localhost:3000`) pelo endereço do
   app publicado, por exemplo `https://seu-usuario.github.io/GESTAO-3D/`, e salve.

```sql
-- Tabela única: cada linha é um registro do app (coleção + id), sempre ligado ao usuário.
create table if not exists public.octa_registros (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  col text not null,
  id text not null,
  rec jsonb,
  excluido boolean not null default false,
  atualizado_em timestamptz,
  servidor_em timestamptz not null default clock_timestamp(),
  primary key (user_id, col, id)
);

create index if not exists octa_registros_sync on public.octa_registros (user_id, servidor_em);

-- Cada usuário só enxerga e altera os próprios dados (Row Level Security).
alter table public.octa_registros enable row level security;

drop policy if exists "octa: ler os meus" on public.octa_registros;
drop policy if exists "octa: inserir os meus" on public.octa_registros;
drop policy if exists "octa: alterar os meus" on public.octa_registros;
drop policy if exists "octa: apagar os meus" on public.octa_registros;

create policy "octa: ler os meus" on public.octa_registros
  for select using (auth.uid() = user_id);
create policy "octa: inserir os meus" on public.octa_registros
  for insert with check (auth.uid() = user_id);
create policy "octa: alterar os meus" on public.octa_registros
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "octa: apagar os meus" on public.octa_registros
  for delete using (auth.uid() = user_id);

-- Projetos novos do Supabase (desde 30/05/2026) não liberam tabelas novas para a API sozinhos.
-- Libera só para quem entrou com e-mail e senha; o RLS acima limita cada um às próprias linhas.
grant select, insert, update, delete on public.octa_registros to authenticated;
revoke all on public.octa_registros from anon;

-- Marca a hora do servidor em cada gravação (usada para buscar só o que mudou) e não deixa uma versão
-- mais velha, vinda de um aparelho atrasado, sobrescrever uma mais nova.
create or replace function public.octa_marcar_servidor() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.atualizado_em is not null and new.atualizado_em is not null
     and new.atualizado_em < old.atualizado_em then
    return null;
  end if;
  new.servidor_em := clock_timestamp();
  return new;
end $$;

drop trigger if exists octa_registros_servidor on public.octa_registros;
create trigger octa_registros_servidor
  before insert or update on public.octa_registros
  for each row execute function public.octa_marcar_servidor();
```

## 2. Ligar no app

1. No Supabase, clique em **Connect** (no topo do projeto) ou abra **Project Settings > API Keys** e copie a
   **Project URL** (`https://xxxx.supabase.co`) e a chave **publishable** (`sb_publishable_...`). A chave `anon`
   antiga também serve. **Nunca** use a chave secreta (`sb_secret_...`) nem a `service_role`.
2. No app: **Mais > Configurações > Dados > Sincronizar na nuvem**, cole a URL e a chave e toque em
   **Ligar a nuvem**.
3. Toque em **Criar conta** (e-mail e senha, mínimo 6 caracteres). Os dados que já estão no aparelho sobem para a
   nuvem.
4. Depois de criar a sua conta, volte em **Authentication > Sign In / Providers** e desligue **Allow new users to
   sign up**. Assim ninguém mais consegue criar conta no seu projeto. Você continua entrando normalmente.

## 3. Outros aparelhos

- No aparelho que já está ligado, em **Configurações > Dados**, use **Copiar link** ou **Mandar pelo WhatsApp**
  ("Usar em outro aparelho"). Abra o link no celular ou no outro computador: o app já abre ligado à nuvem e só
  pede o e-mail e a senha.
- Ou, num aparelho novo, toque em **Entrar na minha conta** no assistente de primeiro acesso e cole a URL e a chave.

## Como funciona

- O app grava primeiro no aparelho (funciona sem internet) e envia as alterações quando há conexão.
- Busca o que mudou nos outros aparelhos ao abrir, ao voltar para o app e a cada minuto, **antes** de enviar as
  suas: assim um aparelho novo nunca apaga as configurações que já estão na nuvem.
- Se o mesmo registro mudar em dois aparelhos, vale a alteração mais recente (o servidor também confere).
- A chave **publishable** é pública por natureza: a proteção dos dados vem do login e das políticas de
  Row Level Security acima (cada usuário só acessa as próprias linhas).
- O rascunho de um acerto em andamento fica só no aparelho onde ele foi começado.
- No plano gratuito, o Supabase **pausa o projeto depois de 7 dias sem uso** (avisa por e-mail antes). Os dados
  ficam guardados: no painel, abra o projeto e clique em **Resume project**. Usar o app ao menos uma vez por
  semana evita a pausa.
