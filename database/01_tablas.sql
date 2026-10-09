-- =====================================================================
--  LAS FLORES · SISTEMA DE CAFETINES
--  Archivo 1 de 2: ESTRUCTURA (tablas, vistas, funciones y seguridad)
--
--  Cómo usar:
--    1. Supabase → SQL Editor → New query
--    2. Pegar TODO este archivo y presionar RUN
--    3. Luego ejecutar 02_datos.sql
--
--  El script se puede volver a ejecutar: borra y recrea todo
--  (¡OJO! borra también los datos si ya existían).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Limpieza (permite re-ejecutar el script)
-- ---------------------------------------------------------------------
drop view if exists v_ventas_diarias cascade;
drop function if exists fn_abrir_caja(bigint, int, bigint);
drop function if exists fn_registrar_conteo(bigint, int, bigint, text);
drop function if exists fn_registrar_ingreso(bigint, int, int, numeric, bigint, date, text);
drop function if exists fn_registrar_ingreso(bigint, int, int, int, numeric, bigint, date, text);
drop function if exists fn_ajustar_stock(bigint, int, int, tipo_movimiento, bigint, text);
drop function if exists fn_ajustar_stock(bigint, int, tipo_movimiento, bigint, text);
drop view if exists v_stock cascade;
drop table if exists pedidos cascade;
drop table if exists reposicion_items cascade;
drop table if exists conteo_items cascade;
drop table if exists conteos cascade;
drop table if exists reportes_mensuales cascade;
drop table if exists reposiciones cascade;
drop table if exists envios cascade;
drop table if exists cierres_dia cascade;
drop function if exists fn_recibir_envio(bigint, int, text, bigint);
drop table if exists historial_precios cascade;
drop table if exists movimientos cascade;
drop table if exists producto_colegio cascade;
drop table if exists productos cascade;
drop table if exists categorias cascade;
drop table if exists usuarios cascade;
drop table if exists colegios cascade;
drop type if exists rol_usuario cascade;
drop type if exists tipo_presentacion cascade;
drop type if exists tipo_movimiento cascade;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------

create type tipo_presentacion as enum ('UNIDAD', 'CAJA', 'PAQUETE', 'BOLSA', 'OTRO');

-- INGRESO   : logística entrega mercadería al colegio (suma stock)
-- VENTA     : unidades vendidas (se calcula sola cuando el personal cuenta su stock)
-- AJUSTE    : corrección manual del stock (+ o -)
-- MERMA     : producto vencido, malogrado o perdido (resta stock)
create type tipo_movimiento as enum ('INGRESO', 'VENTA', 'AJUSTE', 'MERMA');

-- ---------------------------------------------------------------------
-- Fecha de hoy en Perú
-- ---------------------------------------------------------------------
create or replace function fn_hoy() returns date
language sql stable as $$
  select (now() at time zone 'America/Lima')::date;
$$;

