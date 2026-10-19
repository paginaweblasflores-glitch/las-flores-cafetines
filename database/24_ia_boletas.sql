-- =====================================================================
--  LAS FLORES · 24: LLENAR ENTREGAS CON IA (leer la boleta de compra)
--
--  · configuracion: claves de la IA (cifradas por la app), modelo e
--    instrucciones. Solo la usa el servidor.
--  · ia_documentos: "memoria" de la IA (hojas de referencia, PDF, fotos)
--    que se le pasan en cada lectura de boleta.
--  · ia_equivalencias: lo que aprendió. Cómo aparece un producto en la
--    boleta → qué producto es en el sistema (ej. "BEB GLORIA DURAZNO"
--    → FRUGOS KIDS TRIANGULO). Se guarda al registrar la entrega.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists configuracion (
  clave       text primary key,
  valor       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  bigint references usuarios(id) on delete set null
);

create table if not exists ia_documentos (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  tipo        text not null,               -- application/pdf, image/jpeg...
  tamano      int not null,                -- bytes del archivo
  datos       text not null,               -- archivo en base64
  created_at  timestamptz not null default now(),
  subido_por  bigint references usuarios(id) on delete set null
);

create table if not exists ia_equivalencias (
  id           bigint generated always as identity primary key,
  texto        text not null unique,       -- como sale en la boleta (normalizado: mayúsculas, sin tildes)
  producto_id  bigint not null references productos(id) on delete cascade,
  usos         int not null default 1,
  updated_at   timestamptz not null default now()
);

alter table configuracion    enable row level security;
alter table ia_documentos    enable row level security;
alter table ia_equivalencias enable row level security;

revoke all on configuracion, ia_documentos, ia_equivalencias from anon, authenticated;
grant  all on configuracion, ia_documentos, ia_equivalencias to service_role;
grant  all on all sequences in schema public to service_role;

-- Comprobación
select to_regclass('public.configuracion')    as configuracion,
       to_regclass('public.ia_documentos')    as ia_documentos,
       to_regclass('public.ia_equivalencias') as ia_equivalencias;
