-- =====================================================================
--  LAS FLORES · SISTEMA DE CAFETINES
--  Archivo 2 de 2: DATOS INICIALES (sacados de los Excel)
--
--    · INVENTARIO.xlsx       (Betsy - Administración)
--    · CONTROL BOSCO.xlsx    (Fernanda - Logística)
--    · CONTROL ROMERO.xlsx   (Fernanda - Logística)
--
--  Ejecutar DESPUÉS de 01_tablas.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Colegios
-- ---------------------------------------------------------------------
insert into colegios (codigo, nombre, responsable) values
  ('BOSCO',  'Colegio Bosco',        'Personal de Bosco'),
  ('ROMERO', 'Colegio María Romero', 'Personal de Romero');

-- ---------------------------------------------------------------------
-- Usuarios (contraseñas cifradas con bcrypt)
-- ---------------------------------------------------------------------
insert into usuarios (usuario, nombre, password_hash, rol, colegio_id) values
  ('Administradora',     'Betsy',              extensions.crypt('ADMINLASFLORES1980', extensions.gen_salt('bf', 10)), 'ADMIN',     null),
  ('Logística',          'Fernanda',           extensions.crypt('LOGISTICA1980',      extensions.gen_salt('bf', 10)), 'LOGISTICA', null),
  ('Personal de Bosco',  'Personal de Bosco',  extensions.crypt('BOSCO2026',          extensions.gen_salt('bf', 10)), 'PERSONAL',  (select id from colegios where codigo = 'BOSCO')),
  ('Personal de Romero', 'Personal de Romero', extensions.crypt('ROMERO2026',         extensions.gen_salt('bf', 10)), 'PERSONAL',  (select id from colegios where codigo = 'ROMERO')),
  ('Cocina',             'Encargada de cocina', extensions.crypt('COCINA2026',        extensions.gen_salt('bf', 10)), 'COCINA',    null);

-- ---------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------
insert into categorias (nombre, orden) values
  ('Bebidas', 1),
  ('Galletas', 2),
  ('Golosinas', 3),
  ('Snacks', 4),
  ('Repostería', 5),
  ('Comida', 6),
  ('Frutas', 7);

-- ---------------------------------------------------------------------
-- Catálogo general de productos (63 productos)
-- ---------------------------------------------------------------------
insert into productos (nombre, categoria_id)
select v.nombre, c.id
from (values
  ('Keke', 'Repostería'),
  ('Agua mineral', 'Bebidas'),
  ('Galleta Integrackers', 'Galletas'),
  ('Galleta Soda V 210 g', 'Galletas'),
  ('Galleta Tentación', 'Galletas'),
  ('Galleta Pícaras', 'Galletas'),
  ('Cancha palomita', 'Snacks'),
  ('Frugos del Valle 235 ml', 'Bebidas'),
  ('Leche Chicolac 180 ml', 'Bebidas'),
  ('Frugos triángulo 145 ml', 'Bebidas'),
  ('Empanada', 'Comida'),
  ('Mil hojas', 'Repostería'),
  ('Mandarina', 'Frutas'),
  ('Suspiro', 'Repostería'),
  ('Chips', 'Snacks'),
  ('Gaseosa', 'Bebidas'),
  ('Chupetín Globo Pop', 'Golosinas'),
  ('Chicle Grosso 325 g', 'Golosinas'),
  ('Pizza', 'Comida'),
  ('Hot Dog', 'Snacks'),
  ('Chupete', 'Golosinas'),
  ('Gelatina', 'Repostería'),
  ('Pan con pollo', 'Comida'),
  ('Pan con chorizo', 'Comida'),
  ('Pan con jamón y queso', 'Comida'),
  ('Chaufa', 'Comida'),
  ('Fudge', 'Repostería'),
  ('Tres leches', 'Repostería'),
  ('Pie de limón', 'Repostería'),
  ('Salchicha', 'Comida'),
  ('Trufas', 'Repostería'),
  ('Causa', 'Comida'),
  ('Jugo de papaya', 'Bebidas'),
  ('Chupete fresa', 'Golosinas'),
  ('Chupete maracuyá', 'Golosinas'),
  ('Frugos Kids', 'Bebidas'),
  ('Galleta Rellenitas 36 g', 'Galletas'),
  ('Galleta Frac', 'Galletas'),
  ('Galleta Chomp', 'Galletas'),
  ('Chupetín Qué Loco', 'Golosinas'),
  ('Galleta Chocobum', 'Galletas'),
  ('Galleta Gretel', 'Galletas'),
  ('Galleta Black Out', 'Galletas'),
  ('Galleta Nik Costa', 'Galletas'),
  ('Galleta Glacitas', 'Galletas'),
  ('Galleta Chocman bizcocho', 'Galletas'),
  ('Cifrut', 'Bebidas'),
  ('Gaseosa KR', 'Bebidas'),
  ('Chin Chin', 'Galletas'),
  ('Galleta Doña Pepa', 'Galletas'),
  ('Galleta Obsesión', 'Galletas'),
  ('Galleta Chocodonuts', 'Galletas'),
  ('Torta de galleta', 'Repostería'),
  ('Chocolate Mecano', 'Golosinas'),
  ('Cua Cua', 'Golosinas'),
  ('Gomitas caramelo', 'Golosinas'),
  ('Galleta Casino', 'Galletas'),
  ('Cañonazo', 'Galletas'),
  ('Chocosoda', 'Galletas'),
  ('Full caramelos', 'Golosinas'),
  ('Full masticable', 'Golosinas'),
  ('Yofresh', 'Bebidas'),
  ('Pulp', 'Bebidas')
) as v(nombre, categoria)
join categorias c on c.nombre = v.categoria;