-- ---------------------------------------------------------------------
-- COLEGIOS (sedes). El sistema crece agregando filas aquí.
-- ---------------------------------------------------------------------
create table colegios (
  id          bigint generated always as identity primary key,
  codigo      text not null unique,
  nombre      text not null,
  direccion   text,
  responsable text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- USUARIOS del sistema. El inicio de sesión lo maneja Supabase Auth: cada
-- usuario tiene un correo interno (auth_id = auth.users.id). Ver
-- scripts/usuarios-a-supabase-auth.mjs para crear las cuentas.
-- ---------------------------------------------------------------------
create table usuarios (
  id             bigint generated always as identity primary key,
  usuario        text not null,
  nombre         text not null,
  -- Solo para pasar las cuentas a Supabase Auth (que guarda la contraseña desde entonces)
  password_hash  text,
  auth_id        uuid,
  email          text,
  rol            text not null check (rol in ('ADMIN', 'LOGISTICA', 'PERSONAL', 'COCINA')),
  colegio_id     bigint references colegios(id) on delete restrict,
  activo         boolean not null default true,
  ultimo_acceso  timestamptz,
  created_at     timestamptz not null default now(),
  constraint personal_requiere_colegio check (rol <> 'PERSONAL' or colegio_id is not null)
);
create unique index usuarios_usuario_unico on usuarios (lower(usuario));
create unique index usuarios_auth_id_unico on usuarios (auth_id) where auth_id is not null;
create unique index usuarios_email_unico on usuarios (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- CATÁLOGO GENERAL
-- ---------------------------------------------------------------------
create table categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  orden   int not null default 0
);

create table productos (
  id            bigint generated always as identity primary key,
  nombre        text not null,
  categoria_id  bigint references categorias(id) on delete set null,
  -- perecible = se prepara y se vende en el día (empanadas, jugos...). Lo que sobra se registra como merma.
  perecible     boolean not null default false,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index productos_nombre_unico on productos (lower(nombre));

-- ---------------------------------------------------------------------
-- PRODUCTO POR COLEGIO = la hoja "CONTROL" de cada colegio
--   presentacion / unidades_por_presentacion → "UNIDAD POR CAJA/PAQUETE" (referencia para costos y entregas)
--   stock_unidades                           → TOTAL de unidades en el cafetín (el personal lo cuenta)
--   costo_presentacion                       → "PRECIO POR CAJA/PAQUETE"
--   precio_venta                             → "PRECIO DE VENTA UNIDAD"        (lo edita el personal)
-- ---------------------------------------------------------------------
create table producto_colegio (
  id                         bigint generated always as identity primary key,
  colegio_id                 bigint not null references colegios(id) on delete cascade,
  producto_id                bigint not null references productos(id) on delete cascade,
  presentacion               tipo_presentacion not null default 'UNIDAD',
  unidades_por_presentacion  int not null default 1 check (unidades_por_presentacion > 0),
  stock_unidades             int not null default 0 check (stock_unidades >= 0),
  ultimo_conteo              timestamptz,   -- última vez que el personal contó este producto
  costo_presentacion         numeric(10,2) not null default 0 check (costo_presentacion >= 0),
  precio_venta               numeric(10,2) not null default 0 check (precio_venta >= 0),
  stock_minimo               int not null default 5 check (stock_minimo >= 0),
  activo                     boolean not null default true,
  observacion                text,
  updated_at                 timestamptz not null default now(),
  updated_by                 bigint references usuarios(id) on delete set null,
  unique (colegio_id, producto_id)
);

-- ---------------------------------------------------------------------
-- MOVIMIENTOS: historial de todo lo que pasa con el stock
--   cantidad      : unidades del movimiento (VENTA negativa = corrección de una venta mal contada)
--   efecto_stock  : cuánto cambió el stock total en unidades (+ entra, - sale)
--   cajas / unidades_por_caja : detalle de una entrega (ej. 4 paquetes de 24 + 5 sueltas)
-- ---------------------------------------------------------------------
create table movimientos (
  id               bigint generated always as identity primary key,
  fecha            date not null default fn_hoy(),
  colegio_id       bigint not null references colegios(id) on delete cascade,
  producto_id      bigint not null references productos(id) on delete cascade,
  tipo             tipo_movimiento not null,
  cantidad         int not null default 0,
  cajas            int not null default 0,      -- cajas/paquetes entregados (solo referencia)
  unidades_por_caja int,                        -- unidades que traía cada caja entregada
  efecto_stock     int not null default 0,
  precio_unitario  numeric(10,2) not null default 0,
  costo_unitario   numeric(12,4) not null default 0,
  monto            numeric(12,2) not null default 0,
  stock_resultante int,
  usuario_id       bigint references usuarios(id) on delete set null,
  observacion      text,
  created_at       timestamptz not null default now()
);
create index movimientos_colegio_fecha on movimientos (colegio_id, fecha);
create index movimientos_producto on movimientos (producto_id);
create index movimientos_tipo_fecha on movimientos (tipo, fecha);

-- ---------------------------------------------------------------------
-- HISTORIAL DE PRECIOS DE VENTA
-- ---------------------------------------------------------------------
create table historial_precios (
  id                   bigint generated always as identity primary key,
  producto_colegio_id  bigint not null references producto_colegio(id) on delete cascade,
  precio_anterior      numeric(10,2) not null,
  precio_nuevo         numeric(10,2) not null,
  usuario_id           bigint references usuarios(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CIERRE DEL DÍA: el personal confirma que terminó de registrar
-- ---------------------------------------------------------------------
create table cierres_dia (
  id            bigint generated always as identity primary key,
  colegio_id    bigint not null references colegios(id) on delete cascade,
  fecha         date not null default fn_hoy(),
  usuario_id    bigint references usuarios(id) on delete set null,
  total_ventas  numeric(12,2) not null default 0,
  unidades      int not null default 0,
  observacion   text,
  created_at    timestamptz not null default now(),
  unique (colegio_id, fecha)
);

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
  recibido_at         timestamptz,
  -- COCINA = productos del día · LOGISTICA = entrega semanal (sube stock al recibirla)
  origen              text not null default 'COCINA' check (origen in ('COCINA', 'LOGISTICA')),
  -- Productos que salieron juntos comparten lote
  lote                uuid,
  -- Solo entregas de logística: cómo vienen y su costo
  cajas               int not null default 0,
  unidades_por_caja   int,
  unidades_sueltas    int not null default 0,
  costo_presentacion  numeric(10,2),
  observacion         text,
  constraint envios_cajas_check check (cajas >= 0 and unidades_sueltas >= 0)
);
create index if not exists envios_origen on envios (origen, estado);
create index if not exists envios_colegio_estado on envios (colegio_id, estado);
create index if not exists envios_fecha on envios (fecha);

-- ---------------------------------------------------------------------
-- REPOSICIONES: una lista de pedido de un cafetín
--   POR_APROBAR → APROBADA → EN_COMPRA → COMPRADA   (todo lo hace logística)
--              ↘ RECHAZADA (no aprobada)      · ANULADA (la anuló el personal)
-- ---------------------------------------------------------------------
create table if not exists reposiciones (
  id             bigint generated always as identity primary key,
  codigo         text generated always as ('REP-' || lpad(id::text, 4, '0')) stored,
  colegio_id     bigint not null references colegios(id) on delete cascade,
  estado         text not null default 'POR_APROBAR'
                 constraint reposiciones_estado_check
                 check (estado in ('POR_APROBAR', 'APROBADA', 'RECHAZADA', 'EN_COMPRA', 'COMPRADA', 'ANULADA')),
  nota           text,
  pedido_por     bigint references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  revisado_por   bigint references usuarios(id) on delete set null,
  revisado_at    timestamptz,
  motivo_rechazo text,
  compra_por     bigint references usuarios(id) on delete set null,
  compra_at      timestamptz,
  comprado_por   bigint references usuarios(id) on delete set null,
  comprado_at    timestamptz
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
  orden             int not null default 0,
  -- Fuera de catálogo: lo que pagó logística (se descuenta de la ganancia del mes de costo_fecha)
  costo             numeric(10,2) constraint reposicion_items_costo_check check (costo is null or costo >= 0),
  costo_fecha       date,
  costo_por         bigint references usuarios(id) on delete set null
);
create index if not exists reposicion_items_reposicion on reposicion_items (reposicion_id);

-- ---------------------------------------------------------------------
-- CONTEOS POR FECHA: cada "Guardar conteo" queda en el conteo del día
-- (productos del día) o de la semana (fecha = lunes), por colegio
-- ---------------------------------------------------------------------
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
-- REPORTE MENSUAL: el del mes que cerró queda guardado (historial)
-- ---------------------------------------------------------------------
create table if not exists reportes_mensuales (
  id           bigint generated always as identity primary key,
  mes          text not null unique check (mes ~ '^\d{4}-\d{2}$'),   -- '2026-10'
  datos        jsonb not null,                                      -- cifras del reporte
  automatico   boolean not null default true,                       -- false = lo volvió a generar una persona
  generado_por bigint references usuarios(id) on delete set null,
  generado_at  timestamptz not null default now()
);

-- =====================================================================
-- VISTAS (los cálculos que antes hacían las fórmulas de Excel)
-- =====================================================================

-- Stock actual por colegio (todo en unidades) con los cálculos de la hoja CONTROL
create view v_stock with (security_invoker = true) as
select
  pc.id,
  pc.colegio_id,
  col.nombre                           as colegio,
  pc.producto_id,
  p.nombre                             as producto,
  p.categoria_id,
  cat.nombre                           as categoria,
  pc.presentacion,
  pc.unidades_por_presentacion,
  pc.stock_unidades                                                                  as total_unidades,
  pc.costo_presentacion,
  round(pc.costo_presentacion / pc.unidades_por_presentacion, 4)                     as costo_unitario,
  pc.precio_venta,
  round(pc.precio_venta - pc.costo_presentacion / pc.unidades_por_presentacion, 4)   as ganancia_unitaria,
  case when pc.precio_venta > 0
       then round((pc.precio_venta - pc.costo_presentacion / pc.unidades_por_presentacion) / pc.precio_venta * 100, 1)
  end                                                                                as margen_pct,
  round(pc.stock_unidades * pc.precio_venta, 2)                                      as valor_venta_stock,
  round(pc.stock_unidades * pc.costo_presentacion / pc.unidades_por_presentacion, 2) as valor_costo_stock,
  pc.stock_minimo,
  pc.stock_unidades <= pc.stock_minimo                                               as stock_bajo,
  pc.activo,
  p.activo                             as producto_activo,
  col.activo                           as colegio_activo,
  pc.observacion,
  pc.updated_at,
  p.perecible,
  pc.ultimo_conteo
from producto_colegio pc
join productos p   on p.id = pc.producto_id
join colegios col  on col.id = pc.colegio_id
left join categorias cat on cat.id = p.categoria_id;

-- Ventas por día y producto (equivale a la hoja INVENTARIO)
create view v_ventas_diarias with (security_invoker = true) as
select
  m.colegio_id,
  m.producto_id,
  m.fecha,
  sum(m.cantidad)::int                              as unidades,
  sum(m.monto)                                      as monto,
  round(sum(m.cantidad * m.costo_unitario), 2)      as costo,
  round(sum(m.monto) - sum(m.cantidad * m.costo_unitario), 2) as ganancia
from movimientos m
where m.tipo = 'VENTA'
group by m.colegio_id, m.producto_id, m.fecha;

-- =====================================================================
-- FUNCIONES DE NEGOCIO (todo se hace en una sola transacción)
-- =====================================================================

-- ---------------------------------------------------------------------
-- El personal cuenta TODAS las unidades que quedan en el cafetín
-- (sueltas + las que estén en cajas/paquetes cerrados).
-- La diferencia con lo registrado = lo que se vendió.
-- Si el conteo es MAYOR (se equivocó antes), primero corrige la venta
-- de hoy y el resto lo registra como AJUSTE.
-- ---------------------------------------------------------------------
create or replace function fn_registrar_conteo(
  p_producto_colegio_id bigint,
  p_unidades            int,
  p_usuario_id          bigint,
  p_observacion         text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  r            producto_colegio;
  v_dif        int;
  v_costo      numeric(12,4);
  v_vendido    int;
  v_corrige    int;
  v_resto      int;
begin
  if p_unidades is null or p_unidades < 0 then
    raise exception 'La cantidad no puede ser negativa';
  end if;

  select * into r from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  v_dif := r.stock_unidades - p_unidades;   -- positivo = vendido
  if v_dif = 0 then
    -- Coincide: no hubo ventas, pero queda constancia de que se contó
    update producto_colegio set ultimo_conteo = now() where id = r.id;
    return jsonb_build_object('vendido', 0, 'ajuste', 0);
  end if;

  v_costo := r.costo_presentacion / r.unidades_por_presentacion;

  update producto_colegio
     set stock_unidades = p_unidades, ultimo_conteo = now(), updated_at = now(), updated_by = p_usuario_id
   where id = r.id;

  if v_dif > 0 then
    insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario,
                             costo_unitario, monto, stock_resultante, usuario_id, observacion)
    values (r.colegio_id, r.producto_id, 'VENTA', v_dif, -v_dif, r.precio_venta,
            v_costo, v_dif * r.precio_venta, p_unidades, p_usuario_id, p_observacion);
    return jsonb_build_object('vendido', v_dif, 'ajuste', 0);
  end if;

  -- El conteo subió: corregir primero lo vendido hoy
  select coalesce(sum(cantidad), 0) into v_vendido
    from movimientos
   where colegio_id = r.colegio_id and producto_id = r.producto_id
     and tipo = 'VENTA' and fecha = fn_hoy();

  v_corrige := least(-v_dif, greatest(v_vendido, 0));
  v_resto   := -v_dif - v_corrige;

  if v_corrige > 0 then
    insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario,
                             costo_unitario, monto, stock_resultante, usuario_id, observacion)
    values (r.colegio_id, r.producto_id, 'VENTA', -v_corrige, v_corrige, r.precio_venta,
            v_costo, -v_corrige * r.precio_venta, p_unidades, p_usuario_id,
            coalesce(p_observacion, 'Corrección de conteo'));
  end if;

  if v_resto > 0 then
    insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, costo_unitario,
                             stock_resultante, usuario_id, observacion)
    values (r.colegio_id, r.producto_id, 'AJUSTE', v_resto, v_resto, v_costo, p_unidades, p_usuario_id,
            coalesce(p_observacion, 'El conteo del personal fue mayor al stock registrado'));
  end if;

  return jsonb_build_object('vendido', -v_corrige, 'ajuste', v_resto);
end $$;

-- ---------------------------------------------------------------------
-- Cambiar precio de venta (queda en el historial)
-- ---------------------------------------------------------------------
create or replace function fn_cambiar_precio(
  p_producto_colegio_id bigint,
  p_precio              numeric,
  p_usuario_id          bigint
) returns void
language plpgsql set search_path = public as $$
declare
  v_anterior numeric(10,2);
begin
  if p_precio is null or p_precio < 0 then raise exception 'Precio inválido'; end if;

  select precio_venta into v_anterior from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if v_anterior = round(p_precio, 2) then return; end if;

  update producto_colegio
     set precio_venta = round(p_precio, 2), updated_at = now(), updated_by = p_usuario_id
   where id = p_producto_colegio_id;

  insert into historial_precios (producto_colegio_id, precio_anterior, precio_nuevo, usuario_id)
  values (p_producto_colegio_id, v_anterior, round(p_precio, 2), p_usuario_id);
end $$;

-- ---------------------------------------------------------------------
-- Entrega de mercadería a un colegio (logística o el personal con "Recibí").
-- Se declara claro: N cajas/paquetes de X unidades + Y unidades sueltas.
-- El stock sube en unidades; las cajas quedan solo como referencia en el historial.
-- ---------------------------------------------------------------------
create or replace function fn_registrar_ingreso(
  p_producto_colegio_id bigint,
  p_cajas               int,
  p_unidades_por_caja   int,
  p_unidades_sueltas    int,
  p_costo_presentacion  numeric,
  p_usuario_id          bigint,
  p_fecha               date default null,
  p_observacion         text default null
) returns void
language plpgsql set search_path = public as $$
declare
  r        producto_colegio;
  v_upc    int;
  v_costo  numeric(10,2);
  v_unid   int;
begin
  p_cajas := coalesce(p_cajas, 0);
  p_unidades_sueltas := coalesce(p_unidades_sueltas, 0);
  if p_cajas < 0 or p_unidades_sueltas < 0 or (p_cajas = 0 and p_unidades_sueltas = 0) then
    raise exception 'Indique cuántas cajas o unidades se entregan';
  end if;

  select * into r from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  v_upc := coalesce(nullif(p_unidades_por_caja, 0), r.unidades_por_presentacion);
  if v_upc < 1 then raise exception 'Las unidades por caja/paquete deben ser 1 o más'; end if;
  -- Sin costo nuevo: se mantiene el costo por UNIDAD aunque cambie el tamaño de la caja
  v_costo := coalesce(p_costo_presentacion, round(r.costo_presentacion / r.unidades_por_presentacion * v_upc, 2));
  v_unid  := p_cajas * v_upc + p_unidades_sueltas;

  update producto_colegio
     set stock_unidades            = stock_unidades + v_unid,
         -- si llegaron cajas, se actualiza cuántas unidades trae cada una
         unidades_por_presentacion = case when p_cajas > 0 then v_upc else unidades_por_presentacion end,
         costo_presentacion        = v_costo,
         updated_at = now(), updated_by = p_usuario_id
   where id = r.id;

  insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, cajas, unidades_por_caja, efecto_stock,
                           precio_unitario, costo_unitario, monto, stock_resultante, usuario_id, observacion)
  values (coalesce(p_fecha, fn_hoy()), r.colegio_id, r.producto_id, 'INGRESO', v_unid, p_cajas,
          case when p_cajas > 0 then v_upc end, v_unid,
          v_costo, v_costo / v_upc, round(v_unid * v_costo / v_upc, 2),
          r.stock_unidades + v_unid, p_usuario_id, p_observacion);
