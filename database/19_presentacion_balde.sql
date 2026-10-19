-- =====================================================================
--  LAS FLORES · 19: PRODUCTOS QUE VIENEN EN BALDE Y SE VENDEN POR VASO
--
--  Ejemplo: la cocina manda un balde de refresco y en el cafetín se vende
--  por vasito a S/ 1.00. En el catálogo:
--     Cómo se compra: Balde · ¿Cuántos vasos rinde cada balde?: 30
--     Precio de venta: el de un vaso
--  La cocina envía baldes (el sistema los convierte en vasos) y el personal,
--  al contar, toca cuánto queda del balde (lleno, ¾, ½, ¼ o vacío).
--
--  Solo agrega la opción "BALDE". No borra ni cambia datos.
--  Se puede ejecutar más de una vez.
-- =====================================================================

alter type tipo_presentacion add value if not exists 'BALDE';

-- (No se puede comprobar en este mismo paso: Postgres usa el valor nuevo recién
--  al terminar. Si se ejecutó sin error, quedó bien.)
select 'Listo: BALDE agregado' as resultado;
