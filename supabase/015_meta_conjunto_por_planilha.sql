-- Rode DEPOIS do 014 (SQL Editor > New query > cole > Run)
-- Cada planilha manda os eventos para o conjunto de dados da Meta ligado ao formulário dela.

alter table planilhas add column if not exists meta_dataset_id text;

-- Preenche pelo nome do formulário gravado nos leads de cada planilha:
-- "FORM 2" e "claude form" → 1651429542529770; os demais → 1818084516284638.
update planilhas p set meta_dataset_id = case
  when exists (select 1 from leads l where l.origem = 'sheets:' || p.id::text and lower(l.formulario) in ('form 2', 'claude form'))
    then '1651429542529770'
  else '1818084516284638'
end
where p.meta_dataset_id is null;

notify pgrst, 'reload schema';

-- confira o resultado (dá para trocar depois na tela Planilhas → editar)
select nome, meta_dataset_id from planilhas order by nome;
