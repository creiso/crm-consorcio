-- JUNTA os leads repetidos (mesmo telefone) num só. APAGA as cópias — rode só depois de ver o 012.
-- Fica o lead mais "trabalhado": o que tem venda, depois o que já saiu da coluna Lead,
-- depois o que tem consultor e, por fim, o mais antigo. Vendas e reuniões das cópias passam para ele.

create temp table juntar as
with base as (
  select l.id, l.created_at, l.status, l.vendedor_id,
    case when length(t.d) >= 12 and t.d like '55%' then substr(t.d, 3) else t.d end as tel,
    (select count(*) from vendas v where v.lead_id = l.id) as qtd_vendas
  from leads l
  cross join lateral (select regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') as d) t
  where length(t.d) >= 10
), ordem as (
  select id,
    row_number() over w as posicao,
    first_value(id) over w as fica
  from base
  window w as (partition by tel order by qtd_vendas desc, (status <> 'lead') desc, (vendedor_id is not null) desc, created_at asc)
)
select id as sai, fica from ordem where posicao > 1;

update vendas v set lead_id = j.fica from juntar j where v.lead_id = j.sai;
update reunioes r set lead_id = j.fica from juntar j where r.lead_id = j.sai;
delete from leads where id in (select sai from juntar);

select count(*) as copias_apagadas, count(distinct fica) as leads_que_ficaram from juntar;
