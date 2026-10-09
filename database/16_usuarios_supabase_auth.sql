-- =====================================================================
--  LAS FLORES · MIGRACIÓN 16: el inicio de sesión pasa a Supabase Auth
--
--  Ejecutar DESPUÉS de 15 si tu base ya existía.
--  (Si vas a empezar de cero, 01 ya lo trae incluido.)
--  Se puede ejecutar más de una vez.
--
--  Cada usuario del sistema queda ligado a un usuario de Supabase Auth
--  (Authentication → Users) con un correo interno, por ejemplo
--  administradora@lasflores.co. Nadie tiene que saber ese correo: en el
--  login se sigue eligiendo el usuario y escribiendo la contraseña.
--
--  DESPUÉS de ejecutar este SQL, crear las cuentas en Supabase Auth con:
--      node scripts/usuarios-a-supabase-auth.mjs
--  (conserva las contraseñas actuales: copia su cifrado, no hace falta saberlas)
-- =====================================================================

begin;

-- Usuario de Supabase Auth (auth.users.id) y su correo interno
alter table usuarios add column if not exists auth_id uuid;
alter table usuarios add column if not exists email text;
create unique index if not exists usuarios_auth_id_unico on usuarios (auth_id) where auth_id is not null;
create unique index if not exists usuarios_email_unico on usuarios (lower(email)) where email is not null;

-- La contraseña ahora la guarda Supabase Auth; esta columna solo sirve para pasar las cuentas antiguas
alter table usuarios alter column password_hash drop not null;

commit;

select usuario, rol, coalesce(email, '(falta crear en Supabase Auth)') as correo from usuarios order by id;
