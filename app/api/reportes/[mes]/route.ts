import { obtenerSesion } from "@/lib/auth";
import { mesActual } from "@/lib/format";
import {
  calcularCompras,
  calcularReporte,
  completarCompras,
  guardarReporte,
  obtenerReporteGuardado,
  primerMesConDatos,
} from "@/lib/reporte-mensual";
import { pdfCompras, pdfReporte } from "@/lib/reporte-pdf";

/**
 * PDF del reporte mensual: el guardado si el mes ya cerró, o uno preliminar del mes en curso.
 *   ?tipo=gerencia (por defecto) → ventas y ganancia, solo administración
 *   ?tipo=compras                → compras y entregas de logística (administración y logística)
 */
export async function GET(request: Request, ctx: RouteContext<"/api/reportes/[mes]">) {
  const sesion = await obtenerSesion();
  const tipo = new URL(request.url).searchParams.get("tipo") === "compras" ? "compras" : "gerencia";
  const permitido = tipo === "compras" ? sesion?.rol === "ADMIN" || sesion?.rol === "LOGISTICA" : sesion?.rol === "ADMIN";
  if (!permitido) return new Response("No autorizado", { status: 401 });

  const { mes } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("Mes no válido", { status: 400 });
  const actual = mesActual();
  if (mes > actual) return new Response("Ese mes todavía no empieza", { status: 400 });

  const preliminar = mes === actual;
  let generado = new Date().toISOString();
  let pdf: Buffer;

  if (preliminar) {
    pdf = tipo === "compras" ? await pdfCompras(await calcularCompras(mes), mes, generado, true) : await pdfReporte(await calcularReporte(mes), generado, true);
  } else {
    const guardado = await obtenerReporteGuardado(mes);
    let datos;
    if (guardado) {
      datos = tipo === "compras" ? await completarCompras(mes, guardado.datos) : guardado.datos;
      generado = guardado.generado_at;
    } else {
      // Solo se arma (y guarda) un mes desde que hay datos; antes no hay nada que reportar
      const primero = await primerMesConDatos();
      if (!primero || mes < primero) return new Response("No hay datos de ese mes", { status: 404 });
      datos = await guardarReporte(mes, null);
    }
    pdf = tipo === "compras" ? await pdfCompras(datos.compras!, mes, generado, false) : await pdfReporte(datos, generado, false);
  }

  const nombre = tipo === "compras" ? "Compras-y-entregas" : "Reporte";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}-Las-Flores-${mes}${preliminar ? "-preliminar" : ""}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
