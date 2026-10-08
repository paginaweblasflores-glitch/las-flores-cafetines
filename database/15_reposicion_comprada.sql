-- =====================================================================
--  LAS FLORES · MIGRACIÓN 15: la reposición la atiende logística de principio a fin
--
--  Ejecutar DESPUÉS de 14 si tu base ya existía.
--  (Si vas a empezar de cero, 01 ya lo trae incluido.)
--  Se puede ejecutar más de una vez.
--
--  Flujo: el personal pide → logística aprueba (puede quitar o ajustar) →
--  imprime → inicia la compra → anota el costo de lo que no es del catálogo →
--  "Comprado" (termina). Administración solo la ve.
-- =====================================================================

begin;

alter table reposiciones drop constraint if exists reposiciones_estado_check;
alter table reposiciones add constraint reposiciones_estado_check
  check (estado in ('POR_APROBAR', 'APROBADA', 'RECHAZADA', 'EN_COMPRA', 'COMPRADA', 'ANULADA'));
alter table reposiciones add column if not exists comprado_por bigint references usuarios(id) on delete set null;
alter table reposiciones add column if not exists comprado_at  timestamptz;

commit;

select 'reposición comprada lista' as estado;
