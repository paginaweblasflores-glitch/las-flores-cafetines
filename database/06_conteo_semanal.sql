-- =====================================================================
--  LAS FLORES · MIGRACIÓN 06: conteo semanal
--
--  Ejecutar DESPUÉS de 05 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--
--  Guarda la fecha del último conteo de cada producto, aunque el número
--  coincida con el sistema. Así la pantalla del personal sabe qué productos
--  semanales ya se contaron esta semana.
--  Se puede ejecutar más de una vez.
-- =====================================================================

begin;

alter table producto_colegio add column if not exists ultimo_conteo timestamptz;

-- Punto de partida: el último conteo registrado (venta o ajuste del personal)
update producto_colegio pc
   set ultimo_conteo = m.ultimo
  from (select colegio_id, producto_id, max(created_at) as ultimo
          from movimientos
         where tipo in ('VENTA', 'AJUSTE') and usuario_id is not null
           and coalesce(observacion, '') <> 'Importado de INVENTARIO.xlsx'
         group by colegio_id, producto_id) m
 where m.colegio_id = pc.colegio_id and m.producto_id = pc.producto_id
   and pc.ultimo_conteo is null;

create or replace view v_stock with (security_invoker = true) as
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

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant execute on all functions in schema public to service_role;

commit;

-- Verificación
select count(*) filter (where ultimo_conteo is not null) as con_conteo, count(*) as productos from producto_colegio;
