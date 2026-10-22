-- Rode DEPOIS do 004 (SQL Editor > New query > cole > Run)

-- Foto de perfil de admins e vendedores
alter table vendedores add column if not exists foto_url text;

-- Pasta pública de imagens (até 2 MB, só jpg/png/webp). O envio é feito pelo servidor do app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
