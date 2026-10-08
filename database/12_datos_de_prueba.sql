-- =====================================================================
--  LAS FLORES · 12: DATOS DE PRUEBA (días anteriores, nada de hoy)
--
--  Requiere la base VACÍA (ejecutar antes 10_vaciar_datos_prueba.sql).
--  Simula ~3 semanas y media de trabajo, de lunes a viernes, hasta AYER:
--    · 33 productos (16 del día y 17 semanales) en los dos colegios
--    · cada día: envío de cocina → recepción → conteo del día (venta y sobrante)
--    · cada lunes: entrega de logística → recepción
--    · cada viernes: conteo semanal
--    · esta semana algunos semanales no se repusieron ("Se está acabando")
--    · 4 reposiciones (por aprobar, aprobada, en compra, no aprobada)
--    · un cambio de precio
--  Hoy queda todo por hacer (contar, recibir…) para probar el día.
--
--  Para quitar estos datos: 10_vaciar_datos_prueba.sql
-- =====================================================================

begin;

do $$
begin
  if exists (select 1 from productos) then
    raise exception 'La base ya tiene productos. Ejecuta primero 10_vaciar_datos_prueba.sql';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Catálogo de prueba
--   demanda = unidades que se venden por día en un colegio (aprox.)
-- ---------------------------------------------------------------------
-- Tabla de trabajo (se borra al final). No es temporal porque el editor de Supabase
-- ejecuta cada instrucción por separado y una tabla temporal se perdería.
drop table if exists _cat;
create table _cat (
  nombre text, categoria text, perecible boolean, pres tipo_presentacion,
  upc int, costo numeric, precio numeric, demanda int, solo_bosco boolean default false
);

insert into _cat (nombre, categoria, perecible, pres, upc, costo, precio, demanda, solo_bosco) values
  -- Del día (cocina): costo por unidad
  ('Empanada',              'Comida',     true,  'UNIDAD',  1,  1.20, 2.50, 30, false),
  ('Pan con pollo',         'Comida',     true,  'UNIDAD',  1,  1.50, 3.00, 25, false),
  ('Pan con jamón y queso', 'Comida',     true,  'UNIDAD',  1,  1.30, 2.50, 20, false),
  ('Pan con chorizo',       'Comida',     true,  'UNIDAD',  1,  1.20, 2.50, 18, false),
  ('Causa',                 'Comida',     true,  'UNIDAD',  1,  1.80, 3.50, 15, false),
  ('Chaufa',                'Comida',     true,  'UNIDAD',  1,  2.50, 5.00, 22, false),
  ('Pizza',                 'Comida',     true,  'UNIDAD',  1,  1.40, 3.00, 20, false),
  ('Hot dog',               'Comida',     true,  'UNIDAD',  1,  1.50, 3.00, 16, false),
  ('Keke',                  'Repostería', true,  'UNIDAD',  1,  0.60, 1.50, 25, false),
  ('Mil hojas',             'Repostería', true,  'UNIDAD',  1,  0.90, 2.00, 12, false),
  ('Pie de limón',          'Repostería', true,  'UNIDAD',  1,  1.30, 3.00, 10, false),
  ('Tres leches',           'Repostería', true,  'UNIDAD',  1,  1.50, 3.50, 12, false),
  ('Suspiro',               'Repostería', true,  'UNIDAD',  1,  1.20, 3.00,  8, true),
  ('Jugo de papaya',        'Bebidas',    true,  'UNIDAD',  1,  0.60, 1.50, 20, false),
  ('Chicha morada',         'Bebidas',    true,  'UNIDAD',  1,  0.50, 1.50, 22, false),
  ('Ensalada de frutas',    'Frutas',     true,  'UNIDAD',  1,  1.40, 3.00, 10, true),
  -- Semanales (logística): costo por caja/paquete/bolsa
  ('Agua mineral 625 ml',     'Bebidas',   false, 'PAQUETE', 15, 15.00, 1.50, 12, false),
  ('Frugos del Valle 235 ml', 'Bebidas',   false, 'CAJA',    24, 30.00, 2.00, 10, false),
  ('Inca Kola 500 ml',        'Bebidas',   false, 'PAQUETE', 12, 21.00, 2.50,  8, false),
  ('Leche Chicolac 180 ml',   'Bebidas',   false, 'CAJA',    24, 26.40, 1.50,  9, false),
  ('Cifrut 500 ml',           'Bebidas',   false, 'PAQUETE', 12, 15.60, 2.00,  6, false),
  ('Rellenitas',              'Galletas',  false, 'PAQUETE',  6,  3.60, 1.00,  8, false),
  ('Soda V',                  'Galletas',  false, 'PAQUETE',  6,  3.00, 0.80,  5, false),
  ('Casino',                  'Galletas',  false, 'PAQUETE',  6,  4.20, 1.00,  7, false),
  ('Glacitas',                'Galletas',  false, 'PAQUETE',  6,  4.50, 1.00,  6, false),
  ('Doña Pepa',               'Galletas',  false, 'CAJA',    12,  9.60, 1.20,  5, false),
  ('Chocobum',                'Golosinas', false, 'CAJA',    20, 12.00, 1.00,  9, false),
  ('Chupetín Globo Pop',      'Golosinas', false, 'BOLSA',   24,  7.20, 0.50, 10, false),
  ('Cua Cua',                 'Golosinas', false, 'CAJA',    12,  9.00, 1.00,  6, false),
  ('Sublime',                 'Golosinas', false, 'CAJA',    24, 33.60, 2.00,  5, true),
  ('Papas Lays',              'Snacks',    false, 'PAQUETE', 12, 14.40, 1.50,  7, false),
  ('Chifles',                 'Snacks',    false, 'PAQUETE', 10,  8.00, 1.20,  4, false),
  ('Cancha palomita',         'Snacks',    false, 'BOLSA',   20, 10.00, 1.00,  6, false);

