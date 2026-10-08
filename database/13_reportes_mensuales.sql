-- =====================================================================
--  LAS FLORES · MIGRACIÓN 13: reporte mensual (historial)
--
--  Ejecutar DESPUÉS de 12 (o de 11 si no cargaste datos de prueba).
--  (Si vas a empezar de cero, 01 ya lo trae incluido.)
--  Se puede ejecutar más de una vez.
--
--  Al empezar cada mes el sistema arma el reporte del mes que cerró y lo
--  guarda aquí tal cual (las cifras no cambian aunque luego se corrija algo,
--  salvo que administración lo vuelva a generar).
-- =====================================================================

begin;

create table if not exists reportes_mensuales (
  id           bigint generated always as identity primary key,
  mes          text not null unique check (mes ~ '^\d{4}-\d{2}$'),   -- '2026-10'
  datos        jsonb not null,                                      -- cifras del reporte
  automatico   boolean not null default true,                       -- false = lo volvió a generar una persona
  generado_por bigint references usuarios(id) on delete set null,
  generado_at  timestamptz not null default now()
);

alter table reportes_mensuales enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
grant  all on all tables    in schema public to service_role;
grant  all on all sequences in schema public to service_role;

commit;

select 'reportes mensuales lista' as estado;