-- Productos que se venden en el día (lo que sobra se registra como merma)
update productos set perecible = true
where nombre in (
  'Pan con pollo',
  'Pan con chorizo',
  'Pan con jamón y queso',
  'Chaufa',
  'Causa',
  'Salchicha',
  'Pizza',
  'Empanada',
  'Jugo de papaya',
  'Mil hojas',
  'Tres leches',
  'Fudge',
  'Pie de limón',
  'Keke',
  'Suspiro',
  'Torta de galleta'
);

-- ---------------------------------------------------------------------
-- Stock y precios · COLEGIO BOSCO (36 productos)
--   producto | presentación | unid. x presentación | stock en unidades (cajas × unid. + sueltas del Excel) | costo x presentación | precio venta | nota
-- ---------------------------------------------------------------------
insert into producto_colegio (colegio_id, producto_id, presentacion, unidades_por_presentacion,
                              stock_unidades, costo_presentacion, precio_venta, observacion)
select col.id, p.id, v.presentacion::tipo_presentacion, v.upp, v.stock, v.costo, v.precio, v.obs
from (values
  ('Keke',                        'UNIDAD',    1,    49,      0,   1.5, null::text),
  ('Agua mineral',                'PAQUETE',  18,   538,     11,   1.5, 'Unid. por paquete tomada de C.BOSCO (verificar)'),
  ('Galleta Integrackers',        'PAQUETE',   6,    32,      5,   1.5, 'Unid. por paquete tomada de C.BOSCO (verificar)'),
  ('Galleta Soda V 210 g',        'PAQUETE',   6,    15,      3,   1.5, 'Unid. por paquete tomada de C.BOSCO (verificar)'),
  ('Galleta Tentación',           'PAQUETE',   6,    16,    4.8,   1.5, null),
  ('Galleta Pícaras',             'PAQUETE',   6,    22,      7,     2, 'Verificar unidades por paquete'),
  ('Cancha palomita',             'UNIDAD',    1,    47,      0,     1, null),
  ('Frugos del Valle 235 ml',     'CAJA',     24,   208,     32,   2.5, null),
  ('Leche Chicolac 180 ml',       'PAQUETE',  24,   177,     35,     2, null),
  ('Frugos triángulo 145 ml',     'CAJA',     24,   195,     12,     1, null),
  ('Empanada',                    'UNIDAD',    1,    24,      0,     4, null),
  ('Mil hojas',                   'UNIDAD',    1,     5,      0,     5, null),
  ('Mandarina',                   'BOLSA',    25,     9,      5,  0.25, null),
  ('Suspiro',                     'UNIDAD',    1,    11,      0,     2, null),
  ('Chips',                       'UNIDAD',    1,    46,      0,   1.5, null),
  ('Gaseosa',                     'PAQUETE',  12,    10,     12,   1.5, 'Verificar unidades por paquete'),
  ('Chupetín Globo Pop',          'PAQUETE',  24,   502,    6.5,   0.5, null),
  ('Chicle Grosso 325 g',         'BOLSA',    50,   587,    8.5,  0.25, null),
  ('Pizza',                       'UNIDAD',    1,     0,      0,     7, null),
  ('Hot Dog',                     'PAQUETE',   6,   104,    8.4,     1, 'Precio de venta tomado de C.BOSCO (verificar)'),
  ('Chupete',                     'UNIDAD',    1,    84,      0,     0, 'Sin precio de venta en el Excel'),
  ('Gelatina',                    'PAQUETE',   6,    30,    4.5,     1, 'Costo y precio tomados de C.BOSCO (verificar)'),
  ('Pan con pollo',               'UNIDAD',    1,     0,      0,     1, 'Precio tomado de INVENTARIO (verificar)'),
  ('Pan con chorizo',             'UNIDAD',    1,     0,      0,     1, 'Precio tomado de INVENTARIO (verificar)'),
  ('Pan con jamón y queso',       'UNIDAD',    1,     0,      0,   2.5, 'Precio tomado de INVENTARIO (verificar)'),
  ('Chaufa',                      'UNIDAD',    1,     0,      0,     3, 'Precio tomado de INVENTARIO (verificar)'),
  ('Fudge',                       'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Tres leches',                 'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Pie de limón',                'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Salchicha',                   'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Trufas',                      'PAQUETE',   6,     0,      4,     1, 'Datos tomados de C.BOSCO (verificar)'),
  ('Causa',                       'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Jugo de papaya',              'UNIDAD',    1,     4,      0,     1, null),
  ('Chupete fresa',               'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Chupete maracuyá',            'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Frugos Kids',                 'PAQUETE',   6,     0,    4.5,     1, 'Datos tomados de C.BOSCO (verificar)')
) as v(nombre, presentacion, upp, stock, costo, precio, obs)
join productos p on p.nombre = v.nombre
join colegios col on col.codigo = 'BOSCO';