end $$;

-- ---------------------------------------------------------------------
-- Ajuste manual del stock (administración / logística), en unidades
--   p_tipo = 'AJUSTE' (corrección por conteo físico) o 'MERMA' (vencido/malogrado)
-- ---------------------------------------------------------------------
create or replace function fn_ajustar_stock(
  p_producto_colegio_id bigint,
  p_unidades            int,
  p_tipo                tipo_movimiento,
  p_usuario_id          bigint,
  p_observacion         text
) returns void
language plpgsql set search_path = public as $$
declare
  r producto_colegio;
begin
  if p_tipo not in ('AJUSTE', 'MERMA') then raise exception 'Tipo de ajuste inválido'; end if;
  if p_unidades is null or p_unidades < 0 then raise exception 'La cantidad no puede ser negativa'; end if;

  select * into r from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if r.stock_unidades = p_unidades then return; end if;

  update producto_colegio
     set stock_unidades = p_unidades, updated_at = now(), updated_by = p_usuario_id
   where id = r.id;

  insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, costo_unitario,
                           monto, stock_resultante, usuario_id, observacion)
  values (r.colegio_id, r.producto_id, p_tipo, abs(p_unidades - r.stock_unidades), p_unidades - r.stock_unidades,
          r.costo_presentacion / r.unidades_por_presentacion,
          round(abs(p_unidades - r.stock_unidades) * r.costo_presentacion / r.unidades_por_presentacion, 2),
          p_unidades, p_usuario_id, p_observacion);
