import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import {
  obtenerColegios,
  obtenerEnvios,
  obtenerProductosMapa,
  obtenerReposiciones,
  obtenerStock,
  obtenerUsuariosMapa,
  obtenerVentas,
} from "@/lib/data";
import { hoyISO, NOMBRE_PRESENTACION } from "@/lib/format";
import { Avisos, Vacio } from "@/components/ui";
import { RegistroPersonal } from "./registro";

export const metadata: Metadata = { title: "Registro del cafetín" };

export default async function PaginaPersonal({ searchParams }: PageProps<"/personal">) {
  // Lo que no depende del usuario se pide a la vez que se revisa la sesión
  const precarga = [obtenerColegios(), obtenerProductosMapa(), obtenerUsuariosMapa()] as const;
  for (const p of precarga) p.catch(() => {}); // si la sesión no es válida se redirige
  const sesion = await requerirSesion(["PERSONAL", "ADMIN"]);
  const sp = await searchParams;
  const colegios = await precarga[0];

  // El personal ve solo su colegio; administración/logística pueden elegir
  let colegioId: number | null = sesion.colegioId;
  if (sesion.rol !== "PERSONAL") {
    const pedido = Number(sp.colegio);
    colegioId = colegios.some((c) => c.id === pedido) ? pedido : (colegios[0]?.id ?? null);
  }
  const colegio = colegios.find((c) => c.id === colegioId);

  if (!colegio) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Vacio titulo="Tu usuario no tiene un colegio activo asignado" texto="Pide a la administración que lo revise." />
      </main>
    );
  }

  const hoy = hoyISO();
  const [stock, ventasHoy, envios, reposiciones, productosMapa, usuarios] = await Promise.all([
    obtenerStock({ colegioId: colegio.id }),
    obtenerVentas(hoy, hoy, colegio.id),
    obtenerEnvios({ colegioId: colegio.id, estado: "PENDIENTE" }),
    obtenerReposiciones({ colegioId: colegio.id, limite: 100 }),
    obtenerProductosMapa(),
    obtenerUsuariosMapa(),
  ]);
  const presentacion = new Map(stock.map((s) => [s.id, s.presentacion]));
  /** "2 cajas de 24 + 5 sueltas" */
  const comoViene = (cajas: number, porCaja: number | null, sueltas: number, pcId: number) => {
    if (cajas <= 0) return null;
    const nombre = (NOMBRE_PRESENTACION[presentacion.get(pcId) ?? "CAJA"] ?? "Caja").toLowerCase();
    return `${cajas} ${cajas === 1 ? nombre : `${nombre}s`} de ${porCaja}${sueltas > 0 ? ` + ${sueltas} sueltas` : ""}`;
  };

  return (
    <>
      <Avisos />
      <RegistroPersonal
        key={colegio.id}
        hoy={hoy}
        nombreUsuario={sesion.nombre}
        colegio={{ id: colegio.id, nombre: colegio.nombre }}
        colegios={sesion.rol === "PERSONAL" ? [] : colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
        esPersonal={sesion.rol === "PERSONAL"}
        productos={stock.map((s) => ({
          id: s.id,
          productoId: s.producto_id,
          nombre: s.producto,
          presentacion: s.presentacion,
          unidadesPorPresentacion: s.unidades_por_presentacion,
          stock: s.total_unidades,
          perecible: s.perecible,
          stockMinimo: s.stock_minimo,
          categoria: s.categoria ?? "Otros",
          ultimoConteo: s.ultimo_conteo,
          precio: Number(s.precio_venta),
        }))}
        ventasHoy={ventasHoy.map((v) => ({ productoId: v.producto_id, unidades: v.unidades, monto: Number(v.monto) }))}
        porRecibir={[...envios].reverse().map((e) => ({
          id: e.id,
          lote: e.lote,
          origen: e.origen,
          producto: productosMapa.get(e.producto_id)?.nombre ?? "Producto",
          cantidad: e.cantidad_enviada,
          detalle: e.origen === "LOGISTICA" ? comoViene(e.cajas, e.unidades_por_caja, e.unidades_sueltas, e.producto_colegio_id) : null,
          hora: e.created_at,
          enviadoPor: e.enviado_por ? (usuarios.get(e.enviado_por)?.nombre ?? null) : null,
          nota: e.observacion,
        }))}
        reposiciones={reposiciones.map((r) => ({
          id: r.id,
          codigo: r.codigo,
          estado: r.estado,
          fecha: r.created_at,
          nota: r.nota,
          motivoRechazo: r.motivo_rechazo,
          items: r.items.map((i) => ({
            id: i.id,
            nombre: i.nombre,
            productoId: i.producto_id,
            enCatalogo: i.producto_id != null,
            cantidad: i.cantidad,
            unidad: i.unidad,
            quitado: i.quitado,
            cantidadAprobada: i.cantidad_aprobada,
          })),
        }))}
      />
    </>
  );
}