-- ---------------------------------------------------------------------
-- Stock y precios · COLEGIO MARÍA ROMERO (40 productos)
--   producto | presentación | unid. x presentación | stock en unidades (cajas × unid. + sueltas del Excel) | costo x presentación | precio venta | nota
-- ---------------------------------------------------------------------
insert into producto_colegio (colegio_id, producto_id, presentacion, unidades_por_presentacion,
                              stock_unidades, costo_presentacion, precio_venta, observacion)
select col.id, p.id, v.presentacion::tipo_presentacion, v.upp, v.stock, v.costo, v.precio, v.obs
from (values
  ('Galleta Rellenitas 36 g',     'PAQUETE',   8,    48,      3,   0.5, null::text),
  ('Galleta Frac',                'PAQUETE',   6,    18,    4.5,     1, null),
  ('Galleta Chomp',               'PAQUETE',   6,    24,    4.8,     1, null),
  ('Chupetín Qué Loco',           'CAJA',     20,   105,     15,     1, null),
  ('Galleta Chocobum',            'PAQUETE',   6,    30,    4.5,     1, null),
  ('Galleta Gretel',              'PAQUETE',   6,    40,    4.3,     1, null),
  ('Galleta Black Out',           'PAQUETE',   4,    12,    3.2,     1, null),
  ('Galleta Nik Costa',           'PAQUETE',   6,    33,    3.5,     1, null),
  ('Galleta Glacitas',            'PAQUETE',   6,    38,    4.5,     1, null),
  ('Galleta Chocman bizcocho',    'PAQUETE',   6,    33,      4,     1, null),
  ('Cifrut',                      'PAQUETE',  15,    45,   12.5,     1, null),
  ('Gaseosa KR',                  'PAQUETE',  15,    45,     12,     1, null),
  ('Agua mineral',                'PAQUETE',  15,   257,     11,     2, 'En el Excel figura como AGUA CIELO'),
  ('Chupetín Globo Pop',          'PAQUETE',  24,   186,    6.5,     1, null),
  ('Chin Chin',                   'CAJA',     24,    89,     16,     1, null),
  ('Galleta Doña Pepa',           'CAJA',     30,   113,     26,     1, null),
  ('Galleta Obsesión',            'CAJA',     12,    40,    8.5,     1, null),
  ('Galleta Chocodonuts',         'PAQUETE',   6,    19,    4.5,     1, null),
  ('Hot Dog',                     'PAQUETE',  24,   144,    8.5,     1, 'Verificar unidades por paquete y precio'),
  ('Torta de galleta',            'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Galleta Tentación',           'PAQUETE',   6,    12,    4.8,   1.5, 'Precio igual que en Bosco (verificar)'),
  ('Chocolate Mecano',            'CAJA',     32,    64,     22,     1, null),
  ('Cua Cua',                     'CAJA',     30,    30,     24,     1, null),
  ('Gomitas caramelo',            'BOLSA',   100,   200,    8.5,     1, 'En C.ROMERO figura como Frugelé'),
  ('Galleta Casino',              'PAQUETE',   6,    18,    4.5,     1, null),
  ('Cañonazo',                    'CAJA',     24,     0,     11,     1, 'Datos tomados de C.ROMERO'),
  ('Chocosoda',                   'PAQUETE',   6,     0,      7,   1.5, 'Datos tomados de C.ROMERO'),
  ('Full caramelos',              'CAJA',     24,     0,     14,     1, 'Datos tomados de C.ROMERO'),
  ('Full masticable',             'PAQUETE',  24,     0,    7.5,     1, 'Datos tomados de C.ROMERO'),
  ('Leche Chicolac 180 ml',       'PAQUETE',   6,     0,  13.17,     3, 'Datos tomados de C.ROMERO'),
  ('Yofresh',                     'PAQUETE',   6,     0,  13.33,   2.5, 'Datos tomados de C.ROMERO'),
  ('Cancha palomita',             'BOLSA',    50,     0,   40.5,     4, 'Datos tomados de C.ROMERO (verificar)'),
  ('Chupete fresa',               'UNIDAD',    1,   114,      0,     1, null),
  ('Chupete maracuyá',            'UNIDAD',    1,   100,      0,     1, null),
  ('Frugos Kids',                 'PAQUETE',   6,    19,    4.5,   2.5, null),
  ('Mil hojas',                   'UNIDAD',    1,    40,      0,     3, null),
  ('Keke',                        'UNIDAD',    1,    84,      0,     2, null),
  ('Empanada',                    'UNIDAD',    1,     0,      0,     4, 'Precio igual que en Bosco (verificar)'),
  ('Pulp',                        'UNIDAD',    1,     0,      0,     0, 'Sin precio de venta en el Excel'),
  ('Mandarina',                   'BOLSA',    25,     0,      5,  0.25, 'Precio igual que en Bosco (verificar)')
) as v(nombre, presentacion, upp, stock, costo, precio, obs)
join productos p on p.nombre = v.nombre
join colegios col on col.codigo = 'ROMERO';