end $$;

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
  v_pre    text;
  v_cajas  int := 0;
  v_upc    int;
  v_sueltas int;
  v_costo  numeric(10,2);
  v_upc_actual int;
begin
  select * into e from envios where id = p_envio_id for update;
  if not found then raise exception 'Envío no encontrado'; end if;
  if e.estado <> 'PENDIENTE' then raise exception 'Este envío ya fue recibido o anulado'; end if;
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 or p_cantidad_recibida > e.cantidad_enviada then
    raise exception 'La cantidad recibida debe estar entre 0 y %', e.cantidad_enviada;
  end if;

  v_pre := case when e.origen = 'LOGISTICA' then 'Entrega de logística' else 'Envío de cocina' end;
  if p_cantidad_recibida = e.cantidad_enviada then
    v_estado := 'CONFORME';
    v_obs    := v_pre || ': recibido conforme';
  else
    if v_motivo is null then raise exception 'Indica el motivo de la diferencia'; end if;
    v_estado := 'OBSERVADO';
    v_obs    := v_pre || ': enviaron ' || e.cantidad_enviada || ', llegaron ' || p_cantidad_recibida
                || ' (' || v_motivo || ')';
  end if;
  if e.observacion is not null then v_obs := v_obs || ' · ' || e.observacion; end if;

  update envios
     set cantidad_recibida = p_cantidad_recibida, estado = v_estado, motivo = v_motivo,
         recibido_por = p_usuario_id, recibido_at = now()
   where id = e.id;

  if p_cantidad_recibida > 0 then
    if e.origen = 'LOGISTICA' then
      v_costo := e.costo_presentacion;
      if p_cantidad_recibida = e.cantidad_enviada then
        -- Llegó todo: tal cual se entregó
        v_cajas := e.cajas; v_upc := e.unidades_por_caja; v_sueltas := e.unidades_sueltas;
      else
        -- Llegó menos: cajas completas que alcanzan y el resto sueltas
        v_upc := e.unidades_por_caja;
        if e.cajas > 0 and coalesce(v_upc, 0) > 0 then v_cajas := p_cantidad_recibida / v_upc; end if;
        v_sueltas := p_cantidad_recibida - v_cajas * coalesce(v_upc, 0);
        if v_cajas = 0 then
          -- Sin cajas completas el costo se expresa por la caja que usa hoy el producto
          select unidades_por_presentacion into v_upc_actual from producto_colegio where id = e.producto_colegio_id;
          if v_costo is not null and coalesce(v_upc, 0) > 0 then v_costo := round(v_costo / v_upc * v_upc_actual, 2); end if;
          v_upc := null;
        end if;
      end if;
      perform fn_registrar_ingreso(e.producto_colegio_id, v_cajas, v_upc, v_sueltas, v_costo,
                                   p_usuario_id, null::date, v_obs);
    else
      perform fn_registrar_ingreso(e.producto_colegio_id, 0, null::int, p_cantidad_recibida, null::numeric,
                                   p_usuario_id, null::date, v_obs);
    end if;
  end if;

  return jsonb_build_object('estado', v_estado, 'recibido', p_cantidad_recibida,
                            'faltante', e.cantidad_enviada - p_cantidad_recibida);
