-- =====================================================================
--  LAS FLORES · 37: LO DE FUERA DEL CATÁLOGO SALE EN ENTREGAS
--
--  Sale en la entrega como un producto más y el personal confirma si llegó
--  conforme o con observación. Queda como registro: no se crea en el
--  catálogo, no entra al stock y no se cuenta.
--
--  Lo ya registrado fuera del catálogo (HOT DOG de REP-0001) pasa a Entregas
--  como "Por recibir". No cambia ningún gasto ni stock.
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table envios alter column producto_id drop not null;
alter table envios alter column producto_colegio_id drop not null;
alter table envios add column if not exists nombre text;
alter table envios add column if not exists reposicion_item_id bigint;
alter table envios drop constraint if exists envios_producto_o_nombre;
alter table envios add constraint envios_producto_o_nombre check (producto_colegio_id is not null or nombre is not null);

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

  -- Acompañantes (salsas) y fuera de catálogo: se recibe solo para el registro, no entra al stock
  if p_cantidad_recibida > 0 and e.producto_colegio_id is not null
     and not coalesce((select acompanante from productos where id = e.producto_id), false) then
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

insert into envios (fecha, colegio_id, cantidad_enviada, origen, lote, cajas, unidades_por_caja, unidades_sueltas,
                    costo_presentacion, enviado_por, created_at, nombre, reposicion_item_id)
select i.costo_fecha, r.colegio_id,
       coalesce(i.cajas, 0) * coalesce(i.unidades_por_caja, 0) + coalesce(i.sueltas, 0),
       'LOGISTICA', gen_random_uuid(), coalesce(i.cajas, 0),
       case when i.presentacion = 'UNIDAD' then 1 else coalesce(i.unidades_por_caja, 1) end,
       coalesce(i.sueltas, 0), i.costo_presentacion, i.costo_por, i.entregado_at, i.nombre, i.id
  from reposicion_items i
  join reposiciones r on r.id = i.reposicion_id
 where i.producto_id is null and i.entregado_at is not null and i.costo_presentacion is not null
   and not exists (select 1 from envios e where e.reposicion_item_id = i.id);

select nombre, cantidad_enviada, estado from envios where reposicion_item_id is not null order by id;
