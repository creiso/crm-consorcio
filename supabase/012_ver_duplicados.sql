-- SÓ CONSULTA, não altera nada. Mostra os leads repetidos (mesmo telefone) e de onde cada um veio.
-- (não mostra nome nem telefone, só quantos, o motivo e as planilhas)
with base as (
  select l.created_at,
    substring(l.external_key from 'l:(\d{15,17})$') as id_meta,
    coalesce(p.nome, case when l.origem like 'sheets:%' then 'planilha removida' else 'arquivo importado' end) as fonte,
    case when length(t.d) >= 12 and t.d like '55%' then substr(t.d, 3) else t.d end as tel
  from leads l
  cross join lateral (select regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') as d) t
  left join planilhas p on l.origem = 'sheets:' || p.id::text
  where length(t.d) >= 10
)
select
  count(*) as leads_iguais,
  case
    when count(distinct id_meta) = 1 and count(id_meta) = count(*) then 'mesmo lead da Meta em mais de uma planilha (ou planilha recadastrada)'
    when count(distinct id_meta) > 1 then 'a pessoa preencheu o formulário mais de uma vez'
    else 'veio por arquivo importado e pela planilha'
  end as motivo,
  string_agg(distinct fonte, ' | ') as de_onde_veio,
  min(created_at)::date as entrou_primeiro,
  max(created_at)::date as entrou_depois
from base
group by tel
having count(*) > 1
order by leads_iguais desc, entrou_depois desc;
