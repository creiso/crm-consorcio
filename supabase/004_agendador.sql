-- Sincroniza todas as planilhas ativas a cada 1 minuto, chamando o app pela internet.
-- Use o arquivo 004_agendador.local.sql (gerado com o seu CRON_SECRET, fora do git), ou troque os dois valores abaixo.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- recria o agendamento se já existir
select cron.unschedule('sync-planilhas') where exists (select 1 from cron.job where jobname = 'sync-planilhas');

select cron.schedule(
  'sync-planilhas',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://SEU-APP.vercel.app/api/sheets-sync',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Para conferir as últimas execuções:
-- select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Para desligar:
-- select cron.unschedule('sync-planilhas');
