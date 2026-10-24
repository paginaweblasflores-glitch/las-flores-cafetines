-- =====================================================================
--  LAS FLORES · 25: BEBIDAS DE COCINA EN LITROS (se venden por vaso)
--
--  La cocina manda las bebidas (chicha, refresco…) en LITROS y el
--  personal reporta cuántos litros quedan. El sistema lo pasa a vasos con
--  "cuánto entra en un vaso" (ml), que se ajusta en el catálogo:
--     Cómo viene de la cocina: En litros · ¿Cuántos ml entran en un vaso? (200)
--  Con 200 ml: 1 litro = 5 vasos. El stock y las ventas siguen en vasos.
--
--  En la fila del producto, unidades_por_presentacion = ml por vaso.
--  Solo agrega la opción "LITRO". No borra ni cambia datos.
--  Se puede ejecutar más de una vez.
-- =====================================================================

alter type tipo_presentacion add value if not exists 'LITRO';

-- (Postgres usa el valor nuevo recién al terminar este paso: si se ejecutó sin error, quedó bien.)
select 'Listo: LITRO agregado' as resultado;
