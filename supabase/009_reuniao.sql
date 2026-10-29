-- Rode DEPOIS do 008 (SQL Editor > New query > cole > Run)
-- Etapa "Reunião agendada" (antes de Venda), com horário e resultado da reunião.

alter type lead_status add value if not exists 'reuniao' before 'venda';

-- reunião atual do lead (o que aparece no kanban)
alter table leads add column if not exists reuniao_em timestamptz;                -- data e hora marcadas
alter table leads add column if not exists reuniao_status text;                  -- agendada | feita | nao_compareceu
alter table leads drop constraint if exists leads_reuniao_status_check;
alter table leads add constraint leads_reuniao_status_check check (reuniao_status in ('agendada', 'feita', 'nao_compareceu'));
alter table leads add column if not exists reuniao_remarcacoes int not null default 0;

-- histórico de todas as reuniões (para medir comparecimento depois)
create table if not exists reunioes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  vendedor_id uuid references vendedores(id) on delete set null,
  equipe_id uuid references equipes(id) on delete set null,
  agendada_para timestamptz not null,
  resultado text check (resultado in ('feita', 'nao_compareceu', 'remarcada')),  -- vazio = ainda não aconteceu
  resultado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reunioes_lead_idx on reunioes (lead_id, created_at desc);
alter table reunioes enable row level security;

-- agendar reunião também conta como primeiro atendimento (tempo do dashboard)
create or replace function marcar_tempos_lead() returns trigger language plpgsql as $$
begin
  if new.vendedor_id is not null and new.atendido_em is null
     and (tg_op = 'INSERT' or new.vendedor_id is distinct from old.vendedor_id) then
    new.atribuido_em := now();
  end if;
  if new.atendido_em is null and new.status::text in ('atendimento', 'quente', 'frio', 'reuniao', 'venda')
     and (tg_op = 'INSERT' or old.status = 'lead') then
    new.atendido_em := now();
    new.atendido_por := new.vendedor_id;
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
