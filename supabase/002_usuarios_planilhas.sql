-- Rode DEPOIS do schema.sql (SQL Editor > New query > cole > Run)

-- Cada vendedor/admin é um usuário do Supabase Auth
alter table vendedores add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table vendedores add column if not exists email text unique;
alter table vendedores add column if not exists papel text not null default 'vendedor' check (papel in ('admin', 'vendedor'));

-- Remove os vendedores de exemplo (serão criados pela tela Usuários)
delete from vendedores where user_id is null and nome in ('Vendedor 1', 'Vendedor 2');

-- Planilhas do Google cadastradas pelo admin
create table if not exists planilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  csv_url text not null,
  vendedor_padrao_id uuid references vendedores(id),  -- leads sem vendedor vão para este
  ativo boolean not null default true,
  ultima_sync timestamptz,
  ultimo_resultado text,
  created_at timestamptz not null default now()
);
alter table planilhas enable row level security;

create index if not exists leads_vendedor_idx on leads(vendedor_id);
