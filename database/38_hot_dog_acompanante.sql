-- =====================================================================
--  LAS FLORES · 38: HOT DOG SOLO SE ENVÍA Y SE RECIBE
--
--  La cocina lo manda por paquete. El personal lo recibe (conforme u
--  observación) y ahí queda: no se vende, no lleva precio ni stock y no se
--  cuenta. Queda igual que las salsas (acompañante), con su paquete de 24.
--
--  Las ventas de días pasados no cambian. No borra datos.
--  Se puede ejecutar más de una vez.
-- =====================================================================

update productos
   set acompanante = true, de_cocina = true, prepara_personal = false, perecible = false
 where upper(nombre) = 'HOT DOG';

-- Sin precio de venta
update producto_colegio pc set precio_venta = 0, precio_normal = null
  from productos p
 where p.id = pc.producto_id and upper(p.nombre) = 'HOT DOG'
   and (pc.precio_venta <> 0 or pc.precio_normal is not null);

-- Sin stock: si había algo, queda en el historial como ajuste
do $$
declare f record;
begin
  for f in select pc.id from producto_colegio pc join productos p on p.id = pc.producto_id
            where upper(p.nombre) = 'HOT DOG' and pc.stock_unidades > 0 loop
    perform fn_ajustar_stock(f.id, 0, 'AJUSTE', null, 'Acompañante: no lleva stock');
  end loop;
end $$;

select p.nombre, p.acompanante, p.de_cocina, p.prepara_personal, pc.colegio_id, pc.presentacion,
       pc.unidades_por_presentacion, pc.precio_venta, pc.stock_unidades
  from productos p join producto_colegio pc on pc.producto_id = p.id
 where upper(p.nombre) = 'HOT DOG' order by pc.colegio_id;
