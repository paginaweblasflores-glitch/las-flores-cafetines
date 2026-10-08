import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerColegios, obtenerEnvios, obtenerProductosMapa, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { agruparLotes, ESTADO_ENVIO, estadoLote } from "@/lib/entregas";
import { fechaHoraLima, fechaLarga, horaLima, numero, soles } from "@/lib/format";
import { BotonImprimir } from "@/components/imprimir";
import { AnularEntrega } from "../anular";

export const metadata: Metadata = { title: "Entrega" };

export default async function PaginaEntrega({ params }: PageProps<"/ingresos/[lote]">) {
  await requerirSesion(ROLES_PANEL);
  const { lote } = await params;
  // Envíos antiguos sin lote llegan como "e<id>"
  const porId = /^e\d+$/.test(lote) ? Number(lote.slice(1)) : null;
  if (!porId && !/^[0-9a-f-]{36}$/i.test(lote)) notFound();
  const envios = await obtenerEnvios(porId ? { id: porId } : { lote });
  const todos = envios.filter((e) => e.estado !== "ANULADO");
  const [l] = agruparLotes(todos);
  if (!l) notFound();

  const [colegios, productos, usuarios, stock] = await Promise.all([
    obtenerColegios(false),
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
    obtenerStock({ colegioId: l.colegioId }),
  ]);
  const filaStock = new Map(stock.map((s) => [s.id, s]));
  const esLogistica = l.origen === "LOGISTICA";
  const costo = (e: (typeof todos)[number]) => {
    const s = filaStock.get(e.producto_colegio_id);
    const porCaja = e.unidades_por_caja ?? s?.unidades_por_presentacion ?? 1;
    const c = e.costo_presentacion != null ? Number(e.costo_presentacion) : Number(s?.costo_presentacion ?? 0);
    return (e.cantidad_enviada * c) / porCaja;
  };
  const items = [...l.items].sort((a, b) =>
    (productos.get(a.producto_id)?.nombre ?? "").localeCompare(productos.get(b.producto_id)?.nombre ?? ""),
  );
  const est = estadoLote(l);
  const enviadas = items.reduce((a, e) => a + e.cantidad_enviada, 0);
  const llegaron = items.reduce((a, e) => a + (e.cantidad_recibida ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link href="/ingresos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-tinta print:hidden">
        <ArrowLeft className="h-4 w-4" /> Entregas
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-suave">
            {esLogistica ? "Entrega de logística" : "Envío de cocina"} · {colegios.find((c) => c.id === l.colegioId)?.nombre}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">
              {fechaLarga(l.fecha)} <span className="font-normal text-suave">{horaLima(l.creado)}</span>
            </h1>
            <span className={`chip ${est.clase}`}>{est.texto}</span>
          </div>
          <p className="mt-1 text-sm text-suave">
            {l.enviadoPor ? `Registró ${usuarios.get(l.enviadoPor)?.nombre}` : ""}
            {l.nota ? ` · ${l.nota}` : ""}
          </p>
        </div>
        <BotonImprimir />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Productos", v: numero(items.length) },
          { t: "Unidades enviadas", v: numero(enviadas) },
          { t: "Llegaron", v: l.porRecibir === items.length ? "—" : numero(llegaron) },
          esLogistica
            ? { t: "Costo", v: soles(items.reduce((a, e) => a + costo(e), 0)) }
            : { t: "Por recibir", v: numero(l.porRecibir) },
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
                {esLogistica && <th>Cómo viene</th>}
                <th className="text-right">Enviadas</th>
                <th className="text-right">Llegaron</th>
                {esLogistica && <th className="text-right">Costo</th>}
                <th>Estado</th>
                <th>Recibió</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const nombre = productos.get(e.producto_id)?.nombre ?? "Producto";
                return (
                  <tr key={e.id}>
                    <td className="font-medium">{nombre}</td>
                    {esLogistica && (
                      <td className="text-suave">
                        {e.cajas > 0
                          ? `${e.cajas} × ${e.unidades_por_caja}${e.unidades_sueltas > 0 ? ` + ${e.unidades_sueltas} sueltas` : ""}`
                          : "sueltas"}
                      </td>
                    )}
                    <td className="text-right tabular-nums">{numero(e.cantidad_enviada)}</td>
                    <td className={`text-right font-medium tabular-nums ${e.estado === "OBSERVADO" ? "text-[#8a5a00]" : ""}`}>
                      {e.cantidad_recibida == null ? "—" : numero(e.cantidad_recibida)}
                    </td>
                    {esLogistica && <td className="text-right tabular-nums">{soles(costo(e))}</td>}
                    <td>
                      <span className={`chip ${ESTADO_ENVIO[e.estado].clase}`}>{ESTADO_ENVIO[e.estado].texto}</span>
                      {e.motivo && <span className="block text-xs text-[#8a5a00]">{e.motivo}</span>}
                      {e.estado === "PENDIENTE" && (
                        <span className="mt-1 block print:hidden">
                          <AnularEntrega id={e.id} producto={nombre} />
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-suave">
                      {e.recibido_por ? usuarios.get(e.recibido_por)?.nombre : "—"}
                      {e.recibido_at && <span className="block text-xs">{fechaHoraLima(e.recibido_at)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
