-- Rode DEPOIS do 002 (SQL Editor > New query > cole > Run)

-- Roleta: rodízio automático de leads entre vendedores
alter table vendedores add column if not exists na_roleta boolean not null default true;
alter table vendedores add column if not exists ultimo_lead_em timestamptz;  -- quem recebeu há mais tempo é o próximo

-- Cada planilha escolhe: roleta, vendedor fixo (vendedor_padrao_id) ou manual (nenhum dos dois)
alter table planilhas add column if not exists roleta boolean not null default false;

-- Faz a API do Supabase enxergar as colunas novas na hora
notify pgrst, 'reload schema';