insert into productos (nombre, categoria_id, perecible)
select c.nombre, (select id from categorias where nombre = c.categoria), c.perecible from _cat c;

-- Stock mínimo: semanales = lo que se vende en 2 días; del día = 0 (cocina manda a diario)
insert into producto_colegio (colegio_id, producto_id, presentacion, unidades_por_presentacion,
                              costo_presentacion, precio_venta, stock_minimo)
select co.id, p.id, c.pres, c.upc, c.costo, c.precio, case when c.perecible then 0 else c.demanda * 2 end
  from _cat c
  join productos p on p.nombre = c.nombre
  cross join colegios co
 where not (c.solo_bosco and co.codigo <> 'BOSCO');

-- ---------------------------------------------------------------------
-- Simulación de los días anteriores
-- ---------------------------------------------------------------------
do $$
declare
  v_lunes_hoy date := date_trunc('week', fn_hoy())::date;
  v_ini       date := v_lunes_hoy - 21;           -- lunes de hace 3 semanas
  v_admin     bigint := (select id from usuarios where rol = 'ADMIN' order by id limit 1);
  v_log       bigint := (select id from usuarios where rol = 'LOGISTICA' order by id limit 1);
  v_cocina    bigint := (select id from usuarios where rol = 'COCINA' order by id limit 1);
  v_pers      bigint;
  d           date;
  co          record;
  r           record;
  v_lote      uuid;
  v_conteo    bigint;
  v_env       int;
  v_rec       int;
  v_vend      int;
  v_sobr      int;
  v_cajas     int;
  v_precio    numeric;
  v_motivo    text;
  v_estado    text;
  v_cu        numeric;
  ts          timestamptz;
  v_guia      int := 100;
