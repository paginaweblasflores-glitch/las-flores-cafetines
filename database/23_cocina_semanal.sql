-- =====================================================================
--  LAS FLORES · 23: LA COCINA TAMBIÉN ENVÍA PRODUCTOS QUE NO SON DEL DÍA
--
--  "Lo envía cocina" (productos.de_cocina) deja de depender de "Se consume en
--  el día": la cocina puede enviar productos diarios, interdiarios o semanales
--  (por ejemplo, salsas en taper que duran la semana).
--    · Del día + lo envía cocina  → sale en cocina; lo que sobra es merma.
--    · No del día + lo envía cocina → sale en cocina; lo que sobra pasa al día
--      siguiente y se cuenta en el conteo semanal.
--
--  Hasta ahora todos los productos que NO son del día tenían de_cocina = true
--  (no se usaba). Aquí se ponen en false: siguen siendo de logística.
--  Después, administración marca "Lo envía cocina" en los que sí manda la cocina.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

update productos set de_cocina = false where not perecible and de_cocina;

comment on column productos.de_cocina is
  'true = lo envía la cocina (sale en su panel), sea del día o no; false = no lo manda la cocina';

-- Comprobación: cuántos envía la cocina, del día y no del día
select count(*) filter (where de_cocina and perecible)     as cocina_del_dia,
       count(*) filter (where de_cocina and not perecible) as cocina_no_del_dia,
       count(*) filter (where not de_cocina)               as no_cocina
from productos;
