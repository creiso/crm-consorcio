-- Rode no Supabase (SQL Editor > New query > cole > Run). Precisa do 016 já rodado.
-- IA do WhatsApp: configuração, situação de cada conversa e aviso no card do lead.

-- uma linha só: como a IA está configurada
create table if not exists whatsapp_ia (
  id int primary key default 1 check (id = 1),
  modo text not null default 'teste' check (modo in ('desligada', 'teste', 'ligada')),
  numeros_teste text[] not null default '{}',
  instrucoes text not null default '',           -- o que a IA precisa saber da empresa
  exemplos text not null default '',             -- conversas boas, já sem dados pessoais
  erro text,                                     -- último problema ao chamar a IA (aparece na tela)
  erro_em timestamptz,
  parada_ate timestamptz                         -- depois de um erro, só tenta de novo a partir daqui
);
insert into whatsapp_ia (id) values (1) on conflict (id) do nothing;
alter table whatsapp_ia enable row level security;

-- uma linha por conversa (o mesmo celular com ou sem o 9 é uma conversa só)
create table if not exists whatsapp_conversas (
  chave text primary key,
  telefone text not null,                        -- como o WhatsApp conhece o número (para responder)
  lead_id uuid references leads(id) on delete set null,
  ultima_recebida_em timestamptz,
  aguardando_ia boolean not null default false,  -- chegou mensagem que ainda não foi tratada
  tentativas_ia int not null default 0,          -- falhas seguidas ao chamar a IA
  ia_pausada boolean not null default false,     -- um consultor assumiu a conversa
  motivo text,                                   -- por que a IA parou (o consultor lê)
  pausada_em timestamptz
);
create index if not exists whatsapp_conversas_fila_idx on whatsapp_conversas (ultima_recebida_em) where aguardando_ia;
create index if not exists whatsapp_conversas_lead_idx on whatsapp_conversas (lead_id);
alter table whatsapp_conversas enable row level security;

create index if not exists whatsapp_mensagens_telefone_idx on whatsapp_mensagens (telefone, criada_em desc);
-- quando o CRM ficou sabendo da mensagem: mostra o que a IA já tinha visto ao responder
alter table whatsapp_mensagens add column if not exists registrada_em timestamptz not null default now();

-- aviso no card do Kanban: ia | aguardando (cliente esperando o consultor) | consultor
alter table leads add column if not exists whatsapp_status text;
alter table leads add column if not exists whatsapp_motivo text;

notify pgrst, 'reload schema';