begin
  perform setseed(0.42);   -- siempre los mismos números

  for d in select g::date from generate_series(v_ini, fn_hoy() - 1, interval '1 day') g loop
    continue when extract(isodow from d) > 5;      -- solo días de colegio

    for co in select * from colegios order by id loop
      v_pers := coalesce((select id from usuarios where rol = 'PERSONAL' and colegio_id = co.id order by id limit 1), v_admin);

      -- ===== Lunes: entrega de logística de los semanales =====
      if extract(isodow from d) = 1 then
        v_lote := gen_random_uuid();
        v_guia := v_guia + 1;
        for r in
          select pc.*, c.demanda from producto_colegio pc
            join productos p on p.id = pc.producto_id join _cat c on c.nombre = p.nombre
           where pc.colegio_id = co.id and not p.perecible order by pc.id
        loop
          -- Esta semana algunos no se repusieron (para ver "Se está acabando")
          continue when d = v_lunes_hoy and r.producto_id % 3 = 0;
          v_env := ceil(greatest(r.demanda * 7 - r.stock_unidades, 0)::numeric / r.unidades_por_presentacion)::int;
          continue when v_env = 0;
          v_cajas := v_env;
          v_env := v_cajas * r.unidades_por_presentacion;
          v_rec := v_env; v_estado := 'CONFORME'; v_motivo := null;
          if random() < 0.08 then
            v_rec := v_env - least(v_env, 1 + floor(random() * 3)::int);
            v_estado := 'OBSERVADO'; v_motivo := 'Llegó aplastado o dañado';
          end if;
          ts := (d + time '10:15') at time zone 'America/Lima';
          insert into envios (fecha, colegio_id, producto_id, producto_colegio_id, cantidad_enviada, cantidad_recibida,
                              estado, motivo, enviado_por, created_at, recibido_por, recibido_at, origen, lote,
                              cajas, unidades_por_caja, unidades_sueltas, costo_presentacion, observacion)
          values (d, co.id, r.producto_id, r.id, v_env, v_rec, v_estado, v_motivo, v_log,
                  (d + time '08:00') at time zone 'America/Lima', v_pers, ts, 'LOGISTICA', v_lote,
                  v_cajas, r.unidades_por_presentacion, 0, r.costo_presentacion, 'Guía 0' || v_guia);
          v_cu := r.costo_presentacion / r.unidades_por_presentacion;
          insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, cajas, unidades_por_caja, efecto_stock,
                                   precio_unitario, costo_unitario, monto, stock_resultante, usuario_id, observacion, created_at)
          values (d, co.id, r.producto_id, 'INGRESO', v_rec, v_rec / r.unidades_por_presentacion, r.unidades_por_presentacion,
                  v_rec, r.costo_presentacion, v_cu, round(v_rec * v_cu, 2), r.stock_unidades + v_rec, v_pers,
                  case when v_estado = 'CONFORME' then 'Entrega de logística: recibido conforme'
                       else 'Entrega de logística: enviaron ' || v_env || ', llegaron ' || v_rec || ' (' || v_motivo || ')' end,
                  ts);
          update producto_colegio set stock_unidades = stock_unidades + v_rec where id = r.id;
        end loop;
      end if;

      -- ===== Mañana: envío de cocina de los productos del día =====
      v_lote := gen_random_uuid();
      for r in
        select pc.*, c.demanda from producto_colegio pc
          join productos p on p.id = pc.producto_id join _cat c on c.nombre = p.nombre
         where pc.colegio_id = co.id and p.perecible order by pc.id
      loop
        v_env := r.demanda + floor(random() * r.demanda * 0.4)::int;
        v_rec := v_env; v_estado := 'CONFORME'; v_motivo := null;
        if random() < 0.05 then
          v_rec := v_env - (1 + floor(random() * 3)::int);
          v_estado := 'OBSERVADO'; v_motivo := 'Llegó aplastado o dañado';
        end if;
        ts := (d + time '07:50') at time zone 'America/Lima';
        insert into envios (fecha, colegio_id, producto_id, producto_colegio_id, cantidad_enviada, cantidad_recibida,
                            estado, motivo, enviado_por, created_at, recibido_por, recibido_at, origen, lote)
        values (d, co.id, r.producto_id, r.id, v_env, v_rec, v_estado, v_motivo, v_cocina,
                (d + time '07:20') at time zone 'America/Lima', v_pers, ts, 'COCINA', v_lote);
        insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, efecto_stock, costo_unitario,
                                 stock_resultante, usuario_id, observacion, created_at)
        values (d, co.id, r.producto_id, 'INGRESO', v_rec, v_rec, r.costo_presentacion, r.stock_unidades + v_rec, v_pers,
                case when v_estado = 'CONFORME' then 'Envío de cocina: recibido conforme'
                     else 'Envío de cocina: enviaron ' || v_env || ', llegaron ' || v_rec || ' (' || v_motivo || ')' end,
                ts);
        update producto_colegio set stock_unidades = stock_unidades + v_rec where id = r.id;
      end loop;

      -- ===== Tarde: conteo del día (venta y sobrante) =====
      ts := (d + time '16:30') at time zone 'America/Lima';
      insert into conteos (colegio_id, tipo, fecha, usuario_id, created_at, updated_at)
      values (co.id, 'DIA', d, v_pers, ts, ts) returning id into v_conteo;
      for r in
        select pc.*, p.nombre from producto_colegio pc join productos p on p.id = pc.producto_id
         where pc.colegio_id = co.id and p.perecible order by pc.id
      loop
        v_vend := round(r.stock_unidades * (0.72 + random() * 0.25))::int;
        v_sobr := r.stock_unidades - v_vend;
        v_motivo := case when random() < 0.12 then 'Se cayó' when random() < 0.05 then 'Se rompió o malogró' else 'No se vendió' end;
        -- Cambio de precio de la empanada en Bosco hace 10 días (antes costaba S/ 2.00)
        v_precio := case when r.nombre = 'Empanada' and co.codigo = 'BOSCO' and d < fn_hoy() - 10 then 2.00 else r.precio_venta end;
        if v_vend > 0 then
          insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario, costo_unitario,
                                   monto, stock_resultante, usuario_id, created_at)
          values (d, co.id, r.producto_id, 'VENTA', v_vend, -v_vend, v_precio, r.costo_presentacion,
                  v_vend * v_precio, v_sobr, v_pers, ts);
        end if;
        if v_sobr > 0 then
          insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, efecto_stock, costo_unitario,
                                   stock_resultante, usuario_id, observacion, created_at)
          values (d, co.id, r.producto_id, 'MERMA', v_sobr, -v_sobr, r.costo_presentacion, 0, v_pers, v_motivo,
                  ts + interval '1 minute');
        end if;
        insert into conteo_items (conteo_id, producto_colegio_id, producto_id, habia, quedan, vendido, precio, monto,
                                  sobrante, motivo, usuario_id, created_at, updated_at)
        values (v_conteo, r.id, r.producto_id, r.stock_unidades, v_sobr, v_vend, v_precio, v_vend * v_precio,
                v_sobr, case when v_sobr > 0 then v_motivo end, v_pers, ts, ts);
        update producto_colegio set stock_unidades = 0, ultimo_conteo = ts where id = r.id;
      end loop;

      -- ===== Viernes: conteo semanal =====
      if extract(isodow from d) = 5 then
        ts := (d + time '16:45') at time zone 'America/Lima';
        insert into conteos (colegio_id, tipo, fecha, usuario_id, created_at, updated_at)
        values (co.id, 'SEMANA', d - 4, v_pers, ts, ts) returning id into v_conteo;
        for r in
          select pc.*, c.demanda from producto_colegio pc
            join productos p on p.id = pc.producto_id join _cat c on c.nombre = p.nombre
           where pc.colegio_id = co.id and not p.perecible order by pc.id
        loop
          v_vend := least(r.stock_unidades, round(r.demanda * 5 * (0.8 + random() * 0.4))::int);
          if v_vend > 0 then
            insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, efecto_stock, precio_unitario,
                                     costo_unitario, monto, stock_resultante, usuario_id, created_at)
            values (d, co.id, r.producto_id, 'VENTA', v_vend, -v_vend, r.precio_venta,
                    r.costo_presentacion / r.unidades_por_presentacion, v_vend * r.precio_venta,
                    r.stock_unidades - v_vend, v_pers, ts);
          end if;
          insert into conteo_items (conteo_id, producto_colegio_id, producto_id, habia, quedan, vendido, precio, monto,
                                    usuario_id, created_at, updated_at)
          values (v_conteo, r.id, r.producto_id, r.stock_unidades, r.stock_unidades - v_vend, v_vend, r.precio_venta,
                  v_vend * r.precio_venta, v_pers, ts, ts);
          update producto_colegio set stock_unidades = stock_unidades - v_vend, ultimo_conteo = ts where id = r.id;
        end loop;
      end if;
    end loop;
  end loop;

  -- Cambio de precio registrado
  insert into historial_precios (producto_colegio_id, precio_anterior, precio_nuevo, usuario_id, created_at)
  select pc.id, 2.00, 2.50, v_admin, ((fn_hoy() - 10) + time '09:00') at time zone 'America/Lima'
    from producto_colegio pc join productos p on p.id = pc.producto_id join colegios c on c.id = pc.colegio_id
   where p.nombre = 'Empanada' and c.codigo = 'BOSCO';