end $$;

-- ---------------------------------------------------------------------
-- Cierre del día (el personal confirma que terminó)
-- ---------------------------------------------------------------------
create or replace function fn_cerrar_dia(
  p_colegio_id  bigint,
  p_usuario_id  bigint,
  p_observacion text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_total numeric(12,2);
  v_unid  int;
begin
  select coalesce(sum(monto), 0), coalesce(sum(cantidad), 0) into v_total, v_unid
    from movimientos
   where colegio_id = p_colegio_id and tipo = 'VENTA' and fecha = fn_hoy();

  insert into cierres_dia (colegio_id, fecha, usuario_id, total_ventas, unidades, observacion)
  values (p_colegio_id, fn_hoy(), p_usuario_id, v_total, v_unid, p_observacion)
  on conflict (colegio_id, fecha) do update
     set total_ventas = excluded.total_ventas, unidades = excluded.unidades,
         usuario_id = excluded.usuario_id,
         observacion = coalesce(excluded.observacion, cierres_dia.observacion),
         created_at = now();

  return jsonb_build_object('total', v_total, 'unidades', v_unid);
end $$;

-- ---------------------------------------------------------------------
-- Copiar el catálogo de un colegio a otro (para abrir un colegio nuevo)
-- ---------------------------------------------------------------------
create or replace function fn_copiar_catalogo(
  p_colegio_origen  bigint,
  p_colegio_destino bigint
) returns int
language plpgsql set search_path = public as $$
declare
  v_n int;
begin
  insert into producto_colegio (colegio_id, producto_id, presentacion, unidades_por_presentacion,
                                costo_presentacion, precio_venta, stock_minimo, activo)
  select p_colegio_destino, producto_id, presentacion, unidades_por_presentacion,
         costo_presentacion, precio_venta, stock_minimo, activo
    from producto_colegio
   where colegio_id = p_colegio_origen
  on conflict (colegio_id, producto_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

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

-- =====================================================================
-- SEGURIDAD
--   La app entra a la base SOLO desde el servidor con la "service_role key".
--   Activamos RLS sin políticas: así nadie puede leer ni escribir con la
--   llave pública (anon) aunque la vea en el navegador.
-- =====================================================================
alter table colegios          enable row level security;
alter table usuarios          enable row level security;
alter table categorias        enable row level security;
alter table productos         enable row level security;
alter table producto_colegio  enable row level security;
alter table movimientos       enable row level security;
alter table historial_precios enable row level security;
alter table cierres_dia       enable row level security;
alter table envios            enable row level security;
alter table reposiciones      enable row level security;
alter table reposicion_items  enable row level security;
alter table conteos           enable row level security;
alter table conteo_items      enable row level security;
alter table reportes_mensuales enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;
grant  all on all tables    in schema public to service_role;
grant  all on all sequences in schema public to service_role;

-- Ping diario para que Supabase no pause el proyecto (.github/workflows/keepalive.yml).
-- Solo devuelve 1: es lo único que la llave pública (anon) puede ejecutar.
create or replace function fn_ping()
returns int
language sql
stable
set search_path = public
as $$ select 1 $$;
revoke all on function fn_ping() from public;
grant execute on function fn_ping() to anon;
