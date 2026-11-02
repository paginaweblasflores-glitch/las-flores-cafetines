-- =====================================================================
--  LAS FLORES · 36: LA REPOSICIÓN SE PUEDE ENTREGAR POR PARTES
--
--  Si de 5 productos se entregan 4, el que falta queda pendiente: la
--  reposición sigue aprobada y se vuelve a jalar en Entregas solo con eso.
--  Queda comprada cuando se entrega todo, o cuando logística dice que lo
--  que falta ya no se compra.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table reposicion_items add column if not exists entregado_at timestamptz;

select 'Listo: la reposición se puede entregar por partes' as resultado;