end $$;

-- ---------------------------------------------------------------------
-- Reposiciones (una en cada estado)
-- ---------------------------------------------------------------------
do $$
declare
  v_admin  bigint := (select id from usuarios where rol = 'ADMIN' order by id limit 1);
  v_log    bigint := (select id from usuarios where rol = 'LOGISTICA' order by id limit 1);
  v_bosco  bigint := (select id from colegios where codigo = 'BOSCO');
  v_romero bigint := (select id from colegios where codigo = 'ROMERO');
  v_pb     bigint := (select id from usuarios where rol = 'PERSONAL' and colegio_id = (select id from colegios where codigo = 'BOSCO') limit 1);
  v_pr     bigint := (select id from usuarios where rol = 'PERSONAL' and colegio_id = (select id from colegios where codigo = 'ROMERO') limit 1);
  v_id     bigint;
  hace     date;
begin
  -- 1) En compra (Bosco, hace 12 días)
  hace := fn_hoy() - 12;
  insert into reposiciones (colegio_id, estado, nota, pedido_por, created_at, revisado_por, revisado_at, compra_por, compra_at)
  values (v_bosco, 'EN_COMPRA', 'Para la semana de exámenes', v_pb,
          (hace + time '11:20') at time zone 'America/Lima', v_admin, (hace + time '15:00') at time zone 'America/Lima',
          v_log, ((hace + 1) + time '08:30') at time zone 'America/Lima')
  returning id into v_id;
  insert into reposicion_items (reposicion_id, producto_id, nombre, cantidad, unidad, orden) values
    (v_id, (select id from productos where nombre = 'Rellenitas'), 'Rellenitas', 6, 'PAQUETE', 1),
    (v_id, (select id from productos where nombre = 'Cua Cua'), 'Cua Cua', 2, 'CAJA', 2),
    (v_id, (select id from productos where nombre = 'Doña Pepa'), 'Doña Pepa', 2, 'CAJA', 3),
    (v_id, null, 'Platos descartables', 2, 'PAQUETE', 4),
    (v_id, null, 'Vasos descartables grandes', 1, 'PAQUETE', 5);

  -- 2) No aprobada (Romero, hace 6 días)
  hace := fn_hoy() - 6;
  insert into reposiciones (colegio_id, estado, pedido_por, created_at, revisado_por, revisado_at, motivo_rechazo)
  values (v_romero, 'RECHAZADA', v_pr, (hace + time '10:05') at time zone 'America/Lima',
          v_admin, (hace + time '12:30') at time zone 'America/Lima', 'Todavía hay stock suficiente')
  returning id into v_id;
  insert into reposicion_items (reposicion_id, producto_id, nombre, cantidad, unidad, orden) values
    (v_id, (select id from productos where nombre = 'Cancha palomita'), 'Cancha palomita', 3, 'BOLSA', 1),
    (v_id, (select id from productos where nombre = 'Chifles'), 'Chifles', 4, 'PAQUETE', 2);

  -- 3) Aprobada, con un producto quitado y una cantidad cambiada (Bosco, hace 2 días)
  hace := fn_hoy() - 2;
  insert into reposiciones (colegio_id, estado, nota, pedido_por, created_at, revisado_por, revisado_at)
  values (v_bosco, 'APROBADA', 'La salchicha es urgente', v_pb, (hace + time '09:40') at time zone 'America/Lima',
          v_admin, (hace + time '13:10') at time zone 'America/Lima')
  returning id into v_id;
  insert into reposicion_items (reposicion_id, producto_id, nombre, cantidad, unidad, orden, quitado, cantidad_aprobada) values
    (v_id, (select id from productos where nombre = 'Chocobum'), 'Chocobum', 5, 'CAJA', 1, false, 3),
    (v_id, (select id from productos where nombre = 'Casino'), 'Casino', 3, 'PAQUETE', 2, false, null),
    (v_id, (select id from productos where nombre = 'Glacitas'), 'Glacitas', 5, 'PAQUETE', 3, true, null),
    (v_id, null, 'Salchichas', 10, 'PAQUETE', 4, false, null),
    (v_id, null, 'Cucharón', 1, 'UNIDAD', 5, false, null);

  -- 4) Por aprobar (Romero, ayer)
  hace := fn_hoy() - 1;
  insert into reposiciones (colegio_id, estado, pedido_por, created_at)
  values (v_romero, 'POR_APROBAR', v_pr, (hace + time '15:50') at time zone 'America/Lima')
  returning id into v_id;
  insert into reposicion_items (reposicion_id, producto_id, nombre, cantidad, unidad, orden) values
    (v_id, (select id from productos where nombre = 'Agua mineral 625 ml'), 'Agua mineral 625 ml', 4, 'PAQUETE', 1),
    (v_id, (select id from productos where nombre = 'Papas Lays'), 'Papas Lays', 2, 'PAQUETE', 2),
    (v_id, null, 'Pinza para pan', 1, 'UNIDAD', 3),
    (v_id, null, 'Tenedores grandes', 2, 'PAQUETE', 4);
end $$;

drop table if exists _cat;

commit;

-- Resumen de lo cargado
select 'productos' as que, count(*)::text as cuantos from productos
union all select 'stock por colegio', count(*)::text from producto_colegio
union all select 'días con conteo', count(distinct fecha)::text from conteos where tipo = 'DIA'
union all select 'ventas registradas (S/)', coalesce(sum(monto), 0)::text from movimientos where tipo = 'VENTA'
union all select 'entregas y envíos', count(*)::text from envios
union all select 'reposiciones', count(*)::text from reposiciones
union all select 'movimientos de hoy (debe ser 0)', count(*)::text from movimientos where fecha >= fn_hoy();
