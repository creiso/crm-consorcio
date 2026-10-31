-- Rode DEPOIS do 009 (SQL Editor > New query > cole > Run)
-- API de Conversões da Meta (integração de CRM): cada mudança de etapa do lead vira um evento
-- numa fila; o sistema envia a fila para a Meta a cada minuto e reenvia o que falhar.

create table if not exists eventos_meta (
  id bigserial primary key,
  lead_id uuid not null references leads(id) on delete cascade,
  evento text not null,                       -- etapa do kanban (lead, atendimento, ...) ou reuniao_feita
  ocorrido_em timestamptz not null default now(),
  enviado_em timestamptz,                     -- vazio = ainda na fila
  tentativas int not null default 0,
  erro text
);
create index if not exists eventos_meta_fila_idx on eventos_meta (ocorrido_em) where enviado_em is null;
alter table eventos_meta enable row level security;

-- gatilho: lead novo, troca de etapa e reunião marcada como feita
create or replace function registrar_evento_meta() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into eventos_meta (lead_id, evento) values (new.id, new.status::text);
  end if;
  if tg_op = 'UPDATE' and new.reuniao_status = 'feita' and old.reuniao_status is distinct from 'feita' then
    insert into eventos_meta (lead_id, evento) values (new.id, 'reuniao_feita');
  end if;
  return null;
end $$;

drop trigger if exists leads_eventos_meta on leads;
create trigger leads_eventos_meta after insert or update on leads
  for each row execute function registrar_evento_meta();

-- Leads dos últimos 7 dias (a Meta só aceita eventos de até 7 dias atrás): manda a etapa atual.
insert into eventos_meta (lead_id, evento, ocorrido_em)
select id, status::text, greatest(coalesce(criado_em, created_at), now() - interval '6 days')
from leads
where coalesce(criado_em, created_at) > now() - interval '7 days'
  and not exists (select 1 from eventos_meta e where e.lead_id = leads.id);

notify pgrst, 'reload schema';
