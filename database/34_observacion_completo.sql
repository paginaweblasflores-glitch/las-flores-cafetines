-- =====================================================================
--  LAS FLORES · 34: LLEGÓ COMPLETO, PERO CON OBSERVACIÓN
--
--  Antes "Observación" solo servía si llegaron menos o más de lo enviado.
--  Si llegaron las 30 presas pero vinieron pequeñas, no se podía anotar.
--  Ahora se puede recibir la misma cantidad con un motivo: entra todo al
--  stock y el envío queda "Con observación" para que lo vea Betsy.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function fn_recibir_envio(
  p_envio_id          bigint,
  p_cantidad_recibida int,
  p_motivo            text,
  p_usuario_id        bigint
) returns jsonb
language plpgsql set search_path = public as $$
declare
  e        envios;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_estado text;
  v_obs    text;
  v_pre    text;
  v_cajas  int := 0;
  v_upc    int;
  v_sueltas int;
  v_costo  numeric(10,2);
  v_upc_actual int;
begin
  select * into e from envios where id = p_envio_id for update;
  if not found then raise exception 'Envío no encontrado'; end if;
  if e.estado <> 'PENDIENTE' then raise exception 'Este envío ya fue recibido o anulado'; end if;
  -- Puede llegar menos (faltó, se dañó) o MÁS de lo enviado (la cocina anotó menos): se registra lo que llegó
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 or p_cantidad_recibida > 100000 then
    raise exception 'La cantidad recibida no es válida';
  end if;

  v_pre := case when e.origen = 'LOGISTICA' then 'Entrega de logística' else 'Envío de cocina' end;
  if p_cantidad_recibida = e.cantidad_enviada and v_motivo is null then
    v_estado := 'CONFORME';
    v_obs    := v_pre || ': recibido conforme';
  elsif p_cantidad_recibida = e.cantidad_enviada then
    -- Llegó completo pero con observación (ej. "las presas vinieron pequeñas")
    v_estado := 'OBSERVADO';
    v_obs    := v_pre || ': llegaron completas las ' || p_cantidad_recibida || ' (' || v_motivo || ')';
  else
    if v_motivo is null then raise exception 'Indica el motivo de la diferencia'; end if;
    v_estado := 'OBSERVADO';
    v_obs    := v_pre || ': enviaron ' || e.cantidad_enviada || ', llegaron ' || p_cantidad_recibida
                || ' (' || v_motivo || ')';
  end if;
  if e.observacion is not null then v_obs := v_obs || ' · ' || e.observacion; end if;

  update envios
     set cantidad_recibida = p_cantidad_recibida, estado = v_estado, motivo = v_motivo,
         recibido_por = p_usuario_id, recibido_at = now()
   where id = e.id;

  -- Acompañantes (salsas): se recibe solo para el registro, no entra al stock
  if p_cantidad_recibida > 0 and not coalesce((select acompanante from productos where id = e.producto_id), false) then
    if e.origen = 'LOGISTICA' then
      v_costo := e.costo_presentacion;
      if p_cantidad_recibida >= e.cantidad_enviada then
        -- Llegó todo (o de más: lo extra entra como sueltas)
        v_cajas := e.cajas; v_upc := e.unidades_por_caja;
        v_sueltas := e.unidades_sueltas + (p_cantidad_recibida - e.cantidad_enviada);
      else
        -- Llegó menos: cajas completas que alcanzan y el resto sueltas
        v_upc := e.unidades_por_caja;
        if e.cajas > 0 and coalesce(v_upc, 0) > 0 then v_cajas := p_cantidad_recibida / v_upc; end if;
        v_sueltas := p_cantidad_recibida - v_cajas * coalesce(v_upc, 0);
        if v_cajas = 0 then
          -- Sin cajas completas el costo se expresa por la caja que usa hoy el producto
          select unidades_por_presentacion into v_upc_actual from producto_colegio where id = e.producto_colegio_id;
          if v_costo is not null and coalesce(v_upc, 0) > 0 then v_costo := round(v_costo / v_upc * v_upc_actual, 2); end if;
          v_upc := null;
        end if;
      end if;
      perform fn_registrar_ingreso(e.producto_colegio_id, v_cajas, v_upc, v_sueltas, v_costo,
                                   p_usuario_id, null::date, v_obs);
    else
      perform fn_registrar_ingreso(e.producto_colegio_id, 0, null::int, p_cantidad_recibida, null::numeric,
                                   p_usuario_id, null::date, v_obs);
    end if;
  end if;

  return jsonb_build_object('estado', v_estado, 'recibido', p_cantidad_recibida,
                            'faltante', e.cantidad_enviada - p_cantidad_recibida);
end $$;

select 'Listo: se puede observar un envío que llegó completo' as resultado;
