import Link from "next/link";
import { ArrowRight, ClipboardList, PackageSearch, ShoppingCart, Truck, Wallet } from "lucide-react";
import { obtenerColegios, obtenerEnvios, obtenerOtrosGastos, obtenerReposiciones, obtenerStock } from "@/lib/data";
import { agruparLotes, estadoLote } from "@/lib/entregas";
import { ESTADO_REPOSICION, fechaCorta, fechaISOLima, hoyISO, horaLima, nombreMes, numero, rangoMes, soles } from "@/lib/format";
import { Inicial } from "@/components/ui";
import { ListaPaginada, TablaPaginada } from "@/components/paginacion";
import type { Sesion } from "@/lib/types";

/** Días entre una fecha y hoy, en palabras ("hoy", "hace 3 días") */
function hace(ts: string, hoy: string) {
  const d = Math.round((Date.parse(hoy) - Date.parse(fechaISOLima(ts))) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

/** Inicio de logística: lo que hay que comprar, entregar y revisar (sin ventas ni ganancias) */
export async function InicioLogistica({ sesion, colegioId }: { sesion: Sesion; colegioId: number | null }) {
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const { desde } = rangoMes(mes);
  const hace30 = new Date(Date.parse(hoy) - 30 * 86400000).toISOString().slice(0, 10);

  const [colegios, stock, reposiciones, envios, gastosMes] = await Promise.all([
    obtenerColegios(),
    obtenerStock({ colegioId }),
    obtenerReposiciones({ colegioId, limite: 300 }),
    obtenerEnvios({ origen: "LOGISTICA", desde: hace30, hasta: hoy, colegioId }),
    obtenerOtrosGastos(desde, hoy, colegioId),
  ]);
  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));
  const filaPc = new Map(stock.map((s) => [s.id, s]));

  // Reposiciones que esperan a logística
  const porRevisar = reposiciones.filter((r) => r.estado === "POR_APROBAR");
  const porComprar = reposiciones.filter((r) => r.estado === "APROBADA");
  const enCompra = reposiciones.filter((r) => r.estado === "EN_COMPRA");
  const abiertas = [...porRevisar, ...porComprar, ...enCompra].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Lo pedido en curso (para marcar en "Por reponer")
  const pedido = new Map<string, string>();
  for (const r of reposiciones) {
    if (r.estado !== "POR_APROBAR" && r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") continue;
    for (const i of r.items) if (i.producto_id != null && !i.quitado) pedido.set(`${r.colegio_id}-${i.producto_id}`, r.codigo);
  }
  const semanales = stock.filter((s) => !s.perecible);
  const bajos = semanales.filter((s) => s.stock_bajo).sort((a, b) => a.total_unidades - b.total_unidades);

  // Entregas (agrupadas) de los últimos 30 días
  const lotes = agruparLotes(envios);
  const sinRecibir = lotes.filter((l) => l.porRecibir > 0).length;
  const costo = (e: (typeof envios)[number]) => {
    const st = filaPc.get(e.producto_colegio_id);
    const c = e.costo_presentacion ?? st?.costo_presentacion ?? 0;
    return ((e.cantidad_recibida ?? e.cantidad_enviada) * Number(c)) / (e.unidades_por_caja ?? st?.unidades_por_presentacion ?? 1);
  };
  const otrosGastos = gastosMes.reduce((a, g) => a + g.costo, 0);
  const comprasMes = envios.filter((e) => e.fecha >= desde && e.estado !== "ANULADO").reduce((a, e) => a + costo(e), 0) + otrosGastos;

  const fichas = [
    { t: "Por revisar", v: numero(porRevisar.length), nota: "reposiciones que pidió el personal", href: "/reposiciones", icono: ClipboardList, alerta: porRevisar.length > 0 },
    {
      t: "Por comprar",
      v: numero(porComprar.length + enCompra.length),
      nota: enCompra.length ? `${numero(enCompra.length)} ya en compra` : "aprobadas",
      href: "/reposiciones",
      icono: ShoppingCart,
      alerta: porComprar.length > 0,
    },
    { t: "Sin recibir", v: numero(sinRecibir), nota: "entregas que el colegio no confirma", href: "/ingresos", icono: Truck, alerta: sinRecibir > 0 },
    { t: "Por reponer", v: numero(bajos.length), nota: `de ${numero(semanales.length)} semanales en su mínimo`, href: "/stock", icono: PackageSearch, alerta: bajos.length > 0 },
    {
      t: "Compras del mes",
      v: soles(comprasMes),
      nota: otrosGastos > 0 ? `entregas + ${soles(otrosGastos)} fuera del catálogo` : "entregas a los colegios",
      href: "/reporte-mensual",
      icono: Wallet,
      alerta: false,
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-normal tracking-tight">
          Hola de nuevo, <b className="font-semibold">{sesion.nombre}</b>
        </h1>
        <p className="mt-1 text-sm text-suave">
          Compras y entregas · {colegioId ? nombreColegio.get(colegioId) : "Todos los colegios"} · {nombreMes(mes)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {fichas.map((f) => {
          const Icono = f.icono;
          return (
            <Link key={f.t} href={f.href} className="card block p-4 transition-colors hover:border-verde/50">
              <p className="flex items-center justify-between text-xs text-suave">
                {f.t} <Icono className={`h-4 w-4 ${f.alerta ? "text-ambar" : "text-suave/60"}`} />
              </p>
              <p className="mt-1 text-xl font-semibold">{f.v}</p>
              <p className="mt-2 text-xs text-suave">{f.nota}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Reposiciones que esperan compra */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <div>
              <h2 className="font-medium">Reposiciones por atender</h2>
              <p className="text-xs text-suave">Por revisar, por comprar y en compra · de la más antigua a la más reciente</p>
            </div>
            <Link href="/reposiciones" className="text-sm text-verde-700 hover:underline">
              Ver todas
            </Link>
          </div>
          <TablaPaginada
            etiqueta="reposiciones"
            vacio={<p className="px-5 py-10 text-center text-sm text-suave">No hay reposiciones por atender. Todo al día.</p>}
            cabecera={
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Colegio</th>
                  <th>Pedida</th>
                  <th className="text-right">Productos</th>
                  <th>Estado</th>
                </tr>
              </thead>
            }
            filas={abiertas.map((r) => {
              const est = ESTADO_REPOSICION[r.estado];
              const quedan = r.items.filter((i) => !i.quitado);
              const fuera = quedan.filter((i) => i.producto_id == null);
              const sinCosto = fuera.filter((i) => i.costo == null).length;
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/reposiciones/${r.id}`} className="whitespace-nowrap font-semibold text-verde-700 hover:underline">
                      {r.codigo}
                    </Link>
                  </td>
                  <td>{nombreColegio.get(r.colegio_id)}</td>
                  <td className="text-suave">{hace(r.created_at, hoy)}</td>
                  <td className="text-right tabular-nums">
                    {quedan.length}
                    {fuera.length > 0 && (
                      <span className="block text-xs text-suave">
                        {fuera.length} fuera de catálogo{sinCosto ? ` · ${sinCosto} sin costo` : ""}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`chip ${est?.clase ?? ""}`}>{est?.texto ?? r.estado}</span>
                  </td>
                </tr>
              );
            })}
          />
        </section>

        {/* Lo que se está acabando */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <div>
              <h2 className="font-medium">Por reponer</h2>
              <p className="text-xs text-suave">Semanales en su mínimo o menos</p>
            </div>
            <Link href="/ingresos" className="text-sm text-verde-700 hover:underline">
              Registrar entrega
            </Link>
          </div>
          {bajos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-suave">Todos los semanales están sobre su mínimo.</p>
          ) : (
            <ListaPaginada
              className="divide-y divide-borde"
              etiqueta="productos"
              items={bajos.map((s) => {
                const p = pedido.get(`${s.colegio_id}-${s.producto_id}`);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <Inicial nombre={s.producto} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.producto}</p>
                      <p className="truncate text-xs text-suave">
                        {s.colegio} · mínimo {s.stock_minimo}
                      </p>
                    </div>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`chip ${s.total_unidades === 0 ? "bg-rojo-50 text-rojo" : "bg-ambar-50 text-[#8a5a00]"}`}>
                        {s.total_unidades === 0 ? "Agotado" : `Quedan ${s.total_unidades}`}
                      </span>
                      {p ? <span className="text-[11px] text-[#2b5ea7]">Pedido {p}</span> : <span className="text-[11px] text-suave">Nadie lo pidió</span>}
                    </span>
                  </li>
                );
              })}
            />
          )}
        </section>
      </div>

      {/* Cómo llegaron las entregas */}
      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <div>
            <h2 className="font-medium">Últimas entregas y cómo llegaron</h2>
            <p className="text-xs text-suave">Últimos 30 días · lo que el personal confirmó al recibir</p>
          </div>
          <Link href="/ingresos" className="inline-flex items-center gap-1 text-sm text-verde-700 hover:underline">
            Entregas <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <TablaPaginada
          etiqueta="entregas"
          vacio={<p className="px-5 py-10 text-center text-sm text-suave">No hubo entregas en los últimos 30 días.</p>}
          cabecera={
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Colegio</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Costo</th>
                <th>Estado</th>
              </tr>
            </thead>
          }
          filas={lotes.map((l) => {
            const est = estadoLote(l);
            const enviadas = l.items.reduce((a, e) => a + e.cantidad_enviada, 0);
            const llegaron = l.items.reduce((a, e) => a + (e.cantidad_recibida ?? 0), 0);
            const obs = l.items.filter((e) => e.estado === "OBSERVADO");
            return (
              <tr key={l.clave}>
                <td className="whitespace-nowrap">
                  <Link href={`/ingresos/${l.clave}`} className="font-medium text-verde-700 hover:underline">
                    {fechaCorta(l.fecha)}
                  </Link>
                  <span className="block text-xs text-suave">{horaLima(l.creado)}</span>
                </td>
                <td>
                  {nombreColegio.get(l.colegioId)}
                  <span className="block text-xs text-suave">
                    {l.items.length} productos{l.nota ? ` · ${l.nota}` : ""}
                  </span>
                </td>
                <td className="text-right tabular-nums">
                  {numero(enviadas)}
                  {l.porRecibir === 0 && llegaron !== enviadas && (
                    <span className="block text-xs text-[#8a5a00]">llegaron {numero(llegaron)}</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{soles(l.items.reduce((a, e) => a + costo(e), 0))}</td>
                <td>
                  <span className={`chip ${est.clase}`}>{est.texto}</span>
                  {obs.length > 0 && (
                    <span className="mt-1 block text-xs text-[#8a5a00]">
                      {obs.length === 1 ? `${obs[0].motivo ?? "Observación"}` : `${obs.length} productos con observación`}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        />
      </section>
    </div>
  );
}
