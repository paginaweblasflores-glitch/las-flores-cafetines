# Las Flores · Sistema de Cafetines

Aplicativo web para controlar el stock y las ventas de los cafetines escolares del Restaurante Turístico Las Flores.
Reemplaza los Excel `INVENTARIO.xlsx` (Administración), `CONTROL BOSCO.xlsx` y `CONTROL ROMERO.xlsx` (Logística).

**Tecnologías:** Next.js 16 (React 19) + Supabase (PostgreSQL) + Tailwind CSS.

---

## 1. Puesta en marcha

### a) Base de datos (Supabase)
1. Entra a tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → **New query**.
2. Copia y ejecuta **`database/01_tablas.sql`** (crea tablas, vistas, funciones y seguridad).
3. En otra query, copia y ejecuta **`database/02_datos.sql`** (colegios, usuarios, productos, stock y precios sacados de los Excel).
   Al final debe mostrar una tablita con *Colegio Bosco* y *Colegio María Romero*.

> Ejecutar de nuevo `01_tablas.sql` **borra todo** y deja la base en blanco (útil para empezar de cero después de las pruebas).
>
> **¿Ya tenías la base creada con la versión anterior (con "cajas cerradas" y "abrir caja")?** Ejecuta
> `database/03_migrar_stock_en_unidades.sql`: convierte el stock a unidades sin perder datos. Si prefieres empezar
> de cero, basta con 01 y 02.
>
> Después ejecuta también `database/04_productos_del_dia.sql` (marca de productos "del día": empanadas, jugos…).
> Y luego `database/05_cocina_envios.sql` (usuario Cocina y envíos de productos del día).
> Y luego `database/06_conteo_semanal.sql` (fecha del último conteo, para el conteo semanal).
> Y luego `database/07_pedidos_reposicion.sql` (pedidos de reposición del personal).
> Y luego `database/08_reposiciones.sql` (listas de reposición: el personal pide, administración aprueba, logística compra).
> Y luego `database/09_entregas_por_recibir.sql` (las entregas de logística las confirma el personal en "Recibir").
> Y luego `database/11_conteos.sql` (conteos por fecha: del día y semanal, con su detalle por producto).
> Y luego `database/13_reportes_mensuales.sql` (historial del reporte mensual en PDF).
> Y luego `database/14_costo_fuera_catalogo.sql` (logística anota el costo de lo comprado fuera del catálogo).
> Y luego `database/15_reposicion_comprada.sql` (logística aprueba, compra y cierra las reposiciones con "Comprado").
> Y luego `database/16_usuarios_supabase_auth.sql` y **`node scripts/usuarios-a-supabase-auth.mjs`** (ver "Inicio de sesión").
>
> **Empezar en limpio:** (después del 11) `database/10_vaciar_datos_prueba.sql` borra para siempre productos, stock, ventas, historial,
> envíos y reposiciones. Conserva colegios, usuarios y categorías. Después los productos se crean desde el Catálogo.
>
> **Datos de prueba:** con la base vacía, `database/12_datos_de_prueba.sql` carga ~3 semanas de trabajo simulado
> (hasta ayer): productos, envíos de cocina, entregas, conteos del día y semanales, ventas y reposiciones.
> Para quitarlos, otra vez `10_vaciar_datos_prueba.sql`.

### b) Conexión (`.env`)
En Supabase → **Project Settings → API** copia los 3 datos al archivo `.env`:

