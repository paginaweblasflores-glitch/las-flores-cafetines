import type { Metadata } from "next";
import { Download, FileText, ShoppingCart } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerUsuariosMapa } from "@/lib/data";
import { fechaHoraLima, mesActual, nombreMes, numero, soles } from "@/lib/format";
import {
  asegurarReportesCerrados,
  calcularCompras,
  calcularReporte,
  completarCompras,
  obtenerReportesGuardados,
} from "@/lib/reporte-mensual";
import { Encabezado } from "@/components/encabezado";
import { TablaPaginada } from "@/components/paginacion";
import { Vacio } from "@/components/ui";
import { RegenerarReporte } from "./regenerar";

export const metadata: Metadata = { title: "Reporte mensual" };

const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default async function PaginaReporteMensual() {
  const sesion = await requerirSesion(ROLES_PANEL);
  const esAdmin = sesion.rol === "ADMIN";
  // Si empezó un mes nuevo, el del mes que cerró se genera aquí (y queda guardado)
  await asegurarReportesCerrados();
  const actual = mesActual();
  const [guardados, usuarios] = await Promise.all([obtenerReportesGuardados(), obtenerUsuariosMapa()]);
  // Meses guardados antes de existir el reporte de compras: se les agrega
  const reportes = await Promise.all(guardados.map(async (r) => ({ ...r, datos: await completarCompras(r.mes, r.datos) })));

  const enCurso = esAdmin ? await calcularReporte(actual) : null;
  const comprasEnCurso = enCurso?.compras ?? (await calcularCompras(actual));
  // Lo comprado = entregas + lo anotado fuera del catálogo
  const totalCompras = (c?: { costo: number; otrosGastos?: { total: number } }) => (c ? c.costo + (c.otrosGastos?.total ?? 0) : 0);

  const boton = (href: string, texto: string, principal = true) => (
    <a href={href} className={`${principal ? "btn-primario" : "btn-secundario"} py-1.5 text-sm`}>
      <Download className="h-4 w-4" /> {texto}
    </a>
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <Encabezado
        titulo={esAdmin ? "Reportes mensuales" : "Reporte de compras y entregas"}
        descripcion={
          esAdmin
            ? "Se generan solos al empezar cada mes y quedan guardados. Gerencia: ventas y ganancia (solo administración). Compras y entregas: lo que compró y entregó logística."
            : "Lo que compraste y entregaste cada mes, para presentar a gerencia o a administración. Se genera solo al empezar cada mes y queda guardado."
        }
      />

      {/* Mes en curso: vista preliminar */}
      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ambar-50 text-[#8a5a00]">
            <FileText className="h-6 w-6" />
          </span>
          <div>
            <p className="font-medium">{mayus(nombreMes(actual))} · en curso</p>
            <p className="text-sm text-suave">
              Hasta hoy:{" "}
              {enCurso
                ? `vendido ${soles(enCurso.ventas.total)} · ganancia neta ${soles(enCurso.gananciaNeta)} · compras ${soles(totalCompras(comprasEnCurso))}.`
                : `${numero(comprasEnCurso.entregas.length)} entregas · gastado ${soles(totalCompras(comprasEnCurso))}.`}{" "}
              El reporte final se genera el día 1 del próximo mes.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {esAdmin && boton(`/api/reportes/${actual}`, "Gerencia (preliminar)", false)}
          {boton(`/api/reportes/${actual}?tipo=compras`, "Compras (preliminar)", false)}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-borde px-5 py-4">
          <h2 className="font-medium">Historial</h2>
          <p className="text-xs text-suave">Cada mes cerrado, con las cifras tal como se presentaron</p>
        </div>
        <TablaPaginada
          etiqueta="reportes"
          vacio={
            <div className="p-6">
              <Vacio
                icono={<FileText className="h-6 w-6" />}
                titulo="Todavía no hay meses cerrados"
                texto="El primer reporte aparecerá aquí el día 1 del próximo mes."
              />
            </div>
          }
          cabecera={
            <thead>
              <tr>
                <th>Mes</th>
                {esAdmin && <th className="text-right">Ventas</th>}
                {esAdmin && <th className="text-right">Ganancia neta</th>}
                <th className="text-right">Compras</th>
                <th className="text-right">Entregas</th>
                <th>Generado</th>
                <th />
              </tr>
            </thead>
          }
          filas={reportes.map((r) => (
            <tr key={r.mes}>
              <td className="font-medium">{mayus(nombreMes(r.mes))}</td>
              {esAdmin && <td className="text-right tabular-nums">{soles(r.datos.ventas.total)}</td>}
              {esAdmin && <td className="text-right font-medium tabular-nums">{soles(r.datos.gananciaNeta)}</td>}
              <td className="text-right tabular-nums">{soles(totalCompras(r.datos.compras))}</td>
              <td className="text-right tabular-nums">{numero(r.datos.compras?.entregas.length ?? 0)}</td>
              <td className="text-suave">
                {fechaHoraLima(r.generado_at)}
                <span className="block text-xs">
                  {r.automatico ? "Automático" : `Generado de nuevo por ${usuarios.get(r.generado_por ?? 0)?.nombre ?? "administración"}`}
                </span>
              </td>
              <td>
                <div className="flex items-center justify-end gap-2">
                  {esAdmin && <RegenerarReporte mes={r.mes} />}
                  {esAdmin && boton(`/api/reportes/${r.mes}`, "Gerencia")}
                  <a href={`/api/reportes/${r.mes}?tipo=compras`} className={`${esAdmin ? "btn-secundario" : "btn-primario"} py-1.5 text-sm`}>
                    <ShoppingCart className="h-4 w-4" /> Compras
                  </a>
                </div>
              </td>
            </tr>
          ))}
        />
      </div>
    </div>
  );
}
