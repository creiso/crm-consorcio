-- Rode DEPOIS do 007 (SQL Editor > New query > cole > Run)
-- Tempo até o primeiro atendimento: do lead chegar no consultor até sair da coluna "Lead".

alter table leads add column if not exists atribuido_em timestamptz;   -- quando o lead chegou no consultor atual
alter table leads add column if not exists atendido_em timestamptz;    -- 1ª vez que saiu de "Lead" para atendimento/quente/frio/venda
alter table leads add column if not exists atendido_por uuid references vendedores(id) on delete set null;

-- Um gatilho no banco marca os horários, então vale para tudo: roleta, distribuição manual,
-- arrastar no kanban e registrar venda.
create or replace function marcar_tempos_lead() returns trigger language plpgsql as $$
begin
  -- ganhou dono (ou trocou de dono antes de ser atendido): o relógio começa agora
  if new.vendedor_id is not null and new.atendido_em is null
     and (tg_op = 'INSERT' or new.vendedor_id is distinct from old.vendedor_id) then
    new.atribuido_em := now();
  end if;
  -- saiu da coluna Lead pela primeira vez (descarte não conta como atendimento): o relógio para
  if new.atendido_em is null and new.status in ('atendimento', 'quente', 'frio', 'venda')
     and (tg_op = 'INSERT' or old.status = 'lead') then
    new.atendido_em := now();
    new.atendido_por := new.vendedor_id;
  end if;
  return new;
end $$;

drop trigger if exists leads_tempos on leads;
create trigger leads_tempos before insert or update on leads
  for each row execute function marcar_tempos_lead();

-- Leads que já estão com um consultor esperando atendimento: conta a partir da entrada no sistema.
update leads set atribuido_em = created_at
where atribuido_em is null and vendedor_id is not null and status = 'lead';

create index if not exists leads_atendido_em_idx on leads (atendido_em);

notify pgrst, 'reload schema';
