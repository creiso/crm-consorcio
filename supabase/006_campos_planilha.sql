-- Rode DEPOIS do 005 (SQL Editor > New query > cole > Run)
-- Campos do padrão das planilhas de lead (formulário do Facebook/Instagram)

alter table leads add column if not exists criado_em timestamptz;      -- created_time: quando o lead foi criado de verdade
alter table leads add column if not exists renda text;                 -- qual_sua_renda_mensal?
alter table leads add column if not exists valor_consorcio text;       -- valor_do_consorcio (texto como veio da planilha)
alter table leads add column if not exists conhece_consorcio text;     -- você_sabe_como_funciona_o_consórcio?
alter table leads add column if not exists plataforma text;            -- platform (ig = Instagram, fb = Facebook)
alter table leads add column if not exists campanha text;              -- campaign_name
alter table leads add column if not exists conjunto text;              -- adset_name
alter table leads add column if not exists anuncio text;               -- ad_name
alter table leads add column if not exists formulario text;            -- form_name

-- Leads que já existem: usa a data de entrada no sistema por enquanto.
-- A sincronização (a cada 1 minuto) troca pela data real do created_time e preenche os campos novos.
update leads set criado_em = created_at where criado_em is null;
alter table leads alter column criado_em set default now();
alter table leads alter column criado_em set not null;

create index if not exists leads_criado_em_idx on leads (criado_em desc);

notify pgrst, 'reload schema';
