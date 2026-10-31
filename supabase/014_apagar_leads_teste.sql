-- Apaga os leads de teste da Meta ("<test lead: dummy data for ...>").
-- A sincronização já ignora esses leads, então depois de apagados eles não voltam.
-- O "returning" mostra o que foi apagado (no DELETE comum o Supabase só diz "No rows returned").

delete from vendas where lead_id in (select id from leads where nome ilike '%test lead%' or nome ilike '%dummy data%');

delete from leads
where nome ilike '%test lead%' or nome ilike '%dummy data%'
returning nome, criado_em;
