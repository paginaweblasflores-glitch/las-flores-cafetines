-- =====================================================================
--  LAS FLORES · 22: SALSAS QUE VIENEN EN TAPER Y SE VENDEN POR PORCIÓN
--
--  Igual que el balde de las bebidas (19): la cocina manda tapers y en el
--  cafetín se vende por porción. En el catálogo (categoría SALSAS):
--     Cómo viene de la cocina: En taper · ¿Cuántas porciones rinde cada taper?
--  Al contar, el personal toca cuánto queda del taper (lleno, ¾, ½, ¼ o vacío).
--
--  Solo agrega la opción "TAPER". No borra ni cambia datos.
--  Se puede ejecutar más de una vez.
-- =====================================================================

alter type tipo_presentacion add value if not exists 'TAPER';

-- (Postgres usa el valor nuevo recién al terminar este paso: si se ejecutó sin error, quedó bien.)
select 'Listo: TAPER agregado' as resultado;
