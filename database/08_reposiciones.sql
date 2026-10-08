-- =====================================================================
--  LAS FLORES · MIGRACIÓN 08: reposiciones (lista de pedido del personal)
--
--  Ejecutar DESPUÉS de 07 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--  Se puede ejecutar más de una vez.
--
--  Reemplaza los "pedidos" de la 07 (un producto a la vez) por una lista
--  completa, como la que el personal mandaba por WhatsApp:
--    personal arma la lista → administración la aprueba (puede quitar o
--    cambiar cantidades) → logística la ve aprobada y empieza la compra.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- REPOSICIONES: una lista de pedido de un cafetín
--   POR_APROBAR → APROBADA → EN_COMPRA
--              ↘ RECHAZADA (no aprobada)      · ANULADA (la anuló el personal)
-- ---------------------------------------------------------------------
create table if not exists reposiciones (
  id             bigint generated always as identity primary key,
  codigo         text generated always as ('REP-' || lpad(id::text, 4, '0')) stored,
  colegio_id     bigint not null references colegios(id) on delete cascade,
  estado         text not null default 'POR_APROBAR'
                 check (estado in ('POR_APROBAR', 'APROBADA', 'RECHAZADA', 'EN_COMPRA', 'ANULADA')),
  nota           text,
  pedido_por     bigint references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  revisado_por   bigint references usuarios(id) on delete set null,
  revisado_at    timestamptz,
  motivo_rechazo text,
  compra_por     bigint references usuarios(id) on delete set null,
  compra_at      timestamptz
);
create index if not exists reposiciones_estado on reposiciones (estado, colegio_id);
create index if not exists reposiciones_fecha on reposiciones (created_at desc);

-- Cada producto de la lista: del catálogo (producto_id) o escrito a mano (fuera de catálogo)
create table if not exists reposicion_items (
  id                bigint generated always as identity primary key,
  reposicion_id     bigint not null references reposiciones(id) on delete cascade,
  producto_id       bigint references productos(id) on delete set null,
  nombre            text not null check (length(trim(nombre)) > 0),
  cantidad          int not null check (cantidad > 0),
  unidad            text not null check (unidad in ('UNIDAD', 'PAQUETE', 'CAJA', 'BOLSA', 'DOCENA', 'KILO')),
  -- Lo decide administración al revisar
  quitado           boolean not null default false,
  cantidad_aprobada int check (cantidad_aprobada > 0),
  orden             int not null default 0
);
create index if not exists reposicion_items_reposicion on reposicion_items (reposicion_id);

-- ---------------------------------------------------------------------
-- El personal envía su lista
--   p_items: [{ "producto_id": 12 | null, "nombre": "Cucharón", "cantidad": 2, "unidad": "UNIDAD" }]
-- ---------------------------------------------------------------------
create or replace function fn_crear_reposicion(
  p_colegio_id bigint,
  p_usuario_id bigint,
  p_nota       text,
  p_items      jsonb
) returns jsonb
language plpgsql set search_path = public as $$
declare
  r      reposiciones;
  it     jsonb;
  v_ord  int := 0;
  v_prod bigint;
  v_nom  text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La lista está vacía';
  end if;

  insert into reposiciones (colegio_id, nota, pedido_por)
  values (p_colegio_id, nullif(trim(coalesce(p_nota, '')), ''), p_usuario_id)
  returning * into r;

  for it in select * from jsonb_array_elements(p_items) loop
    v_ord  := v_ord + 1;
    v_prod := nullif(it->>'producto_id', '')::bigint;
    v_nom  := trim(coalesce(it->>'nombre', ''));
    -- Del catálogo: el nombre sale del catálogo
    if v_prod is not null then
      select nombre into v_nom from productos where id = v_prod;
      if not found then raise exception 'Producto no encontrado en el catálogo'; end if;
    end if;
    if v_nom = '' then raise exception 'Falta el nombre de un producto'; end if;
    if coalesce((it->>'cantidad')::int, 0) <= 0 then
      raise exception 'La cantidad de "%" debe ser mayor a 0', v_nom;
    end if;

    insert into reposicion_items (reposicion_id, producto_id, nombre, cantidad, unidad, orden)
    values (r.id, v_prod, v_nom, (it->>'cantidad')::int, upper(coalesce(it->>'unidad', 'UNIDAD')), v_ord);
  end loop;

  return jsonb_build_object('id', r.id, 'codigo', r.codigo);
end $$;

-- ---------------------------------------------------------------------
-- Administración revisa la lista
--   aprobar: p_items trae lo que queda [{ "id": 5, "cantidad": 3 }]; lo que no viene se quita
--   no aprobar: p_aprobar = false y un motivo opcional
-- ---------------------------------------------------------------------
create or replace function fn_revisar_reposicion(
  p_reposicion_id bigint,
  p_usuario_id    bigint,
  p_aprobar       boolean,
  p_items         jsonb,
  p_motivo        text
) returns text
language plpgsql set search_path = public as $$
declare
  r reposiciones;
begin
  select * into r from reposiciones where id = p_reposicion_id for update;
  if not found then raise exception 'Reposición no encontrada'; end if;
  if r.estado <> 'POR_APROBAR' then raise exception 'Esta reposición ya fue revisada o anulada'; end if;

  if not p_aprobar then
    update reposiciones
       set estado = 'RECHAZADA', revisado_por = p_usuario_id, revisado_at = now(),
           motivo_rechazo = nullif(trim(coalesce(p_motivo, '')), '')
     where id = r.id;
    return 'RECHAZADA';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Deja al menos un producto para aprobar (o usa "No aprobar")';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) x where coalesce((x->>'cantidad')::int, 0) <= 0) then
    raise exception 'Las cantidades aprobadas deben ser mayores a 0';
  end if;

  update reposicion_items i
     set quitado = (x.cantidad is null),
         cantidad_aprobada = case when x.cantidad is not null and x.cantidad <> i.cantidad then x.cantidad end
    from (select ri.id, y.cantidad
            from reposicion_items ri
            left join (select (e->>'id')::bigint as id, (e->>'cantidad')::int as cantidad
                         from jsonb_array_elements(p_items) e) y on y.id = ri.id
           where ri.reposicion_id = r.id) x
   where i.id = x.id;

  if not exists (select 1 from reposicion_items where reposicion_id = r.id and not quitado) then
    raise exception 'Deja al menos un producto para aprobar (o usa "No aprobar")';
  end if;

  update reposiciones
     set estado = 'APROBADA', revisado_por = p_usuario_id, revisado_at = now(), motivo_rechazo = null
   where id = r.id;
  return 'APROBADA';
end $$;

-- Los "pedidos" de la 07 se reemplazan por las reposiciones (solo se borra si está vacía)
do $$
begin
  if to_regclass('public.pedidos') is not null then
    if not exists (select 1 from pedidos) then
      drop table pedidos;
    end if;
  end if;
end $$;

alter table reposiciones     enable row level security;
alter table reposicion_items enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;
grant  all on all tables    in schema public to service_role;
grant  all on all sequences in schema public to service_role;

commit;

select 'reposiciones lista' as estado;
