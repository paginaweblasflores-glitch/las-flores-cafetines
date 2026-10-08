-- =====================================================================
--  LAS FLORES · MIGRACIÓN 04: productos "del día" (perecibles)
--
--  Ejecutar DESPUÉS de 03 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--
--  Agrega la marca "perecible" a los productos que se preparan y se venden
--  en el día. En la pantalla del personal, esos productos permiten
--  registrar lo que sobró como merma (no se vendió, se malogró...).
--  Se puede ejecutar más de una vez.
-- =====================================================================

begin;

alter table productos add column if not exists perecible boolean not null default false;

update productos set perecible = true
where nombre in (
  'Pan con pollo',
  'Pan con chorizo',
  'Pan con jamón y queso',
  'Chaufa',
  'Causa',
  'Salchicha',
  'Pizza',
  'Empanada',
  'Jugo de papaya',
  'Mil hojas',
  'Tres leches',
  'Fudge',
  'Pie de limón',
  'Keke',
  'Suspiro',
  'Torta de galleta'
);

-- La vista de stock ahora informa si el producto es del día (columna al final)
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
  p.perecible
from producto_colegio pc
join productos p   on p.id = pc.producto_id
join colegios col  on col.id = pc.colegio_id
left join categorias cat on cat.id = p.categoria_id;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;

commit;

-- Verificación: productos del día
select nombre from productos where perecible order by nombre;
