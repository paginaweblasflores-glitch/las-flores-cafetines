-- =====================================================================
--  LAS FLORES · 32: CAJA DEL DÍA
--
--  El personal anota cuánto dinero tiene en efectivo al cerrar.
--  El sistema lo compara con la venta de hoy según los conteos.
--  Si no cuadra, debe escribir el motivo (ej. "no anoté la chicha").
--  Se puede corregir el mismo día. Administración lo ve en Conteos.
--
--  No borra datos. Se puede ejecutar más de una vez.
-- =====================================================================

alter table cierres_dia add column if not exists monto_fisico numeric(12,2);
alter table cierres_dia add column if not exists motivo text;

create or replace function fn_registrar_caja(
  p_colegio_id bigint,
  p_usuario_id bigint,
  p_fisico     numeric,
  p_motivo     text
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_total  numeric(12,2);
  v_unid   int;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if p_fisico is null or p_fisico < 0 then raise exception 'Escribe cuánto tienes en caja'; end if;

  -- Lo que dice el sistema: las ventas de hoy de ese colegio
  select coalesce(sum(monto), 0), coalesce(sum(cantidad), 0) into v_total, v_unid
    from movimientos
   where colegio_id = p_colegio_id and tipo = 'VENTA' and fecha = fn_hoy();

  if round(p_fisico, 2) <> v_total and v_motivo is null then
    raise exception 'No cuadra: escribe el motivo';
  end if;

  insert into cierres_dia (colegio_id, fecha, usuario_id, total_ventas, unidades, monto_fisico, motivo)
  values (p_colegio_id, fn_hoy(), p_usuario_id, v_total, v_unid, round(p_fisico, 2),
          case when round(p_fisico, 2) <> v_total then v_motivo end)
  on conflict (colegio_id, fecha) do update
     set total_ventas = excluded.total_ventas, unidades = excluded.unidades,
         monto_fisico = excluded.monto_fisico, motivo = excluded.motivo,
         usuario_id = excluded.usuario_id, created_at = now();

  return jsonb_build_object('sistema', v_total, 'fisico', round(p_fisico, 2), 'diferencia', round(p_fisico, 2) - v_total);
end $$;

revoke all on function fn_registrar_caja(bigint, bigint, numeric, text) from public, anon, authenticated;
grant execute on function fn_registrar_caja(bigint, bigint, numeric, text) to service_role;

select 'Listo: caja del día' as resultado;
