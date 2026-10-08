-- =====================================================================
--  LAS FLORES · MIGRACIÓN 07: pedidos de reposición
--
--  Ejecutar DESPUÉS de 06 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--  Se puede ejecutar más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PEDIDOS DE REPOSICIÓN: el personal avisa que un producto semanal se está
-- acabando (reemplaza el cuaderno). Logística lo ve y lo atiende con una entrega.
-- ---------------------------------------------------------------------
create table if not exists pedidos (
  id                  bigint generated always as identity primary key,
  colegio_id          bigint not null references colegios(id) on delete cascade,
  producto_id         bigint not null references productos(id) on delete cascade,
  producto_colegio_id bigint not null references producto_colegio(id) on delete cascade,
  quedan              int check (quedan >= 0),
  nota                text,
  estado              text not null default 'PENDIENTE' check (estado in ('PENDIENTE', 'ATENDIDO', 'ANULADO')),
  pedido_por          bigint references usuarios(id) on delete set null,
  created_at          timestamptz not null default now(),
  atendido_por        bigint references usuarios(id) on delete set null,
  atendido_at         timestamptz
);
create index if not exists pedidos_estado on pedidos (estado, colegio_id);

alter table pedidos enable row level security;

grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon, authenticated;

commit;

select 'pedidos lista' as estado;
