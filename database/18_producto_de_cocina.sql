-- =====================================================================
--  LAS FLORES · 18: PRODUCTOS DEL DÍA QUE NO MANDA LA COCINA
--
--  Algunos productos del día se cuentan a diario en el cafetín, pero no los
--  prepara ni los envía la cocina. Con esta marca no aparecen en el panel de
--  cocina; se siguen contando cada día como antes.
--
--  de_cocina = true  → lo envía la cocina (todos los productos actuales)
--  de_cocina = false → del día, pero no lo manda la cocina
--
--  No borra ni cambia datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table productos add column if not exists de_cocina boolean not null default true;

comment on column productos.de_cocina is
  'Solo para productos del día: true = lo envía la cocina (aparece en su panel); false = se cuenta a diario pero no lo manda la cocina';

-- Comprobación: productos del día y si los envía la cocina
select count(*) filter (where perecible) as del_dia,
       count(*) filter (where perecible and de_cocina) as los_envia_cocina
from productos;
