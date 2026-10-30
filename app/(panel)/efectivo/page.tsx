import type { Metadata } from "next";
import Link from "next/link";
import { Banknote } from "lucide-react";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios } from "@/lib/data";
import { fechaCorta, fechaLarga, hoyISO, lunesDeSemana, soles } from "@/lib/format";
import { check, db } from "@/lib/supabase";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Efectivo" };

const restarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const corto = (n: string) => n.replace(/^Colegio\s+/i, "");

/**
 * Efectivo: lo que el personal anotó en "Caja de hoy", día por día y acumulado, por colegio y en total.
 * Betsy elige desde cuándo (2, 3, 5 días…) y ve cuánto se juntó para ir a recoger.
 */
export default async function PaginaEfectivo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requerirSesion(["ADMIN"]);
  const sp = await searchParams;
  const hoy = hoyISO();
  const hasta = esFecha(sp.hasta) && sp.hasta <= hoy ? sp.hasta : hoy;
  const desde = esFecha(sp.desde) && sp.desde <= hasta ? sp.desde : lunesDeSemana(hoy);

  const colegios = await obtenerColegios();
  const [cajas, ventas] = await Promise.all([
    db()
      .from("cierres_dia")
      .select("colegio_id, fecha, total_ventas, monto_fisico, motivo")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .then(check) as Promise<{ colegio_id: number; fecha: string; total_ventas: number; monto_fisico: number | null; motivo: string | null }[]>,
    // Venta del sistema por día (para los días en que no se registró la caja)
    db()
      .from("v_ventas_diarias")
      .select("colegio_id, fecha, monto")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .then(check) as Promise<{ colegio_id: number; fecha: string; monto: number }[]>,
  ]);

  const ventaDia = new Map<string, number>();
  for (const v of ventas) ventaDia.set(`${v.colegio_id}|${v.fecha}`, (ventaDia.get(`${v.colegio_id}|${v.fecha}`) ?? 0) + Number(v.monto));
  const cajaDia = new Map(cajas.filter((c) => c.monto_fisico != null).map((c) => [`${c.colegio_id}|${c.fecha}`, c]));

  // Días con algo (venta o caja), del más antiguo al más nuevo para ir acumulando
  const fechas = [...new Set([...ventas.map((v) => v.fecha), ...cajas.map((c) => c.fecha)])].sort();
  type Celda = { efectivo: number | null; sistema: number; motivo: string | null };
  const celda = (cid: number, f: string): Celda => {
    const c = cajaDia.get(`${cid}|${f}`);
    // La venta del sistema se toma al día (puede haber cambiado después de cerrar la caja)
    const sistema = ventaDia.get(`${cid}|${f}`) ?? Number(c?.total_ventas ?? 0);
    return { efectivo: c ? Number(c.monto_fisico) : null, sistema, motivo: c?.motivo ?? null };
  };
  const dias = fechas.map((f) => {
    const porColegio = colegios.map((c) => celda(c.id, f));
    return { fecha: f, porColegio, totalDia: porColegio.reduce((a, x) => a + (x.efectivo ?? 0), 0) };
  });
  // Lo acumulado hasta cada día (del más antiguo al más nuevo)
  const filas = dias.map((d, i) => ({ ...d, acumulado: dias.slice(0, i + 1).reduce((a, x) => a + x.totalDia, 0) }));

  const resumen = colegios.map((c, i) => {
    const dias = filas.map((r) => r.porColegio[i]).filter((x) => x.sistema > 0 || x.efectivo != null);
    const efectivo = dias.reduce((a, x) => a + (x.efectivo ?? 0), 0);
    const sistema = dias.reduce((a, x) => a + x.sistema, 0);
    const conCaja = dias.filter((x) => x.efectivo != null);
    const sistemaConCaja = conCaja.reduce((a, x) => a + x.sistema, 0);
    return { colegio: c, efectivo, sistema, dias: dias.length, sinRegistrar: dias.length - conCaja.length, diferencia: efectivo - sistemaConCaja };
  });
  const totalEfectivo = resumen.reduce((a, r) => a + r.efectivo, 0);

  // Atajos de rango (Betsy no recoge en un día fijo)
  const atajos = [
    { t: "Hoy", d: hoy },
    { t: "Últimos 2 días", d: restarDias(hoy, 1) },
    { t: "Últimos 3 días", d: restarDias(hoy, 2) },
    { t: "Últimos 5 días", d: restarDias(hoy, 4) },
    { t: "Esta semana", d: lunesDeSemana(hoy) },
    { t: "Este mes", d: `${hoy.slice(0, 7)}-01` },
  ];
  const dif = (n: number) => Math.round(n * 100) / 100;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Efectivo"
        descripcion="Lo que cada colegio anotó en su «Caja de hoy», día por día y acumulado. Elige desde cuándo para ver cuánto hay que recoger."
      />

      {/* Rango */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {atajos.map((a) => {
          const activo = desde === a.d && hasta === hoy;
          return (
            <Link
              key={a.t}
              href={`/efectivo?desde=${a.d}&hasta=${hoy}`}
              className={`rounded-xl px-3.5 py-2 text-sm font-medium ${activo ? "bg-panel text-white" : "border border-borde bg-white text-suave hover:text-tinta"}`}
            >
              {a.t}
            </Link>
          );
        })}
        <form className="ml-auto flex items-center gap-2">
          <input type="date" name="desde" defaultValue={desde} max={hoy} className="input w-auto py-1.5" aria-label="Desde" />
          <span className="text-sm text-suave">al</span>
          <input type="date" name="hasta" defaultValue={hasta} max={hoy} className="input w-auto py-1.5" aria-label="Hasta" />
          <button className="btn-secundario py-1.5">Ver</button>
        </form>
      </div>

      {/* Resumen: lo que se juntó en el rango */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r) => (
          <div key={r.colegio.id} className="card p-4">
            <p className="text-xs text-suave">{r.colegio.nombre}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{soles(r.efectivo)}</p>
            <p className="mt-1 text-xs text-suave">
              en efectivo · {r.dias} día{r.dias === 1 ? "" : "s"} · sistema {soles(r.sistema)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.sinRegistrar > 0 && (
                <span className="chip chip-atencion">
                  {r.sinRegistrar} día{r.sinRegistrar === 1 ? "" : "s"} sin registrar
                </span>
              )}
              {r.sistema === 0 && r.efectivo > 0 ? (
                <span className="chip chip-neutro">Sin conteos: no se puede comparar</span>
              ) : dif(r.diferencia) !== 0 ? (
                <span className="chip chip-atencion">
                  {r.diferencia > 0 ? "Sobran" : "Faltan"} {soles(Math.abs(r.diferencia))}
                </span>
              ) : (
                r.dias - r.sinRegistrar > 0 && <span className="chip chip-exito">Cuadra</span>
              )}
            </div>
          </div>
        ))}
        <div className="card border-verde/40 bg-verde-50/40 p-4">
          <p className="text-xs text-suave">Total de los colegios</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-verde-700">{soles(totalEfectivo)}</p>
          <p className="mt-1 text-xs text-suave">
            en efectivo · del {fechaCorta(desde)} al {fechaCorta(hasta)}
          </p>
        </div>
      </div>

      {/* Día por día, con lo acumulado */}
      <div className="card overflow-hidden">
        <div className="border-b border-borde px-5 py-4">
          <h2 className="flex items-center gap-2 font-medium">
            <Banknote className="h-4 w-4 text-suave" /> Día por día
          </h2>
          <p className="text-xs text-suave">El efectivo que anotó el personal; debajo, lo que dice el sistema y la diferencia.</p>
        </div>
        {filas.length === 0 ? (
          <Vacio icono={<Banknote className="h-6 w-6" />} titulo="Sin ventas en estos días" texto="Elige otro rango de fechas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Día</th>
                  {colegios.map((c) => (
                    <th key={c.id} className="text-right">
                      {corto(c.nombre)}
                    </th>
                  ))}
                  <th className="text-right">Total del día</th>
                  <th className="text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {[...filas].reverse().map((r) => (
                  <tr key={r.fecha}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium first-letter:uppercase">{fechaLarga(r.fecha)}</span>
                    </td>
                    {r.porColegio.map((x, i) => {
                      const d = x.efectivo == null ? null : dif(x.efectivo - x.sistema);
                      return (
                        <td key={colegios[i].id} className="text-right align-top">
                          {x.efectivo == null ? (
                            x.sistema > 0 ? (
                              <span className="chip chip-atencion">Sin registrar</span>
                            ) : (
                              <span className="text-suave">—</span>
                            )
                          ) : (
                            <span className="font-semibold tabular-nums">{soles(x.efectivo)}</span>
                          )}
                          {x.sistema === 0 && x.efectivo != null && (
                            <span className="mt-0.5 block text-xs text-suave">sin conteo ese día</span>
                          )}
                          {x.sistema > 0 && (
                            <span className="mt-0.5 block text-xs text-suave tabular-nums">
                              sistema {soles(x.sistema)}
                              {d != null && d !== 0 && (
                                <span className="text-[#8a5a00]">
                                  {" "}
                                  · {d > 0 ? "+" : "−"}
                                  {soles(Math.abs(d))}
                                </span>
                              )}
                              {d === 0 && <span className="text-verde-700"> · cuadra</span>}
                            </span>
                          )}
                          {x.motivo && d !== 0 && x.sistema > 0 && (
                            <span className="ml-auto block max-w-[220px] text-xs text-[#8a5a00]" title={x.motivo}>
                              {x.motivo}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-right font-semibold tabular-nums">{soles(r.totalDia)}</td>
                    <td className="text-right font-semibold tabular-nums text-verde-700">{soles(r.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="font-semibold">Total</td>
                  {resumen.map((r) => (
                    <td key={r.colegio.id} className="text-right font-semibold tabular-nums">
                      {soles(r.efectivo)}
                    </td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">{soles(totalEfectivo)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
