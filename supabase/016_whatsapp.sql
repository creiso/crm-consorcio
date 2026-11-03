-- Rode DEPOIS do 015 (SQL Editor > New query > cole > Run)
-- WhatsApp pela API própria (conector no PC do escritório): situação da conexão e mensagens.

-- uma linha só: situação atual do conector
create table if not exists whatsapp_conexao (
  id int primary key default 1 check (id = 1),
  estado text not null default 'desconectado',   -- desconectado | qr | conectado
  qr text,                                       -- código para ler com o celular do chip
  numero text,
  aviso text,                                    -- problema para mostrar na tela (ex.: número recusado)
  visto_em timestamptz                           -- último contato do conector com o CRM
);
insert into whatsapp_conexao (id) values (1) on conflict (id) do nothing;
alter table whatsapp_conexao enable row level security;

create table if not exists whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique,                             -- id da mensagem no WhatsApp (evita repetir)
  lead_id uuid references leads(id) on delete set null,
  telefone text not null,
  direcao text not null check (direcao in ('recebida', 'enviada')),
  origem text not null check (origem in ('cliente', 'crm', 'celular', 'ia')),
  texto text not null,
  status text not null check (status in ('recebida', 'pendente', 'enviando', 'enviada', 'falhou', 'expirada')),
  erro text,
  criada_em timestamptz not null default now(),
  enviando_em timestamptz,
  enviada_em timestamptz,
  criada_por uuid references vendedores(id) on delete set null
);
create index if not exists whatsapp_mensagens_fila_idx on whatsapp_mensagens (criada_em) where status in ('pendente', 'enviando');
create index if not exists whatsapp_mensagens_lead_idx on whatsapp_mensagens (lead_id, criada_em desc);
create index if not exists whatsapp_mensagens_recentes_idx on whatsapp_mensagens (criada_em desc);
alter table whatsapp_mensagens enable row level security;

notify pgrst, 'reload schema';
