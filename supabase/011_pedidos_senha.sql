-- Rode DEPOIS do 010 (SQL Editor > New query > cole > Run)
-- "Esqueci minha senha": o pedido vira uma notificação para o admin na tela Equipes.

create table if not exists pedidos_senha (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolvido_em timestamptz        -- vazio = esperando o admin
);
create index if not exists pedidos_senha_abertos_idx on pedidos_senha (created_at desc) where resolvido_em is null;
alter table pedidos_senha enable row level security;

notify pgrst, 'reload schema';
