-- =====================================================================
--  LAS FLORES · 10: VACIAR LOS DATOS DE PRUEBA (empezar en limpio)
--
--  ⚠ BORRA PARA SIEMPRE:
--     · todos los productos del catálogo y su stock en cada colegio
--     · ventas, entregas, mermas, ajustes y todo el historial
--     · cambios de precio, envíos de cocina, entregas de logística
--     · reposiciones (listas de pedido), conteos por fecha y reportes mensuales
--
--  SE CONSERVA:
--     · colegios
--     · usuarios y sus contraseñas
--     · categorías (Bebidas, Comida, Golosinas…; se pueden editar en el Catálogo)
--
--  Los códigos vuelven a empezar (la próxima reposición será REP-0001).
--  Ejecutar una sola vez, cuando quieran empezar con los productos oficiales.
-- =====================================================================

begin;

truncate table
  reposicion_items,
  reposiciones,
  envios,
  cierres_dia,
  historial_precios,
  movimientos,
  producto_colegio,
  productos
restart identity cascade;

-- Tablas que pueden no existir según las migraciones ejecutadas
do $$
begin
  if to_regclass('public.pedidos') is not null then
    execute 'truncate table pedidos restart identity';
  end if;
  if to_regclass('public.conteos') is not null then
    execute 'truncate table conteo_items, conteos restart identity';
  end if;
  if to_regclass('public.reportes_mensuales') is not null then
    execute 'truncate table reportes_mensuales restart identity';
  end if;
end $$;

commit;

-- Comprobación: todo en 0 menos colegios, usuarios y categorías
select 'productos' as tabla, count(*) as filas from productos
union all select 'stock por colegio', count(*) from producto_colegio
union all select 'movimientos', count(*) from movimientos
union all select 'envíos y entregas', count(*) from envios
union all select 'reposiciones', count(*) from reposiciones
union all select 'colegios (se conservan)', count(*) from colegios
union all select 'usuarios (se conservan)', count(*) from usuarios
union all select 'categorías (se conservan)', count(*) from categorias;
