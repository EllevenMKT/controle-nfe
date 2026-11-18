-- Controle de NF-e e boletos — estrutura do banco (Supabase / Postgres)
-- Só quem tiver o e-mail cadastrado na tabela "membros" enxerga e altera os dados.

create table if not exists public.membros (
  email      text primary key,
  criado_em  timestamptz not null default now()
);

create table if not exists public.nfes (
  id         uuid primary key default gen_random_uuid(),
  numero     text not null,
  serie      text,
  emitente   text not null,
  cnpj       text,
  emissao    date,
  valor      numeric(14,2) not null default 0,
  chave      text,
  obs        text,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists public.boletos (
  id         uuid primary key default gen_random_uuid(),
  nfe_id     uuid references public.nfes(id) on delete cascade,
  parcela    text,
  valor      numeric(14,2) not null default 0,
  venc       date not null,
  banco      text,
  linha      text,
  pago       boolean not null default false,
  pago_em    date,
  obs        text,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create index if not exists boletos_nfe_idx  on public.boletos(nfe_id);
create index if not exists boletos_venc_idx on public.boletos(venc) where not pago;

-- Quem é membro?
create or replace function public.eh_membro()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.eh_membro() from public;
grant execute on function public.eh_membro() to authenticated;

alter table public.membros enable row level security;
alter table public.nfes    enable row level security;
alter table public.boletos enable row level security;

drop policy if exists "membro ve o proprio cadastro" on public.membros;
create policy "membro ve o proprio cadastro" on public.membros
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "membros gerenciam notas" on public.nfes;
create policy "membros gerenciam notas" on public.nfes
  for all to authenticated using (public.eh_membro()) with check (public.eh_membro());

drop policy if exists "membros gerenciam boletos" on public.boletos;
create policy "membros gerenciam boletos" on public.boletos
  for all to authenticated using (public.eh_membro()) with check (public.eh_membro());

-- Atualização em tempo real entre aparelhos
do $$ begin
  alter publication supabase_realtime add table public.nfes, public.boletos;
exception when duplicate_object then null; end $$;

-- Libere o seu e-mail (e de quem mais for usar):
-- insert into public.membros(email) values ('voce@exemplo.com');
