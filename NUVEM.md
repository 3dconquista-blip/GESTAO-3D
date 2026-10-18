# Sincronizar o OCTA na nuvem (opcional)

Sem nuvem, o OCTA guarda tudo no próprio aparelho (IndexedDB) e mostra o aviso
"Seus dados estão só neste aparelho. Faça backup.". Para ver os mesmos dados no celular e no
computador, ligue a sincronização com um projeto **Supabase** (plano gratuito basta).

## 1. Criar o projeto

1. Crie uma conta em https://supabase.com e um projeto novo (região São Paulo, se houver).
2. Em **Authentication > Providers**, deixe **Email** ligado. Se não quiser confirmar o e-mail ao criar a
   conta, desligue **Confirm email** (Authentication > Sign In / Providers > Email).
3. Em **SQL Editor**, rode o SQL abaixo.

```sql
-- Tabela única: cada linha é um registro do OCTA (coleção + id), sempre ligado ao usuário.
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

-- Marca a hora do servidor em cada gravação (usada para buscar só o que mudou).
create or replace function public.octa_marcar_servidor() returns trigger
language plpgsql as $$
begin
  new.servidor_em := clock_timestamp();
  return new;
end $$;

drop trigger if exists octa_registros_servidor on public.octa_registros;
create trigger octa_registros_servidor
  before insert or update on public.octa_registros
  for each row execute function public.octa_marcar_servidor();
```

## 2. Ligar no app

1. No Supabase, abra **Project Settings > API** e copie a **Project URL** e a chave **anon public**.
2. No OCTA: **Mais > Configurações > Dados > Sincronizar na nuvem**, cole a URL e a chave e toque em
   **Ligar a nuvem**.
3. Crie a conta (e-mail e senha) ou entre. Os dados que já estão no aparelho são enviados para a nuvem.
4. No outro aparelho, faça o mesmo (mesma URL, chave, e-mail e senha).

## Como funciona

- O app grava primeiro no aparelho (funciona sem internet) e envia as alterações quando há conexão.
- Busca o que mudou nos outros aparelhos ao abrir, ao voltar para o app e a cada minuto.
- Se o mesmo registro mudar em dois aparelhos, vale a alteração mais recente.
- A chave **anon** é pública por natureza: a proteção dos dados vem do login e das políticas de
  Row Level Security acima (cada usuário só acessa as próprias linhas).
- O rascunho de um acerto em andamento fica só no aparelho onde ele foi começado.
