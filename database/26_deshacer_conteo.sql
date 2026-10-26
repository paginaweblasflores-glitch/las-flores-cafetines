-- =====================================================================
--  LAS FLORES · 26: EL PERSONAL PUEDE CORREGIR LO QUE CONTÓ HOY
--
--  Si alguien contó mal un producto (por accidente, un número equivocado),
--  desde "Vendido hoy" ve lo que contó y toca "Editar": el sistema deshace
--  lo de HOY de ese producto y lo vuelve a contar.
--
--  Deshace (solo de hoy, solo de ese producto en ese colegio):
--    · las ventas del conteo (y sus correcciones)
--    · el sobrante (merma)
--    · el ajuste "El conteo del personal fue mayor al stock registrado"
--    · lo "Preparado en el cafetín"
--  y lo quita del conteo de hoy. El stock vuelve a lo que había antes de contar.
--  Lo que envió la cocina o logística NO se toca.
--
--  Solo funciona el mismo día (hasta la medianoche, hora de Lima).
--  No borra datos de otros días. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function fn_deshacer_conteo_hoy(
  p_producto_colegio_id bigint,
  p_usuario_id          bigint
) returns jsonb
language plpgsql set search_path = public as $$
declare
  r          producto_colegio;
  v_perec    boolean;
  v_vendido  int;
  v_monto    numeric;
  v_merma    int;
  v_ajuste   int;
  v_prep     int;
  v_desde    timestamptz;
  v_stock    int;
  v_conteo   bigint;
  v_corre    int;
  m          record;
begin
  select * into r from producto_colegio where id = p_producto_colegio_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  select perecible into v_perec from productos where id = r.producto_id;

  -- Lo que salió del conteo de hoy
  select coalesce(sum(cantidad) filter (where tipo = 'VENTA'), 0),
         coalesce(sum(monto)    filter (where tipo = 'VENTA'), 0),
         coalesce(sum(cantidad) filter (where tipo = 'MERMA'), 0),
         coalesce(sum(cantidad) filter (where tipo = 'AJUSTE'), 0),
         coalesce(sum(cantidad) filter (where tipo = 'INGRESO'), 0),
         min(created_at)
    into v_vendido, v_monto, v_merma, v_ajuste, v_prep, v_desde
    from movimientos
   where colegio_id = r.colegio_id and producto_id = r.producto_id and fecha = fn_hoy()
     and (tipo in ('VENTA', 'MERMA')
          or (tipo = 'AJUSTE'  and observacion = 'El conteo del personal fue mayor al stock registrado')
          or (tipo = 'INGRESO' and observacion = 'Preparado en el cafetín'));

  if v_desde is null and not (r.ultimo_conteo is not null and (r.ultimo_conteo at time zone 'America/Lima')::date = fn_hoy()) then
    raise exception 'Hoy no se contó este producto';
  end if;

  v_stock := r.stock_unidades + v_vendido + v_merma - v_ajuste - v_prep;
  if v_stock < 0 then
    raise exception 'No se puede deshacer: el stock quedaría negativo. Avisa a administración.';
  end if;

  if v_desde is not null then
    delete from movimientos
     where colegio_id = r.colegio_id and producto_id = r.producto_id and fecha = fn_hoy()
       and (tipo in ('VENTA', 'MERMA')
            or (tipo = 'AJUSTE'  and observacion = 'El conteo del personal fue mayor al stock registrado')
            or (tipo = 'INGRESO' and observacion = 'Preparado en el cafetín'));

    -- Los movimientos que quedan después (ej. un envío recibido más tarde) vuelven a calcular su stock
    select coalesce(sum(efecto_stock), 0) into v_corre
      from movimientos
     where colegio_id = r.colegio_id and producto_id = r.producto_id and created_at < v_desde;
    for m in
      select id, efecto_stock from movimientos
       where colegio_id = r.colegio_id and producto_id = r.producto_id and created_at >= v_desde
       order by created_at, id
    loop
      v_corre := v_corre + m.efecto_stock;
      update movimientos set stock_resultante = v_corre where id = m.id;
    end loop;
  end if;

  -- Vuelve a quedar "por contar"
  update producto_colegio
     set stock_unidades = v_stock, ultimo_conteo = null, updated_at = now(), updated_by = p_usuario_id
   where id = r.id;

  -- Se quita del conteo (del día: se borra; semanal: se resta lo de hoy)
  select id into v_conteo from conteos
   where colegio_id = r.colegio_id
     and tipo = case when v_perec then 'DIA' else 'SEMANA' end
     and fecha = case when v_perec then fn_hoy() else date_trunc('week', fn_hoy())::date end;
  if v_conteo is not null then
    if v_perec then
      delete from conteo_items where conteo_id = v_conteo and producto_colegio_id = r.id;
    else
      update conteo_items
         set vendido = vendido - v_vendido, monto = monto - v_monto, ajuste = ajuste - v_ajuste,
             sobrante = greatest(sobrante - v_merma, 0), quedan = v_stock, updated_at = now()
       where conteo_id = v_conteo and producto_colegio_id = r.id;
      delete from conteo_items
       where conteo_id = v_conteo and producto_colegio_id = r.id
         and vendido <= 0 and ajuste <= 0 and sobrante <= 0;
    end if;
    delete from conteos c where c.id = v_conteo and not exists (select 1 from conteo_items i where i.conteo_id = c.id);
  end if;

  return jsonb_build_object('vendido', v_vendido, 'monto', v_monto, 'sobrante', v_merma, 'stock', v_stock);
end $$;

revoke all on function fn_deshacer_conteo_hoy(bigint, bigint) from public, anon, authenticated;
grant execute on function fn_deshacer_conteo_hoy(bigint, bigint) to service_role;

select 'Listo: fn_deshacer_conteo_hoy' as resultado;
