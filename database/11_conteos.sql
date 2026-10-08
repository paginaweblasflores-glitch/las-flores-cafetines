-- =====================================================================
--  LAS FLORES · MIGRACIÓN 11: conteos por fecha (del día y semanal)
--
--  Ejecutar DESPUÉS de 09 si tu base ya existía (y ANTES del 10 si vas a vaciar).
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--  Se puede ejecutar más de una vez.
--
--  Cada "Guardar conteo" del personal queda dentro de un registro con fecha:
--    · Conteo del día   → uno por colegio y día   (productos del día)
--    · Conteo semanal   → uno por colegio y semana (fecha = lunes)
--  y por producto: cuánto había, cuánto quedó, cuánto se vendió y el sobrante.
-- =====================================================================

begin;

create table if not exists conteos (
  id          bigint generated always as identity primary key,
  colegio_id  bigint not null references colegios(id) on delete cascade,
  tipo        text not null check (tipo in ('DIA', 'SEMANA')),
  -- DIA: el día del conteo · SEMANA: el lunes de esa semana
  fecha       date not null,
  usuario_id  bigint references usuarios(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (colegio_id, tipo, fecha)
);
create index if not exists conteos_fecha on conteos (tipo, fecha desc);

create table if not exists conteo_items (
  id                  bigint generated always as identity primary key,
  conteo_id           bigint not null references conteos(id) on delete cascade,
  producto_colegio_id bigint not null references producto_colegio(id) on delete cascade,
  producto_id         bigint not null references productos(id) on delete cascade,
  habia               int not null,
  quedan              int not null,
  -- Si corrigen el mismo día se acumula (una corrección puede restar ventas)
  vendido             int not null default 0,
  ajuste              int not null default 0,
  precio              numeric(10,2) not null default 0,
  monto               numeric(12,2) not null default 0,
  sobrante            int not null default 0,
  motivo              text,
  usuario_id          bigint references usuarios(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (conteo_id, producto_colegio_id)
);
create index if not exists conteo_items_conteo on conteo_items (conteo_id);

-- ---------------------------------------------------------------------
-- Anota un producto contado en el conteo de hoy (o de esta semana)
-- ---------------------------------------------------------------------
create or replace function fn_anotar_conteo(
  p_producto_colegio_id bigint,
  p_habia               int,
  p_quedan              int,
  p_vendido             int,
  p_ajuste              int,
  p_precio              numeric,
  p_sobrante            int,
  p_motivo              text,
  p_usuario_id          bigint
) returns bigint
language plpgsql set search_path = public as $$
declare
  r       producto_colegio;
  v_tipo  text;
  v_fecha date;
  v_id    bigint;
begin
  select * into r from producto_colegio where id = p_producto_colegio_id;
  if not found then raise exception 'Producto no encontrado'; end if;
  select case when perecible then 'DIA' else 'SEMANA' end into v_tipo from productos where id = r.producto_id;
  v_fecha := case when v_tipo = 'DIA' then fn_hoy() else date_trunc('week', fn_hoy())::date end;

  insert into conteos (colegio_id, tipo, fecha, usuario_id)
  values (r.colegio_id, v_tipo, v_fecha, p_usuario_id)
  on conflict (colegio_id, tipo, fecha) do update set usuario_id = excluded.usuario_id, updated_at = now()
  returning id into v_id;

  insert into conteo_items (conteo_id, producto_colegio_id, producto_id, habia, quedan, vendido, ajuste,
                            precio, monto, sobrante, motivo, usuario_id)
  values (v_id, r.id, r.producto_id, p_habia, p_quedan, coalesce(p_vendido, 0), coalesce(p_ajuste, 0),
          coalesce(p_precio, 0), coalesce(p_vendido, 0) * coalesce(p_precio, 0), coalesce(p_sobrante, 0),
          nullif(trim(coalesce(p_motivo, '')), ''), p_usuario_id)
  on conflict (conteo_id, producto_colegio_id) do update
     set quedan     = excluded.quedan,
         vendido    = conteo_items.vendido + excluded.vendido,
         ajuste     = conteo_items.ajuste + excluded.ajuste,
         precio     = excluded.precio,
         monto      = conteo_items.monto + excluded.monto,
         sobrante   = conteo_items.sobrante + excluded.sobrante,
         motivo     = coalesce(excluded.motivo, conteo_items.motivo),
         usuario_id = excluded.usuario_id,
         updated_at = now();
  return v_id;
end $$;

alter table conteos      enable row level security;
alter table conteo_items enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;
grant  all on all tables    in schema public to service_role;
grant  all on all sequences in schema public to service_role;

commit;

select 'conteos por fecha lista' as estado;
