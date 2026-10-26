import type { Metadata } from "next";
import Link from "next/link";
import { BadgePercent, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerProductosMapa } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { reporteMensual } from "@/lib/reportes";
import { mesActual, mesAnterior, mesSiguiente, nombreMes, numero, rangoMes, soles } from "@/lib/format";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";
import { TablaPaginada } from "@/components/paginacion";

export const metadata: Metadata = { title: "Ventas del mes" };

export default async function PaginaVentas({ searchParams }: PageProps<"/ventas">) {
  const sesion = await requerirSesion(["ADMIN"]);
  // Las ganancias solo las ve administración
  const verGanancia = sesion.rol === "ADMIN";
  const sp = await searchParams;
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual();
  const colegios = await obtenerColegios();
  const pedido = Number(sp.colegio);
  const colegio = colegios.find((c) => c.id === pedido) ?? colegios[0];
  if (!colegio) return <Vacio titulo="No hay colegios activos" />;

  const { desde, hasta } = rangoMes(mes);
  const [{ filas, columnas, montoPorDia }, productos, ventasDescuento] = await Promise.all([
    reporteMensual(colegio.id, mes),
    obtenerProductosMapa(),
    // Ventas hechas con descuento (el personal marcó "Es un descuento" al cambiar el precio)
    db()
      .from("movimientos")
      .select("producto_id, fecha, cantidad, monto, precio_unitario, precio_normal")
      .eq("colegio_id", colegio.id)
      .eq("tipo", "VENTA")
      .not("precio_normal", "is", null)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .then(check) as Promise<{ producto_id: number; fecha: string; cantidad: number; monto: number; precio_unitario: number; precio_normal: number }[]>,
  ]);
  // Por producto: cuánto se vendió con descuento, qué días y cuánto se dejó de cobrar
  const porProducto = new Map<number, { unidades: number; cobrado: number; normal: number; dias: Set<string>; precios: Set<number> }>();
  for (const v of ventasDescuento) {
    const d = porProducto.get(v.producto_id) ?? { unidades: 0, cobrado: 0, normal: 0, dias: new Set(), precios: new Set() };
    d.unidades += v.cantidad;
    d.cobrado += Number(v.monto);
    d.normal += v.cantidad * Number(v.precio_normal);
    d.dias.add(v.fecha);
    d.precios.add(Number(v.precio_unitario));
    porProducto.set(v.producto_id, d);
  }
  const descuentos = [...porProducto.entries()]
    .map(([id, d]) => ({ id, nombre: productos.get(id)?.nombre ?? "Producto", ...d, dejo: d.normal - d.cobrado }))
    .filter((d) => d.unidades !== 0)
    .sort((a, b) => b.dejo - a.dejo);
  const total = filas.reduce((a, f) => a + f.monto, 0);
  const ganancia = filas.reduce((a, f) => a + f.ganancia, 0);
  const unidades = filas.reduce((a, f) => a + f.vendido, 0);
  const url = (m: string, c = colegio.id) => `/ventas?mes=${m}&colegio=${c}`;

  return (
    <div className="mx-auto max-w-[1600px]">
      <Encabezado
        titulo="Ventas del mes"
        descripcion="Unidades vendidas por día y producto. Se llena solo con lo que registra el personal."
        acciones={
          <a href={`/api/exportar?tipo=ventas&colegio=${colegio.id}&mes=${mes}`} className="btn-secundario">
            <Download className="h-4 w-4" /> Exportar a Excel
          </a>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {colegios.map((c) => (
            <Link
              key={c.id}
              href={url(mes, c.id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium ${
                c.id === colegio.id ? "bg-panel text-white" : "border border-borde bg-white text-suave hover:text-tinta"
              }`}
            >
              {c.nombre}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href={url(mesAnterior(mes))} className="btn-secundario px-2.5" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-36 text-center font-medium capitalize">{nombreMes(mes)}</span>
          <Link href={url(mesSiguiente(mes))} className="btn-secundario px-2.5" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total vendido", soles(total)],
          verGanancia ? ["Ganancia", soles(ganancia)] : ["Días con venta", numero(montoPorDia.filter((m) => m > 0).length)],
          ["Unidades vendidas", numero(unidades)],
          ["Productos", numero(filas.length)],
        ].map(([t, v]) => (
          <div key={t} className="card p-4">
            <p className="text-xs text-suave">{t}</p>
            <p className="mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <TablaPaginada
          className="w-full border-separate border-spacing-0 text-xs"
          etiqueta="productos"
          cabecera={
            <thead>
              <tr className="text-suave">
                <th className="sticky left-0 z-10 min-w-48 border-b border-borde bg-[#fafbfa] px-3 py-2.5 text-left font-medium">
                  Producto
                </th>
                <th className="border-b border-borde bg-[#fafbfa] px-2 py-2.5 text-right font-medium" title="Stock al iniciar el mes">
                  Stock inicial
                </th>
                {columnas.map((c) => (
                  <th
                    key={c.dia}
                    className={`min-w-9 border-b border-borde px-1 py-2.5 text-center font-medium ${
                      c.esHoy ? "bg-verde text-white" : c.finDeSemana ? "bg-[#f1f3f1]" : "bg-[#fafbfa]"
                    }`}
                  >
                    {String(c.dia).padStart(2, "0")}
                  </th>
                ))}
                <th className="border-b border-borde bg-[#fafbfa] px-2 py-2.5 text-right font-medium">Vendido</th>
                <th className="border-b border-borde bg-[#fafbfa] px-2 py-2.5 text-right font-medium">Precio</th>
                <th className="border-b border-borde bg-[#fafbfa] px-2 py-2.5 text-right font-medium">Total</th>
                {verGanancia && <th className="border-b border-borde bg-[#fafbfa] px-2 py-2.5 text-right font-medium">Ganancia</th>}
                <th className="border-b border-borde bg-[#fafbfa] px-3 py-2.5 text-right font-medium" title="Stock al cerrar el mes (o actual)">
                  Stock final
                </th>
              </tr>
            </thead>
          }
          filas={filas.map((f) => (
                <tr key={f.productoId} className="group">
                  <td className="sticky left-0 z-10 border-b border-borde bg-white px-3 py-2 font-medium group-hover:bg-[#fafbfa]">
                    <span className="block max-w-56 truncate" title={f.producto}>
                      {f.producto}
                    </span>
                  </td>
                  <td className="border-b border-borde px-2 py-2 text-right text-suave">{numero(f.stockInicial)}</td>
                  {f.dias.map((u, i) => (
                    <td
                      key={i}
                      className={`border-b border-borde px-1 py-2 text-center ${columnas[i].finDeSemana ? "bg-[#f7f8f7]" : ""} ${
                        u > 0 ? "font-semibold text-verde-700" : u < 0 ? "text-rojo" : "text-borde"
                      }`}
                    >
                      {u === 0 ? "·" : u}
                    </td>
                  ))}
                  <td className="border-b border-borde px-2 py-2 text-right font-semibold">{numero(f.vendido)}</td>
                  <td className="border-b border-borde px-2 py-2 text-right text-suave">{soles(f.precio)}</td>
                  <td className="border-b border-borde px-2 py-2 text-right font-semibold">{soles(f.monto)}</td>
                  {verGanancia && <td className="border-b border-borde px-2 py-2 text-right text-verde-600">{soles(f.ganancia)}</td>}
                  <td className="border-b border-borde px-3 py-2 text-right">{numero(f.stockFinal)}</td>
                </tr>
              ))}
          pie={
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-[#fafbfa] px-3 py-3">Total del día (S/)</td>
                <td className="bg-[#fafbfa]" />
                {montoPorDia.map((m, i) => (
                  <td key={i} className="bg-[#fafbfa] px-1 py-3 text-center text-[10px] text-suave">
                    {m === 0 ? "" : numero(Math.round(m))}
                  </td>
                ))}
                <td className="bg-[#fafbfa] px-2 py-3 text-right">{numero(unidades)}</td>
                <td className="bg-[#fafbfa]" />
                <td className="bg-[#fafbfa] px-2 py-3 text-right">{soles(total)}</td>
                {verGanancia && <td className="bg-[#fafbfa] px-2 py-3 text-right text-verde-600">{soles(ganancia)}</td>}
                <td className="bg-[#fafbfa]" />
              </tr>
            </tfoot>
          }
        />
      </div>
      <p className="mt-3 text-xs text-suave">
        Los números en rojo son correcciones (el personal volvió a contar y había más de lo registrado).
      </p>

      {/* Descuentos del mes: solo aparece si el personal marcó algún descuento */}
      {descuentos.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="border-b border-borde px-5 py-4">
            <h2 className="flex items-center gap-2 font-medium">
              <BadgePercent className="h-4 w-4 text-azul" /> Descuentos del mes
            </h2>
            <p className="text-xs text-suave">
              Lo que el personal vendió con descuento para que no se pierda · se cobró {soles(descuentos.reduce((a, d) => a + d.cobrado, 0))} y
              a precio normal hubiera sido {soles(descuentos.reduce((a, d) => a + d.normal, 0))}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Días</th>
                  <th className="text-right">Unidades</th>
                  <th className="text-right">Precio con descuento</th>
                  <th className="text-right">Se cobró</th>
                  <th className="text-right">A precio normal</th>
                  <th className="text-right">Descuento dado</th>
                </tr>
              </thead>
              <tbody>
                {descuentos.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.nombre}</td>
                    <td className="text-suave">
                      {[...d.dias]
                        .sort()
                        .map((f) => Number(f.slice(8, 10)))
                        .join(", ")}
                    </td>
                    <td className="text-right">{numero(d.unidades)}</td>
                    <td className="text-right text-suave">{[...d.precios].sort((a, b) => b - a).map((p) => soles(p)).join(" · ")}</td>
                    <td className="text-right font-medium">{soles(d.cobrado)}</td>
                    <td className="text-right text-suave">{soles(d.normal)}</td>
                    <td className="text-right font-medium text-azul">{soles(d.dejo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
