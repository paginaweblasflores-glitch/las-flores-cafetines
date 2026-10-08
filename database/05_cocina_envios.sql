-- =====================================================================
--  LAS FLORES · MIGRACIÓN 05: usuario Cocina y envíos de productos del día
--
--  Ejecutar DESPUÉS de 04 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--
--  · Nuevo rol COCINA y usuario "Cocina" (contraseña COCINA2026)
--  · Tabla de envíos: la cocina registra lo que manda a cada colegio y el
--    personal lo recibe (conforme u observado). Solo lo recibido suma stock.
--  Se puede ejecutar más de una vez.
-- =====================================================================

begin;

-- El rol pasa de tipo enum a texto con validación (permite agregar roles nuevos)
alter table usuarios drop constraint if exists personal_requiere_colegio;
alter table usuarios alter column rol type text using rol::text;
alter table usuarios drop constraint if exists usuarios_rol_check;
alter table usuarios add constraint usuarios_rol_check check (rol in ('ADMIN', 'LOGISTICA', 'PERSONAL', 'COCINA'));
alter table usuarios add constraint personal_requiere_colegio check (rol <> 'PERSONAL' or colegio_id is not null);
drop type if exists rol_usuario;

-- ---------------------------------------------------------------------
-- ENVÍOS DE COCINA: productos del día que la cocina manda a cada colegio.
-- No suman stock hasta que el personal los recibe (conforme u observado).
-- ---------------------------------------------------------------------
create table if not exists envios (
  id                  bigint generated always as identity primary key,
  fecha               date not null default fn_hoy(),
  colegio_id          bigint not null references colegios(id) on delete cascade,
  producto_id         bigint not null references productos(id) on delete cascade,
  producto_colegio_id bigint not null references producto_colegio(id) on delete cascade,
  cantidad_enviada    int not null check (cantidad_enviada > 0),
  cantidad_recibida   int check (cantidad_recibida >= 0),
  estado              text not null default 'PENDIENTE'
                      check (estado in ('PENDIENTE', 'CONFORME', 'OBSERVADO', 'ANULADO')),
  motivo              text,
  enviado_por         bigint references usuarios(id) on delete set null,
  created_at          timestamptz not null default now(),
  recibido_por        bigint references usuarios(id) on delete set null,
  recibido_at         timestamptz
);
create index if not exists envios_colegio_estado on envios (colegio_id, estado);
create index if not exists envios_fecha on envios (fecha);

alter table envios enable row level security;

-- ---------------------------------------------------------------------
-- El personal recibe un envío de cocina: conforme (llegó todo) u
-- observado (llegó menos: se indica cuánto llegó y el motivo).
-- Solo lo recibido entra al stock del colegio.
-- ---------------------------------------------------------------------
create or replace function fn_recibir_envio(
  p_envio_id          bigint,
  p_cantidad_recibida int,
  p_motivo            text,
  p_usuario_id        bigint
) returns jsonb
language plpgsql set search_path = public as $$
declare
  e        envios;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_estado text;
  v_obs    text;
begin
  select * into e from envios where id = p_envio_id for update;
  if not found then raise exception 'Envío no encontrado'; end if;
  if e.estado <> 'PENDIENTE' then raise exception 'Este envío ya fue recibido o anulado'; end if;
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 or p_cantidad_recibida > e.cantidad_enviada then
    raise exception 'La cantidad recibida debe estar entre 0 y %', e.cantidad_enviada;
  end if;

  if p_cantidad_recibida = e.cantidad_enviada then
    v_estado := 'CONFORME';
    v_obs    := 'Envío de cocina: recibido conforme';
  else
    if v_motivo is null then raise exception 'Indica el motivo de la diferencia'; end if;
    v_estado := 'OBSERVADO';
    v_obs    := 'Envío de cocina: enviaron ' || e.cantidad_enviada || ', llegaron ' || p_cantidad_recibida
                || ' (' || v_motivo || ')';
  end if;

  update envios
     set cantidad_recibida = p_cantidad_recibida, estado = v_estado, motivo = v_motivo,
         recibido_por = p_usuario_id, recibido_at = now()
   where id = e.id;

  if p_cantidad_recibida > 0 then
    perform fn_registrar_ingreso(e.producto_colegio_id, 0, null::int, p_cantidad_recibida, null::numeric,
                                 p_usuario_id, null::date, v_obs);
  end if;

  return jsonb_build_object('estado', v_estado, 'recibido', p_cantidad_recibida,
                            'faltante', e.cantidad_enviada - p_cantidad_recibida);
end $$;

insert into usuarios (usuario, nombre, password_hash, rol, colegio_id)
select 'Cocina', 'Encargada de cocina', extensions.crypt('COCINA2026', extensions.gen_salt('bf', 10)), 'COCINA', null
where not exists (select 1 from usuarios where lower(usuario) = 'cocina');

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;
grant  all on all tables    in schema public to service_role;

commit;

-- Verificación
select usuario, rol from usuarios order by id;
