-- =====================================================================
--  LAS FLORES · 29: DESCUENTOS
--
--  Al cambiar el precio, el personal puede marcar "Es un descuento" (ej. el
--  keke de S/ 2 a S/ 1 el jueves y viernes para que no se pierda):
--    · se guarda el precio normal para volver a él con un toque
--    · las ventas hechas con descuento quedan marcadas (cuánto se vendió y
--      cuánto se dejó de cobrar), para el reporte de administración
--  Un cambio de precio sin marcar es un cambio normal (quita el descuento).
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table producto_colegio  add column if not exists precio_normal numeric(10,2) check (precio_normal >= 0);
alter table movimientos       add column if not exists precio_normal numeric(10,2);
alter table historial_precios add column if not exists descuento boolean not null default false;

drop function if exists fn_cambiar_precio(bigint, numeric, bigint);

create or replace function fn_cambiar_precio(
  p_producto_colegio_id bigint,
  p_precio              numeric,
  p_usuario_id          bigint,
  p_descuento           boolean default false
) returns void
language plpgsql set search_path = public as $$
declare
  r producto_colegio;
  v_normal numeric(10,2);
begin
  if p_precio is null or p_precio < 0 then raise exception 'Precio inválido'; end if;

  select * into r from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;

  -- Descuento: se guarda el precio de siempre (si ya estaba en descuento, se mantiene el normal de antes).
  -- Precio normal: se quita la marca de descuento.
  v_normal := case when coalesce(p_descuento, false) then coalesce(r.precio_normal, r.precio_venta) else null end;
  -- Un "descuento" igual o mayor al precio normal no es descuento
  if v_normal is not null and round(p_precio, 2) >= v_normal then v_normal := null; end if;

  if r.precio_venta = round(p_precio, 2) and r.precio_normal is not distinct from v_normal then return; end if;

  update producto_colegio
     set precio_venta = round(p_precio, 2), precio_normal = v_normal, updated_at = now(), updated_by = p_usuario_id
   where id = p_producto_colegio_id;

  if r.precio_venta <> round(p_precio, 2) then
    insert into historial_precios (producto_colegio_id, precio_anterior, precio_nuevo, descuento, usuario_id)
    values (p_producto_colegio_id, r.precio_venta, round(p_precio, 2), v_normal is not null, p_usuario_id);
  end if;
end $$;

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
    insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario, precio_normal,
                             costo_unitario, monto, stock_resultante, usuario_id, observacion)
    values (r.colegio_id, r.producto_id, 'VENTA', v_dif, -v_dif, r.precio_venta, r.precio_normal,
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
    insert into movimientos (colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario, precio_normal,
                             costo_unitario, monto, stock_resultante, usuario_id, observacion)
    values (r.colegio_id, r.producto_id, 'VENTA', -v_corrige, v_corrige, r.precio_venta, r.precio_normal,
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

revoke all on function fn_cambiar_precio(bigint, numeric, bigint, boolean) from public, anon, authenticated;
grant execute on function fn_cambiar_precio(bigint, numeric, bigint, boolean) to service_role;

select 'Listo: descuentos' as resultado;
