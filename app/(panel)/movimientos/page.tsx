import type { Metadata } from "next";
import { History } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import {
  obtenerCambiosPrecio,
  obtenerColegios,
  obtenerMovimientos,
  obtenerProductosMapa,
  obtenerUsuariosMapa,
} from "@/lib/data";
import { fechaCorta, horaLima, mesActual, numero, rangoMes, soles } from "@/lib/format";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";
import { TablaPaginada } from "@/components/paginacion";
import type { TipoMovimiento } from "@/lib/types";

export const metadata: Metadata = { title: "Historial" };

type Tipo = TipoMovimiento | "PRECIO";

const TIPOS: Record<Tipo, { texto: string; clase: string }> = {
  VENTA: { texto: "Venta", clase: "bg-verde-50 text-verde-700" },
  INGRESO: { texto: "Entrega", clase: "bg-[#e8f0fb] text-[#2b5ea7]" },
  AJUSTE: { texto: "Ajuste", clase: "bg-ambar-50 text-[#8a5a00]" },
  MERMA: { texto: "Merma", clase: "bg-rojo-50 text-rojo" },
  PRECIO: { texto: "Cambio de precio", clase: "bg-[#f1ebfa] text-[#6a3fb0]" },
};

const LIMITE = 1000;

// Fila común para movimientos de stock y cambios de precio
type Registro = {
  clave: string;
  fecha: string;
  hora: string;
  tipo: Tipo;
  etiqueta: string;
  productoId: number;
  colegioId: number;
  cantidad: React.ReactNode;
  monto: React.ReactNode;
  stock: React.ReactNode;
  usuarioId: number | null;
  detalle: string | null;
};

