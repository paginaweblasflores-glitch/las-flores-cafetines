-- =====================================================================
--  LAS FLORES · MIGRACIÓN 14: costo de lo comprado fuera del catálogo
--
--  Ejecutar DESPUÉS de 13 si tu base ya existía.
--  (Si vas a empezar de cero, 01 ya lo trae incluido.)
--  Se puede ejecutar más de una vez.
--
--  En una reposición, lo que no es del catálogo (platos descartables,
--  cucharón, pinza…) no entra al stock. Logística anota cuánto pagó y ese
--  gasto se descuenta de la ganancia del mes en que se anotó.
-- =====================================================================

begin;

alter table reposicion_items add column if not exists costo numeric(10,2);
alter table reposicion_items drop constraint if exists reposicion_items_costo_check;
alter table reposicion_items add constraint reposicion_items_costo_check check (costo is null or costo >= 0);
-- Día en que se anotó el gasto (define en qué mes se descuenta)
alter table reposicion_items add column if not exists costo_fecha date;
alter table reposicion_items add column if not exists costo_por bigint references usuarios(id) on delete set null;
create index if not exists reposicion_items_costo_fecha on reposicion_items (costo_fecha) where costo is not null;

commit;

select 'costo fuera de catálogo listo' as estado;