| Variable | Dónde está |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` (o *publishable key*) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (o *secret key*) — **no compartir** |

### Inicio de sesión (Supabase Auth)
Los usuarios entran con **Supabase Auth**. Cada usuario del sistema tiene una cuenta en
*Authentication → Users* con un correo interno que nadie usa (no se verifica):

| Usuario | Correo interno |
|---|---|
| Administradora | administradora@lasflores.co |
| Logística | logistica@lasflores.co |
| Personal de Bosco | bosco@lasflores.co |
| Personal de Romero | romero@lasflores.co |
| Cocina | cocina@lasflores.co |

Después de cargar la base (incluida la migración 16), crear esas cuentas una sola vez con:
```bash
node scripts/usuarios-a-supabase-auth.mjs
```
Conserva las contraseñas actuales (copia su cifrado). Los usuarios nuevos que se creen desde
**Usuarios** en el panel ya nacen con su cuenta.

### c) Ejecutar
```bash
npm install
npm run dev
```
Abrir http://localhost:3000

Para producción: `npm run build` y `npm start` (o subir a Vercel con las 3 variables de arriba).

---

## 2. Usuarios

| Usuario | Contraseña | Rol | Qué ve |
|---|---|---|---|
| Administradora | ADMINLASFLORES1980 | Administración | Todo + colegios y usuarios |
| Logística | LOGISTICA1980 | Logística | Stock, entregas, productos, ventas, historial |
| Personal de Bosco | BOSCO2026 | Personal | Solo la pantalla de registro de su colegio |
| Personal de Romero | ROMERO2026 | Personal | Solo la pantalla de registro de su colegio |
| Cocina | COCINA2026 | Cocina | Solo registra los productos del día que envía a cada colegio |

En el login se elige el usuario (no el correo). El usuario no distingue mayúsculas ni tildes (`logistica` = `Logística`).
La administradora puede crear usuarios, cambiar contraseñas y desactivar accesos desde **Usuarios**.

### Aplicativo en el celular (Android)
1. La administradora abre el link del sistema en **Chrome** del celular, entra con su usuario y va a **Usuarios**.
2. Toca **Descargar aplicativo** → **Instalar**. Queda el ícono *Las Flores* en la pantalla del celular.
3. **Cierra su sesión** (el aplicativo comparte la sesión con Chrome) y la persona entra con su propio usuario.

Funciona solo con HTTPS (Vercel). Si Chrome no muestra el botón, se instala desde el menú ⋮ → *Instalar aplicación*.

---

## 3. Cómo funciona (en simple)

El stock de cada producto en cada colegio es
**un solo número: el total de unidades que hay en el cafetín** (sueltas + las que estén en cajas cerradas).
Las cajas o paquetes solo sirven para registrar con claridad lo que se envía (por ejemplo *4 paquetes de 24 + 5 sueltas*)
y quedan en el historial.

| Quién | Qué hace | Dónde |
|---|---|---|
| **Personal** | Tres secciones: **Recibir** (aprueba u observa lo que manda la cocina), **Del día** (cuenta lo que queda y el sobrante con su motivo, cada día) y **Semanal** (cuenta una vez por semana y usa *Pedir reposición* cuando algo se acaba). Cada producto se guarda con su propio botón. | Pantalla del personal (celular) |
| **Logística** | Registra lo que entrega a cada colegio (suma stock). Corrige el stock o registra mermas. Configura costos y precios. | Entregas / Control de stock |
| **Administración** | Ve todo: ventas, ganancias, stock, historial. Crea colegios y usuarios. | Todo el panel |

**La venta se calcula sola:** si había 232 unidades y el personal cuenta 182, se registran 50 vendidas × precio.
Si se equivoca y vuelve a contar más, el sistema corrige la venta del día; si sobra, queda como *ajuste* para revisión en el Historial.
Si le llega mercadería (por ejemplo empanadas de la cocina), usa **Recibí**: suma al stock sin contar como venta y aparece en el Historial como *Recibido (personal)* para que logística lo verifique.

**Productos del día** (empanadas, jugo de papaya, panes, postres…): se marcan en el Catálogo como *"Se consume en el día"*.
En la pantalla del personal tienen un campo extra **"No vendido / merma"** con su motivo (No se vendió, Se malogró, Se venció u otro).
Ejemplo: llegaron 20 jugos, quedan 5 y se marcan como merma → 15 vendidos y 5 de merma; la merma no cuenta como venta
y queda en el Historial con su motivo.

### Pantallas del panel
- **Inicio:** ventas de hoy y del mes, ganancia, valor del stock, gráfico diario vs. mes pasado, qué colegios ya registraron, más vendidos y productos por reponer.
- **Control de stock:** la hoja CONTROL de cada colegio, con fórmulas correctas. Entregas, ajustes, edición y alta de productos. Exporta a Excel.
- **Ventas del mes:** la hoja INVENTARIO (productos × días) armada automáticamente con stock inicial y final. Exporta a Excel.
- **Entregas:** registrar varias entregas de una vez y ver las del mes.
- **Catálogo:** lista general de productos (nombre, categoría, activo) y en qué colegios se vende. Los precios se manejan en Control de stock.
- **Historial:** cada movimiento de stock y cada cambio de precio, con fecha, hora y usuario.
- **Colegios** (solo admin): crear colegios nuevos copiando el catálogo de otro.
- **Usuarios** (solo admin).

### Agregar un colegio nuevo (el próximo año)
1. **Colegios → Nuevo colegio** (elige copiar productos y precios de Bosco o Romero).
2. **Usuarios → Nuevo usuario** con rol *Personal* y ese colegio.
3. **Entregas:** registrar la mercadería inicial.

---

## 4. Notas sobre la importación de los Excel

- Se importaron **63 productos**: 36 en Bosco y 40 en Romero, con su stock en unidades (cajas del Excel × unidades por caja + sueltas), costo por caja/paquete y precio de venta.
- Las ventas diarias de `INVENTARIO.xlsx` se cargaron hasta el 07/10/2026; las fechas futuras del Excel (27 y 30 de octubre) se omitieron.
- Correcciones a fórmulas de los Excel originales:
  - `C.ROMERO / C.BOSCO`: *PRECIO UNITARIO* dividía unidades ÷ precio (al revés) y *VENTA TOTAL* no multiplicaba por el precio de venta.
  - `CONTROL`: *GANANCIA* restaba el precio de **una** caja al valor de **todo** el stock.
  - El sistema ahora calcula: costo unitario = costo caja ÷ unidades por caja; ganancia = (precio venta − costo unitario) × unidades.
- Datos que conviene **revisar** (tienen una nota en la columna *observación* del Control de stock):
  - Productos sin precio de venta en el Excel (Chupete, Fudge, Tres leches, Pie de limón, Salchicha, Causa, Torta de galleta, Pulp…).
  - Unidades por paquete que no estaban en CONTROL y se tomaron de la hoja C.BOSCO/C.ROMERO (Agua mineral, Integrackers, Soda V, Hot Dog, Gelatina…).
  - Precios de INVENTARIO que parecen de plantilla (Pan con pollo S/ 1.00, Pizza S/ 1.50 vs. S/ 7.00 en CONTROL).
  - "AGUA CIELO" (Romero) se unificó como *Agua mineral*; "Frugelé" como *Gomitas caramelo*.
  - El producto genérico "GALLETA" de INVENTARIO no se importó porque ya existen las galletas por marca.

---

## 5. Estructura

```
app/
  login/            Ingreso
  personal/         Pantalla simple del personal (celular)
  (panel)/          Panel de administración y logística
    dashboard/ stock/ ventas/ ingresos/ productos/ movimientos/ colegios/ usuarios/
  actions/          Acciones del servidor (guardar, registrar, etc.)
  api/exportar/     Descarga de Excel
lib/                Sesión, consultas, formatos
database/           01_tablas.sql, 02_datos.sql y migraciones
scripts/            usuarios-a-supabase-auth.mjs (crear las cuentas de Supabase Auth)
proxy.ts            Protección de rutas por rol
```

**Seguridad:** el navegador nunca habla directo con la base. Todo pasa por el servidor con la *service_role key*;
las tablas tienen RLS activo sin políticas, así que la llave pública no puede leer nada. Las contraseñas y las
sesiones las maneja Supabase Auth; el rol de cada cuenta va en su `app_metadata` (solo lo cambia el servidor).
