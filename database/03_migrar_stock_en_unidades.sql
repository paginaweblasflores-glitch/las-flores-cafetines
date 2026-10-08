-- =====================================================================
--  LAS FLORES · MIGRACIÓN: stock en unidades (sin "cajas cerradas" ni "abrir caja")
--
--  Solo si YA ejecutaste la versión anterior de 01_tablas.sql y quieres
--  conservar tus datos. Si vas a empezar de cero, ejecuta 01 y 02 y listo.
--
--  Qué hace:
--    · stock_unidades = cajas cerradas × unidades por caja + sueltas
--    · borra las columnas cajas_completas y unidades_sueltas
--    · borra los movimientos "Abrió caja" (no cambiaban el stock)
--    · actualiza las funciones del sistema
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================

begin;

drop view if exists v_stock;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'producto_colegio' and column_name = 'cajas_completas') then
    alter table producto_colegio add column stock_unidades int not null default 0;
    update producto_colegio
       set stock_unidades = cajas_completas * unidades_por_presentacion + unidades_sueltas;
    alter table producto_colegio drop column cajas_completas, drop column unidades_sueltas;
    alter table producto_colegio add constraint producto_colegio_stock_unidades_check check (stock_unidades >= 0);
  end if;
end $$;

alter table movimientos add column if not exists unidades_por_caja int;
delete from movimientos where tipo::text = 'APERTURA';

drop function if exists fn_abrir_caja(bigint, int, bigint);
drop function if exists fn_registrar_conteo(bigint, int, bigint, text);
drop function if exists fn_registrar_ingreso(bigint, int, int, numeric, bigint, date, text);
drop function if exists fn_registrar_ingreso(bigint, int, int, int, numeric, bigint, date, text);
drop function if exists fn_ajustar_stock(bigint, int, int, tipo_movimiento, bigint, text);
drop function if exists fn_ajustar_stock(bigint, int, tipo_movimiento, bigint, text);

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
  pc.updated_at
from producto_colegio pc
join productos p   on p.id = pc.producto_id
join colegios col  on col.id = pc.colegio_id
left join categorias cat on cat.id = p.categoria_id;

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
    return jsonb_build_object('vendido', 0, 'ajuste', 0);
  end if;

  v_costo := r.costo_presentacion / r.unidades_por_presentacion;

  update producto_colegio
     set stock_unidades = p_unidades, updated_at = now(), updated_by = p_usuario_id
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

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;
grant  all on all tables    in schema public to service_role;

commit;

-- Verificación: stock total por colegio
select col.nombre as colegio, count(*) as productos, sum(pc.stock_unidades) as unidades_en_stock
from producto_colegio pc join colegios col on col.id = pc.colegio_id
group by col.nombre order by col.nombre;
