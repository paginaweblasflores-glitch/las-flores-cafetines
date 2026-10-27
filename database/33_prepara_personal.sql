-- =====================================================================
--  LAS FLORES · 33: "LO PREPARA EL PERSONAL" APARTE DE "DEL DÍA"
--
--  Antes, "¿Cuántos preparaste hoy?" solo salía en los productos del día que
--  no manda la cocina. Ahora es una opción propia: un producto puede
--  prepararlo el personal y guardarse para el día siguiente.
--    · HOT DOG y CANCHA PALOMITA: los prepara el personal y lo que sobra
--      se guarda y se vende al día siguiente.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table productos add column if not exists prepara_personal boolean not null default false;

-- Los que ya funcionaban así (del día, no los manda la cocina) siguen preguntando cuánto se preparó
update productos set prepara_personal = true
 where perecible and not de_cocina and not acompanante and not prepara_personal;

-- Hot dog y cancha: los prepara el personal y lo que sobra pasa al día siguiente
update productos set prepara_personal = true, perecible = false, de_cocina = false
 where upper(nombre) in ('HOT DOG', 'CANCHA PALOMITA');

select nombre, case when perecible then 'del día' else 'se guarda' end as tipo, prepara_personal
  from productos where prepara_personal order by nombre;
