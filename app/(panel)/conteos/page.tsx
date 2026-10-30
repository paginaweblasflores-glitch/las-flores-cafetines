import type { Metadata } from "next";
import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerConteos, obtenerUsuariosMapa } from "@/lib/data";
import { check, db } from "@/lib/supabase";
import { mesActual, rangoMes } from "@/lib/format";

import { Encabezado } from "@/components/encabezado";
import { ListaConteos } from "./lista";

export const metadata: Metadata = { title: "Conteos" };

export default async function PaginaConteos({ searchParams }: PageProps<"/conteos">) {
  await requerirSesion(["ADMIN"]);
  const sp = await searchParams;
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual();
  const { desde, hasta } = rangoMes(mes);

  const colegios = await obtenerColegios(false);
  // Conteos por colegio (se elige en el menú lateral o aquí); sin ?colegio, el primero
  const pedido = Number(sp.colegio);
  const colegio = colegios.find((c) => c.id === pedido) ?? colegios[0];
  if (!colegio) return null;
  const [conteos, usuarios, cajas] = await Promise.all([
    // Cada conteo es de un día: tiene los del día y los demás que contaron ese día
    obtenerConteos({ tipo: "DIA", desde, hasta, colegioId: colegio.id }),
    obtenerUsuariosMapa(),
    db()
      .from("cierres_dia")
      .select("fecha, total_ventas, monto_fisico, motivo, usuario_id, created_at")
      .eq("colegio_id", colegio.id)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .then(check) as Promise<
      { fecha: string; total_ventas: number; monto_fisico: number | null; motivo: string | null; usuario_id: number | null; created_at: string }[]
    >,
  ]);
  const cajaDe = new Map(cajas.filter((c) => c.monto_fisico != null).map((c) => [c.fecha, c]));

  const pestana = (c: { id: number; nombre: string }) => (
    <Link
      key={c.id}
      href={`/conteos?mes=${mes}&colegio=${c.id}`}
      className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        c.id === colegio.id ? "bg-panel text-white" : "border border-borde bg-white text-suave hover:text-tinta"
      }`}
    >
      {c.nombre}
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo={`Conteos · ${colegio.nombre}`}
        descripcion="Lo que contó el personal cada día (los del día y los demás que contaron ese día) y su caja. Haz clic en uno para ver producto por producto."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">{colegios.map(pestana)}</div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="colegio" value={colegio.id} />
          <input type="month" name="mes" defaultValue={mes} className="input w-auto py-1.5" />
          <button className="btn-secundario py-1.5">Ver</button>
        </form>
      </div>

      <ListaConteos
        tipo="DIA"
        porColegio={false}
        titulo={colegio.nombre}
        filas={[
          ...conteos.map((c) => {
            const ultimo = c.items.reduce((a, i) => (i.updated_at > a ? i.updated_at : a), c.updated_at);
            const caja = cajaDe.get(c.fecha);
            return {
              id: c.id,
              fecha: c.fecha,
              colegioId: c.colegio_id,
              colegio: colegio.nombre,
              contados: c.items.length,
              total: c.items.length,
              unidades: c.items.reduce((a, i) => a + i.vendido, 0),
              venta: c.items.reduce((a, i) => a + Number(i.monto), 0),
              sobrante: c.items.reduce((a, i) => a + i.sobrante, 0),
              registro: c.usuario_id ? (usuarios.get(c.usuario_id)?.nombre ?? "") : "",
              ultimo,
              caja: caja ? { fisico: Number(caja.monto_fisico), sistema: Number(caja.total_ventas), motivo: caja.motivo } : null,
            };
          }),
          // Días en que registró la caja pero no contó: también se ven (venta del sistema S/ 0)
          ...cajas
            .filter((cj) => cj.monto_fisico != null && !conteos.some((c) => c.fecha === cj.fecha))
            .map((cj) => ({
              id: 0,
              fecha: cj.fecha,
              colegioId: colegio.id,
              colegio: colegio.nombre,
              contados: 0,
              total: 0,
              unidades: 0,
              venta: 0,
              sobrante: 0,
              registro: cj.usuario_id ? (usuarios.get(cj.usuario_id)?.nombre ?? "") : "",
              ultimo: cj.created_at,
              caja: { fisico: Number(cj.monto_fisico), sistema: Number(cj.total_ventas), motivo: cj.motivo },
            })),
        ].sort((a, b) => b.fecha.localeCompare(a.fecha))}
      />
    </div>
  );
}
