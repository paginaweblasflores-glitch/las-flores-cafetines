-- =====================================================================
--  LAS FLORES · 17: PING PARA QUE SUPABASE NO SE PAUSE
--
--  En el plan gratuito, Supabase pausa el proyecto tras 7 días sin actividad.
--  Un workflow de GitHub (.github/workflows/keepalive.yml) llama una vez al día
--  a esta función con la llave pública (anon).
--
--  La llave pública no puede leer ninguna tabla (01_tablas.sql le quita todos
--  los permisos). Esta función solo devuelve 1: no lee ni escribe datos.
--  Es lo único que la llave pública puede ejecutar.
--
--  Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function fn_ping()
returns int
language sql
stable
set search_path = public
as $$ select 1 $$;

revoke all on function fn_ping() from public;
grant execute on function fn_ping() to anon;

-- Comprobación: debe devolver 1
select fn_ping() as ping;
