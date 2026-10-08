-- =====================================================================
--  LAS FLORES · MIGRACIÓN 09: las entregas de logística también se reciben
--
--  Ejecutar DESPUÉS de 08 si tu base ya existía.
--  (Si vas a empezar de cero, 01 y 02 ya lo traen incluido.)
--  Se puede ejecutar más de una vez.
--
--  Antes: la entrega de logística sumaba stock al registrarla.
--  Ahora: queda "por recibir" como los envíos de cocina; el personal la
--  confirma (conforme u observación) y recién ahí sube el stock.
--    origen COCINA    → productos del día
--    origen LOGISTICA → entrega semanal (cajas, paquetes, costo)
-- =====================================================================

begin;

alter table envios add column if not exists origen text not null default 'COCINA';
alter table envios drop constraint if exists envios_origen_check;
alter table envios add constraint envios_origen_check check (origen in ('COCINA', 'LOGISTICA'));
-- Productos que salieron juntos (una entrega o un envío) comparten lote
alter table envios add column if not exists lote uuid;
-- Solo entregas de logística: cómo vienen y su costo
alter table envios add column if not exists cajas int not null default 0;
alter table envios add column if not exists unidades_por_caja int;
alter table envios add column if not exists unidades_sueltas int not null default 0;
alter table envios add column if not exists costo_presentacion numeric(10,2);
alter table envios add column if not exists observacion text;
alter table envios drop constraint if exists envios_cajas_check;
alter table envios add constraint envios_cajas_check check (cajas >= 0 and unidades_sueltas >= 0);
create index if not exists envios_origen on envios (origen, estado);

-- ---------------------------------------------------------------------
-- Recepción: el personal confirma lo que llegó (envío de cocina o entrega de logística)
-- ---------------------------------------------------------------------
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
  if p_cantidad_recibida is null or p_cantidad_recibida < 0 or p_cantidad_recibida > e.cantidad_enviada then
    raise exception 'La cantidad recibida debe estar entre 0 y %', e.cantidad_enviada;
  end if;

  v_pre := case when e.origen = 'LOGISTICA' then 'Entrega de logística' else 'Envío de cocina' end;
  if p_cantidad_recibida = e.cantidad_enviada then
    v_estado := 'CONFORME';
    v_obs    := v_pre || ': recibido conforme';
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

  if p_cantidad_recibida > 0 then
    if e.origen = 'LOGISTICA' then
      v_costo := e.costo_presentacion;
      if p_cantidad_recibida = e.cantidad_enviada then
        -- Llegó todo: tal cual se entregó
        v_cajas := e.cajas; v_upc := e.unidades_por_caja; v_sueltas := e.unidades_sueltas;
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

revoke all on all functions in schema public from anon, authenticated, public;
grant  execute on all functions in schema public to service_role;

commit;

select 'entregas por recibir lista' as estado;
