-- Rode no Supabase: SQL Editor > New query > cole tudo > Run

create type lead_status as enum ('lead', 'atendimento', 'quente', 'frio', 'venda', 'descarte');
create type pagamento_status as enum ('aguardando', 'concluido', 'cancelado');

create table vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  -- chave de deduplicação: id da planilha, telefone ou e-mail normalizado
  external_key text not null unique,
  nome text not null,
  telefone text,
  email text,
  cidade text,
  interesse text,           -- imóvel, automóvel, serviços...
  valor_pretendido numeric(14,2),
  origem text,              -- 'planilha', 'google_sheets', 'manual'
  status lead_status not null default 'lead',
  vendedor_id uuid references vendedores(id),
  observacoes text,
  dados_extras jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_status_idx on leads(status);

create table vendas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete restrict,
  vendedor_id uuid not null references vendedores(id),
  valor numeric(14,2) not null check (valor > 0),
  tipo text not null default 'imovel',  -- imovel | automovel | servicos
  grupo text,
  cota text,
  pagamento pagamento_status not null default 'aguardando',
  created_at timestamptz not null default now()
);

create index vendas_created_idx on vendas(created_at desc);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger leads_touch before update on leads
  for each row execute function touch_updated_at();

-- Acesso só pelo servidor (service role). Nada exposto à anon key.
alter table vendedores enable row level security;
alter table leads enable row level security;
alter table vendas enable row level security;

insert into vendedores (nome) values ('Vendedor 1'), ('Vendedor 2');