-- ---------------------------------------------------------------------
-- Ventas diarias registradas en INVENTARIO.xlsx (octubre 2026)
-- Solo se cargan las fechas hasta el 07/10/2026 (las fechas futuras del Excel se omiten).
-- ---------------------------------------------------------------------
insert into movimientos (fecha, colegio_id, producto_id, tipo, cantidad, efecto_stock,
                         precio_unitario, costo_unitario, monto, usuario_id, observacion)
select v.fecha::date, col.id, p.id, 'VENTA', v.unidades, -v.unidades, v.precio,
       pc.costo_presentacion / pc.unidades_por_presentacion, v.unidades * v.precio,
       (select id from usuarios where rol = 'ADMIN' order by id limit 1),
       'Importado de INVENTARIO.xlsx'
from (values
  ('BOSCO', 'Pan con pollo', '2026-10-01', 10, 1),
  ('BOSCO', 'Pan con pollo', '2026-10-02', 20, 1),
  ('BOSCO', 'Pan con pollo', '2026-10-06', 10, 1),
  ('ROMERO', 'Chupete fresa', '2026-10-01', 10, 1),
  ('ROMERO', 'Chupete fresa', '2026-10-02', 20, 1),
  ('ROMERO', 'Chupete fresa', '2026-10-06', 10, 1)
) as v(colegio, producto, fecha, unidades, precio)
join colegios col on col.codigo = v.colegio
join productos p on p.nombre = v.producto
join producto_colegio pc on pc.colegio_id = col.id and pc.producto_id = p.id;

commit;

-- Verificación rápida: debe mostrar los 2 colegios con sus productos
select col.nombre as colegio, count(*) as productos,
       sum(pc.stock_unidades) as unidades_en_stock
from producto_colegio pc join colegios col on col.id = pc.colegio_id
group by col.nombre order by col.nombre;
