-- =====================================================================
--  LAS FLORES · 35: LA REPOSICIÓN APROBADA SE JALA A ENTREGAS
--
--  Antes: aprobar → iniciar compra → anotar costos → "Comprado".
--  Ahora: aprobar e imprimir; hecha la compra, en Entregas se jala la lista
--  y al registrarla queda comprada.
--
--  Lo que está fuera del catálogo se llena como los demás (cajas, unidades
--  por caja, sueltas, costo por caja). No se vende ni entra al stock: queda
--  el registro y el gasto se descuenta de la ganancia del mes.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table reposicion_items add column if not exists presentacion text;
alter table reposicion_items add column if not exists cajas int;
alter table reposicion_items add column if not exists unidades_por_caja int;
alter table reposicion_items add column if not exists sueltas int;
alter table reposicion_items add column if not exists costo_presentacion numeric(10,2);

select 'Listo: la reposición aprobada se jala a Entregas' as resultado;
