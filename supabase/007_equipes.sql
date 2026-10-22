-- Rode DEPOIS do 006 (SQL Editor > New query > cole > Run)
-- Equipes, nível Coordenador e distribuição das planilhas por equipe

create table if not exists equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);
alter table equipes enable row level security;

-- Níveis de acesso: admin, coordenador (líder de uma equipe) e vendedor
alter table vendedores drop constraint if exists vendedores_papel_check;
alter table vendedores add constraint vendedores_papel_check check (papel in ('admin', 'coordenador', 'vendedor'));
alter table vendedores add column if not exists equipe_id uuid references equipes(id) on delete set null;

-- Lead e venda guardam a equipe (a venda fica com a equipe do momento da venda)
alter table leads add column if not exists equipe_id uuid references equipes(id) on delete set null;
create index if not exists leads_equipe_idx on leads (equipe_id);
alter table vendas add column if not exists equipe_id uuid references equipes(id) on delete set null;
create index if not exists vendas_equipe_idx on vendas (equipe_id);

-- Planilhas: para quais equipes (lista vazia = todas) e se a distribuição é automática (roleta) ou manual
alter table planilhas add column if not exists equipes uuid[] not null default '{}';
alter table planilhas add column if not exists modo text not null default 'automatica';
alter table planilhas drop constraint if exists planilhas_modo_check;
alter table planilhas add constraint planilhas_modo_check check (modo in ('automatica', 'manual'));
update planilhas set modo = case when roleta then 'automatica' else 'manual' end;

notify pgrst, 'reload schema';
