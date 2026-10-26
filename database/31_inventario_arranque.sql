-- =====================================================================
--  LAS FLORES · 31: INVENTARIO DE ARRANQUE
--
--  El personal registra lo que tiene físicamente en su almacén (una vez),
--  para que el sistema quede igual que el cafetín. Puede hacerlo en varios
--  días: lo que ya registró sale de la lista y lo demás sigue hasta terminar.
--  Solo los productos que se guardan (no los del día).
--
--  También puede crear un producto que tiene y no está en el sistema
--  (nombre, categoría, cuántos hay y precio). Queda "por revisar" para que
--  administración complete el costo y cómo se compra.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table producto_colegio add column if not exists arranque_at timestamptz;
alter table productos        add column if not exists por_revisar boolean not null default false;

select 'Listo: inventario de arranque' as resultado;
