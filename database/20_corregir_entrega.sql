-- =====================================================================
--  LAS FLORES · 20: CORREGIR UNA ENTREGA DE LOGÍSTICA (aunque ya la recibieron)
--
--  Logística o administración corrige cuánto se entregó (cajas, unidades por
--  caja y sueltas) con una nota obligatoria. El sistema ajusta todo para que
--  nada se descuadre:
--    · Por recibir   → solo cambia la cantidad (el stock aún no subió).
--    · Conforme      → cambia la cantidad y el stock del colegio sube o baja
--                      la diferencia (queda como "Ajuste" en el Historial).
--    · Con observación (llegó menos) → cambia lo enviado; si ahora coincide
--                      con lo que llegó, pasa a conforme. El stock no cambia
--                      (lo que llegó es lo que llegó).
--  Cada corrección queda anotada en envios.correccion con fecha y motivo.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table envios add column if not exists correccion text;

create or replace function fn_corregir_entrega(
  p_envio_id          bigint,
  p_cajas             int,
  p_unidades_por_caja int,
  p_unidades_sueltas  int,
  p_nota              text,
  p_usuario_id        bigint
) returns jsonb
language plpgsql set search_path = public as $$
declare
  e        envios;
  r        producto_colegio;
  v_nuevo  int;
  v_dif    int := 0;
  v_estado text;
  v_txt    text;
begin
  if coalesce(trim(p_nota), '') = '' then raise exception 'Escribe el motivo de la corrección'; end if;
  if p_cajas is null or p_cajas < 0 or p_unidades_sueltas is null or p_unidades_sueltas < 0 then
    raise exception 'Las cantidades no pueden ser negativas';
  end if;
  if p_cajas > 0 and coalesce(p_unidades_por_caja, 0) < 1 then
    raise exception 'Indica cuántas unidades trae cada caja o paquete';
  end if;

  select * into e from envios where id = p_envio_id for update;
  if not found then raise exception 'Entrega no encontrada'; end if;
  if e.origen <> 'LOGISTICA' then raise exception 'Solo se corrigen entregas de logística'; end if;
  if e.estado = 'ANULADO' then raise exception 'La entrega está anulada'; end if;

  v_nuevo := p_cajas * coalesce(p_unidades_por_caja, 0) + p_unidades_sueltas;
  if v_nuevo <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;

  v_estado := e.estado;
  if e.estado = 'CONFORME' then
    v_dif := v_nuevo - e.cantidad_recibida;
  elsif e.estado = 'OBSERVADO' then
    if v_nuevo < e.cantidad_recibida then
      raise exception 'Ya llegaron % unidades: la entrega no puede ser menor', e.cantidad_recibida;
    end if;
    if v_nuevo = e.cantidad_recibida then v_estado := 'CONFORME'; end if;
  end if;

  v_txt := to_char(now() at time zone 'America/Lima', 'DD/MM HH24:MI') || ': ' || e.cantidad_enviada || ' → ' || v_nuevo
           || ' (' || trim(p_nota) || ')';

  update envios
     set cantidad_enviada  = v_nuevo,
         cajas             = p_cajas,
         unidades_por_caja = case when p_cajas > 0 then p_unidades_por_caja else null end,
         unidades_sueltas  = p_unidades_sueltas,
         cantidad_recibida = case when e.estado = 'CONFORME' then v_nuevo else cantidad_recibida end,
         estado            = v_estado,
         motivo            = case when v_estado = 'CONFORME' then null else motivo end,
         correccion        = coalesce(correccion || ' · ', '') || v_txt
   where id = e.id;

  -- Ya estaba en el stock: se sube o baja la diferencia (queda en el Historial como ajuste)
  if v_dif <> 0 then
    select * into r from producto_colegio where id = e.producto_colegio_id for update;
    if r.stock_unidades + v_dif < 0 then
      raise exception 'El stock quedaría negativo (hay % y se restarían %). Revísalo con el colegio.', r.stock_unidades, -v_dif;
    end if;
    perform fn_ajustar_stock(r.id, r.stock_unidades + v_dif, 'AJUSTE', p_usuario_id,
      'Corrección de entrega de logística: ' || e.cantidad_enviada || ' → ' || v_nuevo || ' (' || trim(p_nota) || ')');
  end if;

  return jsonb_build_object('estado', v_estado, 'diferencia', v_dif, 'cantidad', v_nuevo);
end $$;

-- Solo el servidor (service_role) puede ejecutarla
revoke all on function fn_corregir_entrega(bigint, int, int, int, text, bigint) from public, anon, authenticated;
grant execute on function fn_corregir_entrega(bigint, int, int, int, text, bigint) to service_role;

select 'Listo: corrección de entregas disponible' as resultado;
