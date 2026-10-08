import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerConteos, obtenerProductosMapa, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { horaLima, nombreConteo, numero, soles } from "@/lib/format";
import { BotonImprimir } from "@/components/imprimir";

export const metadata: Metadata = { title: "Conteo" };

export default async function PaginaConteo({ params }: PageProps<"/conteos/[id]">) {
  await requerirSesion(["ADMIN"]);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [c] = await obtenerConteos({ id });
  if (!c) notFound();

  const [colegios, productos, usuarios, stock] = await Promise.all([
    obtenerColegios(false),
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
    obtenerStock({ colegioId: c.colegio_id }),
  ]);
  const colegio = colegios.find((x) => x.id === c.colegio_id)?.nombre ?? "";
  const items = [...c.items].sort((a, b) =>
    (productos.get(a.producto_id)?.nombre ?? "").localeCompare(productos.get(b.producto_id)?.nombre ?? ""),
  );
  // Productos de ese tipo que hoy no aparecen en el conteo
  const contados = new Set(items.map((i) => i.producto_colegio_id));
  const faltaron = stock.filter((s) => s.perecible === (c.tipo === "DIA") && !contados.has(s.id));

  const venta = items.reduce((a, i) => a + Number(i.monto), 0);
  const unidades = items.reduce((a, i) => a + i.vendido, 0);
  const sobrante = items.reduce((a, i) => a + i.sobrante, 0);
  const titulo = c.tipo === "DIA" ? "Conteo del día" : "Conteo semanal";

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href={`/conteos?tipo=${c.tipo === "DIA" ? "dia" : "semana"}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-tinta print:hidden">
        <ArrowLeft className="h-4 w-4" /> Conteos
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-suave">
            {titulo} · {colegio}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{nombreConteo(c.tipo, c.fecha)}</h1>
        </div>
        <BotonImprimir />
      </div>

      {/* Resumen */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Contados", v: `${items.length} de ${items.length + faltaron.length}` },
          { t: "Venta", v: soles(venta) },
          { t: "Unidades vendidas", v: numero(unidades) },
          { t: "Sobrante", v: sobrante > 0 ? `${numero(sobrante)} unid.` : "—" },
        ].map((x) => (
          <div key={x.t} className="card px-5 py-4">
            <p className="text-xs text-suave">{x.t}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Había</th>
                <th className="text-right">Quedan</th>
                <th className="text-right">Vendido</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Venta</th>
                {c.tipo === "DIA" && <th className="text-right">Sobrante</th>}
                <th>Contó</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium">
                    {productos.get(i.producto_id)?.nombre ?? "Producto"}
                    {i.ajuste > 0 && (
                      <span className="block text-xs font-normal text-[#8a5a00]">+{i.ajuste} de más (ajuste para revisar)</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{numero(i.habia)}</td>
                  <td className="text-right tabular-nums">{numero(i.quedan)}</td>
                  <td className={`text-right font-medium tabular-nums ${i.vendido < 0 ? "text-[#8a5a00]" : ""}`}>{numero(i.vendido)}</td>
                  <td className="text-right tabular-nums text-suave">{soles(i.precio)}</td>
                  <td className="text-right font-medium tabular-nums">{soles(i.monto)}</td>
                  {c.tipo === "DIA" && (
                    <td className="text-right tabular-nums">
                      {i.sobrante > 0 ? numero(i.sobrante) : "—"}
                      {i.motivo && i.sobrante > 0 && <span className="block text-xs text-suave">{i.motivo}</span>}
                    </td>
                  )}
                  <td className="whitespace-nowrap text-suave">
                    {i.usuario_id ? usuarios.get(i.usuario_id)?.nombre : "—"}
                    <span className="block text-xs">{horaLima(i.updated_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-3">Total</td>
                <td />
                <td />
                <td className="px-3 py-3 text-right tabular-nums">{numero(unidades)}</td>
                <td />
                <td className="px-3 py-3 text-right tabular-nums">{soles(venta)}</td>
                {c.tipo === "DIA" && <td className="px-3 py-3 text-right tabular-nums">{sobrante > 0 ? numero(sobrante) : "—"}</td>}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {faltaron.length > 0 && (
        <div className="card mt-4 px-5 py-4">
          <p className="text-sm font-medium">No se contaron ({faltaron.length})</p>
          <p className="mt-1 text-sm text-suave">{faltaron.map((s) => s.producto).join(" · ")}</p>
        </div>
      )}
    </div>
  );
}