export default async function PaginaMovimientos({ searchParams }: PageProps<"/movimientos">) {
  await requerirSesion(ROLES_PANEL);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { desde: d0, hasta: h0 } = rangoMes(mesActual());
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(str("desde")) ? str("desde") : d0;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(str("hasta")) ? str("hasta") : h0;
  const tipo = (str("tipo") in TIPOS ? str("tipo") : "") as Tipo | "";
  const colegios = await obtenerColegios(false);
  const pedido = Number(str("colegio"));
  const colegioId = colegios.some((c) => c.id === pedido) ? pedido : null;

  const verMovimientos = tipo !== "PRECIO";
  const verPrecios = tipo === "" || tipo === "PRECIO";

  const [movs, precios, productos, usuarios] = await Promise.all([
    verMovimientos ? obtenerMovimientos({ colegioId, tipo: tipo || null, desde, hasta, limite: LIMITE }) : [],
    verPrecios ? obtenerCambiosPrecio({ colegioId, desde, hasta, limite: LIMITE }) : [],
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
  ]);
  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));

  const registros: (Registro & { orden: string })[] = [
    ...movs.map((m) => {
      const recibidoPersonal = m.tipo === "INGRESO" && m.observacion?.startsWith("Recibido en el cafetín");
      const deCocina = m.tipo === "INGRESO" && m.observacion?.startsWith("Envío de cocina");
      const deLogistica = m.tipo === "INGRESO" && m.observacion?.startsWith("Entrega de logística");
      const etiqueta = deCocina
        ? "Envío de cocina"
        : deLogistica
        ? "Entrega recibida"
        : recibidoPersonal
        ? "Recibido (personal)"
        : m.tipo === "VENTA" && m.cantidad < 0
          ? "Corrección"
          : TIPOS[m.tipo].texto;
      return {
        clave: `m${m.id}`,
        orden: m.created_at,
        fecha: m.fecha,
        hora: m.created_at,
        tipo: recibidoPersonal ? ("AJUSTE" as Tipo) : m.tipo,
        etiqueta,
        productoId: m.producto_id,
        colegioId: m.colegio_id,
        cantidad: (
          <span className={m.efecto_stock > 0 ? "text-verde-600" : m.efecto_stock < 0 ? "text-rojo" : "text-suave"}>
            {m.efecto_stock > 0 ? "+" : m.efecto_stock < 0 ? "−" : ""}
            {numero(Math.abs(m.efecto_stock || m.cantidad))}
          </span>
        ),
        monto: Number(m.monto) !== 0 ? soles(m.monto) : "—",
        stock: m.stock_resultante ?? "—",
        usuarioId: m.usuario_id,
        // Entregas: detalle de cajas, por ejemplo "4 cajas × 24 + 5 sueltas"
        detalle:
          m.tipo === "INGRESO" && m.cajas > 0
            ? [`${m.cajas} × ${m.unidades_por_caja ?? "?"}${m.cantidad - m.cajas * (m.unidades_por_caja ?? 0) > 0 ? ` + ${m.cantidad - m.cajas * (m.unidades_por_caja ?? 0)} sueltas` : ""}`, m.observacion]
                .filter(Boolean)
                .join(" · ")
            : m.observacion,
      };
    }),
    ...precios.map((c) => ({
      clave: `p${c.id}`,
      orden: c.created_at,
      fecha: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(c.created_at)),
      hora: c.created_at,
      tipo: "PRECIO" as Tipo,
      etiqueta: TIPOS.PRECIO.texto,
      productoId: c.producto_id,
      colegioId: c.colegio_id,
      cantidad: <span className="text-suave">—</span>,
      monto: (
        <span className="whitespace-nowrap">
          <span className="text-suave line-through">{soles(c.precio_anterior)}</span>{" "}
          <span className={Number(c.precio_nuevo) >= Number(c.precio_anterior) ? "text-verde-700" : "text-rojo"}>
            → {soles(c.precio_nuevo)}
          </span>
        </span>
      ),
      stock: "—",
      usuarioId: c.usuario_id,
      detalle: "Precio de venta por unidad",
    })),
  ].sort((a, b) => (a.orden < b.orden ? 1 : -1));

  const alLimite = movs.length === LIMITE || precios.length === LIMITE;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Historial"
        descripcion="Todo lo que pasó: ventas, entregas, cajas abiertas, ajustes, mermas y cambios de precio. Quién y cuándo."
      />

      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label>
          <span className="label">Colegio</span>
          <select name="colegio" defaultValue={colegioId ?? "todos"} className="input">
            <option value="todos">Todos</option>
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Tipo</span>
          <select name="tipo" defaultValue={tipo} className="input">
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Desde</span>
          <input type="date" name="desde" defaultValue={desde} className="input" />
        </label>
        <label>
          <span className="label">Hasta</span>
          <input type="date" name="hasta" defaultValue={hasta} className="input" />
        </label>
        <button className="btn-primario">Filtrar</button>
      </form>

      <div className="card overflow-hidden">
        {registros.length === 0 ? (
          <Vacio icono={<History className="h-6 w-6" />} titulo="No hay registros con esos filtros" />
        ) : (
          <TablaPaginada
            etiqueta="registros"
            cabecera={
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Colegio</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Monto / precio</th>
                  <th className="text-right">Stock después</th>
                  <th>Usuario</th>
                  <th>Detalle</th>
                </tr>
              </thead>
            }
            filas={registros.map((r) => (
              <tr key={r.clave}>
                <td className="whitespace-nowrap">
                  {fechaCorta(r.fecha)}
                  <span className="block text-xs text-suave">{horaLima(r.hora)}</span>
                </td>
                <td>
                  <span className={`chip ${TIPOS[r.tipo].clase}`}>{r.etiqueta}</span>
                </td>
                <td className="font-medium">{productos.get(r.productoId)?.nombre ?? "—"}</td>
                <td className="whitespace-nowrap text-suave">{nombreColegio.get(r.colegioId)}</td>
                <td className="text-right font-medium">{r.cantidad}</td>
                <td className="text-right">{r.monto}</td>
                <td className="text-right text-suave">{r.stock}</td>
                <td className="whitespace-nowrap text-suave">{r.usuarioId ? usuarios.get(r.usuarioId)?.nombre : "—"}</td>
                <td className="max-w-64 truncate text-xs text-suave" title={r.detalle ?? undefined}>
                  {r.detalle}
                </td>
              </tr>
            ))}
          />
        )}
        {alLimite && (
          <p className="border-t border-borde px-4 py-3 text-xs text-suave">
            Se muestran los últimos {LIMITE} de cada tipo. Usa los filtros de fecha para ver más.
          </p>
        )}
      </div>
    </div>
  );
}
