import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, ChevronRight, Truck } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { claveDe, leerConfiguracion } from "@/lib/ia";
import {
  obtenerCategorias,
  obtenerColegios,
  obtenerEnvios,
  obtenerStock,
  obtenerUsuariosMapa,
} from "@/lib/data";
import { fechaCorta, horaLima, mesActual, numero, rangoMes, soles } from "@/lib/format";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";
import { TablaPaginada } from "@/components/paginacion";
import { FormularioEntrega } from "./formulario";
import { agruparLotes, estadoLote, type Lote } from "@/lib/entregas";

export const metadata: Metadata = { title: "Entregas" };
// Leer una boleta con la IA puede tardar (las Server Actions de esta página usan este límite)
export const maxDuration = 120;

export default async function PaginaIngresos({ searchParams }: PageProps<"/ingresos">) {
  const sesion = await requerirSesion(ROLES_PANEL);
  const sp = await searchParams;
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual();
  const { desde, hasta } = rangoMes(mes);
  // ?obs=1: solo lo que llegó con observación (incompleto o dañado)
  const soloObs = sp.obs === "1";

  const [colegios, stock, usuarios, envios, categorias, confIA] = await Promise.all([
    obtenerColegios(),
    obtenerStock(),
    obtenerUsuariosMapa(),
    obtenerEnvios({ desde, hasta }),
    obtenerCategorias(),
    leerConfiguracion().catch(() => new Map<string, string>()),
  ]);
  const filaStock = new Map(stock.map((s) => [s.id, s]));
  /** Costo de lo entregado: con el costo de la entrega, o el del producto si no se indicó */
  const costoEnvio = (e: (typeof envios)[number]) => {
    const s = filaStock.get(e.producto_colegio_id);
    const porCaja = e.unidades_por_caja ?? s?.unidades_por_presentacion ?? 1;
    const costo = e.costo_presentacion != null ? Number(e.costo_presentacion) : Number(s?.costo_presentacion ?? 0);
    return (e.cantidad_enviada * costo) / porCaja;
  };
  const lotes = agruparLotes(envios);
  const todasEntregas = lotes.filter((l) => l.origen === "LOGISTICA");
  const todoCocina = lotes.filter((l) => l.origen === "COCINA");
  const observadas = (ls: Lote[]) => ls.filter((l) => l.observados > 0);
  const entregas = soloObs ? observadas(todasEntregas) : todasEntregas;
  const deCocina = soloObs ? observadas(todoCocina) : todoCocina;
  // Logística solo ve su historial (las entregas); los envíos de cocina los ve administración
  const verCocina = sesion.rol === "ADMIN";
  const totalObs = observadas(todasEntregas).length + (verCocina ? observadas(todoCocina).length : 0);
  const enlaceObs = (activo: boolean) => `/ingresos?mes=${mes}${activo ? "&obs=1" : ""}`;
  const nombreColegio = new Map(colegios.map((c) => [c.id, c.nombre]));
  const totalMes = todasEntregas.reduce((a, l) => a + l.items.reduce((b, e) => b + costoEnvio(e), 0), 0);
  const porRecibir = todasEntregas.filter((l) => l.porRecibir > 0).length;

  /** Una fila = una entrega (o un envío de cocina); clic = sus productos */
  const fila = (l: Lote) => {
    const est = estadoLote(l);
    const unidades = l.items.reduce((a, e) => a + e.cantidad_enviada, 0);
    const llegaron = l.items.reduce((a, e) => a + (e.cantidad_recibida ?? 0), 0);
    const recibidas = l.items.every((e) => e.cantidad_recibida != null);
    return (
      <tr key={l.clave}>
        <td className="whitespace-nowrap">
          <Link href={`/ingresos/${l.clave}`} className="font-medium text-verde-700 hover:underline">
            {fechaCorta(l.fecha)}
          </Link>
          <span className="block text-xs text-suave">{horaLima(l.creado)}</span>
        </td>
        <td>
          <p className="font-medium">{nombreColegio.get(l.colegioId)}</p>
          <p className="text-xs text-suave">
            {l.items.length} producto{l.items.length === 1 ? "" : "s"}
            {l.enviadoPor ? ` · ${usuarios.get(l.enviadoPor)?.nombre}` : ""}
          </p>
          {l.nota && (
            <p className="max-w-md truncate text-xs text-suave" title={l.nota}>
              {l.nota}
            </p>
          )}
        </td>
        <td className="text-right tabular-nums">
          {numero(unidades)}
          {recibidas && llegaron !== unidades && <span className="block text-xs text-[#8a5a00]">llegaron {numero(llegaron)}</span>}
        </td>
        {l.origen === "LOGISTICA" && (
          <td className="text-right tabular-nums">{soles(l.items.reduce((a, e) => a + costoEnvio(e), 0))}</td>
        )}
        <td>
          <span className={`chip ${est.clase}`}>{est.texto}</span>
        </td>
        <td className="w-8">
          <Link href={`/ingresos/${l.clave}`} className="text-suave hover:text-tinta" aria-label="Ver productos">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </td>
      </tr>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Entregas a colegios"
        descripcion={
          sesion.rol === "LOGISTICA"
            ? "Registra la mercadería que llevas a cada cafetín. El stock sube cuando el personal del colegio la recibe."
            : "La mercadería que logística llevó a cada cafetín y lo que envió la cocina. El stock sube cuando el colegio la recibe."
        }
      />

      <div className="grid gap-6">
        {/* Solo logística registra entregas; administración ve directo el historial */}
        {sesion.rol === "LOGISTICA" && (
        <div>
          <FormularioEntrega
            categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
            iaConectada={!!claveDe(confIA, "GEMINI").clave}
            esAdmin={ROLES_PANEL.includes(sesion.rol)}
            colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
            colegioInicial={colegios[0]?.id ?? 0}
            stock={stock.map((s) => ({
              id: s.id,
              colegioId: s.colegio_id,
              producto: s.producto,
              presentacion: s.presentacion,
              unidadesPorPresentacion: s.unidades_por_presentacion,
              costo: Number(s.costo_presentacion),
              total: s.total_unidades,
              minimo: s.stock_minimo,
            }))}
          />
        </div>
        )}

        {/* Ver todo o solo lo que llegó con observación */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={enlaceObs(false)} className={`chip px-3 py-1.5 ${!soloObs ? "bg-panel text-white" : "bg-white text-suave ring-1 ring-borde"}`}>
            Todo
          </Link>
          <Link href={enlaceObs(true)} className={`chip px-3 py-1.5 ${soloObs ? "bg-[#8a5a00] text-white" : "chip-atencion"}`}>
            Con observación ({totalObs})
          </Link>
          {soloObs && <span className="text-xs text-suave">Solo lo que llegó incompleto o dañado. Toca una fila para ver el motivo.</span>}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-medium">
                <Truck className="h-4 w-4 text-suave" /> Entregas del mes
              </h2>
              <p className="text-xs text-suave">
                {todasEntregas.length} entrega{todasEntregas.length === 1 ? "" : "s"} · costo {soles(totalMes)}
                {porRecibir > 0 ? ` · ${porRecibir} por recibir` : ""}
                {observadas(todasEntregas).length > 0 ? ` · ${observadas(todasEntregas).length} con observación` : ""}
              </p>
            </div>
            <form className="flex items-center gap-2">
              <input type="month" name="mes" defaultValue={mes} className="input w-auto py-1.5" />
              {soloObs && <input type="hidden" name="obs" value="1" />}
              <button className="btn-secundario py-1.5">Ver</button>
            </form>
          </div>
          {entregas.length === 0 ? (
            <Vacio
              icono={<Truck className="h-6 w-6" />}
              titulo={soloObs ? "Ninguna entrega con observación este mes" : "Sin entregas este mes"}
              texto={
                soloObs
                  ? "Todo lo que llegó a los colegios llegó completo y en buen estado."
                  : sesion.rol === "LOGISTICA"
                    ? "Registra la primera arriba: elige el colegio y los productos, o usa «Llenar con IA» con la foto de la boleta."
                    : "Cuando logística registre una entrega, aparece aquí con su estado."
              }
            />
          ) : (
            <TablaPaginada
              etiqueta="entregas"
              cabecera={
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Colegio</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Costo</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
              }
              filas={entregas.map(fila)}
            />
          )}
        </div>
      </div>

      {/* Envíos de cocina (productos del día), uno por envío. Solo administración. */}
      {verCocina && (
      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-borde px-5 py-4">
          <h2 className="flex items-center gap-2 font-medium">
            <ChefHat className="h-4 w-4 text-suave" /> Envíos de cocina del mes
          </h2>
          <p className="text-xs text-suave">
            {todoCocina.length} envío{todoCocina.length === 1 ? "" : "s"}
            {observadas(todoCocina).length > 0 ? ` · ${observadas(todoCocina).length} con observación` : " · sin diferencias"}
          </p>
        </div>
        {deCocina.length === 0 ? (
          <Vacio
            icono={<ChefHat className="h-6 w-6" />}
            titulo={soloObs ? "Ningún envío de cocina con observación este mes" : "Sin envíos de cocina este mes"}
            texto={soloObs ? undefined : "Lo que la cocina mande desde su panel aparece aquí, con lo que recibió cada colegio."}
          />
        ) : (
          <TablaPaginada
            etiqueta="envíos"
            cabecera={
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Colegio</th>
                  <th className="text-right">Unidades</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
            }
            filas={deCocina.map(fila)}
          />
        )}
      </div>
      )}
    </div>
  );
}
