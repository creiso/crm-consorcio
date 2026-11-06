-- Rode no Supabase (SQL Editor > New query > cole > Run). Não depende dos arquivos anteriores estarem pendentes ou não.
-- Motivo do descarte e edição do lead (o que foi corrigido à mão não volta ao valor da planilha).

alter table leads add column if not exists motivo_descarte text;      -- um dos motivos fixos (lib/descarte.ts)
alter table leads add column if not exists descarte_obs text;
alter table leads add column if not exists descartado_em timestamptz;
alter table leads add column if not exists campos_editados text[] not null default '{}';
create index if not exists leads_motivo_descarte_idx on leads (motivo_descarte) where motivo_descarte is not null;

notify pgrst, 'reload schema';
