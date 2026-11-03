-- Rode no Supabase (SQL Editor > New query > cole > Run). Precisa do 017 já rodado.
-- Primeira mensagem: a conversa começa sozinha quando chega lead novo. Vem desligada.

alter table whatsapp_ia add column if not exists primeiro_contato boolean not null default false;
alter table whatsapp_ia add column if not exists primeira_mensagem text not null default '';
alter table whatsapp_ia add column if not exists primeiro_contato_limite int not null default 30;  -- máximo em 24 horas
alter table whatsapp_ia add column if not exists primeiro_contato_desde timestamptz;               -- só recebe quem chegar depois de ligar

alter table leads add column if not exists whatsapp_contato text;          -- enviado | ignorado (sem telefone válido ou já conversou)
alter table leads add column if not exists whatsapp_contato_em timestamptz;
create index if not exists leads_primeiro_contato_idx on leads (created_at) where whatsapp_contato is null;

notify pgrst, 'reload schema';
