import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth";
import {
  obtenerCategorias,
  obtenerColegios,
  obtenerEnvios,
  obtenerProductosMapa,
  obtenerReposiciones,
  obtenerStock,
  obtenerUsuariosMapa,
  obtenerVentas,
} from "@/lib/data";
import { enEnvases, ENVASES, fechaISOLima, hoyISO, lunesDeSemana, NOMBRE_PRESENTACION } from "@/lib/format";
import { check, db } from "@/lib/supabase";
import { Avisos, Vacio } from "@/components/ui";
import { RegistroPersonal } from "./registro";

export const metadata: Metadata = { title: "Registro del cafetín" };

export default async function PaginaPersonal({ searchParams }: PageProps<"/personal">) {
  // Lo que no depende del usuario se pide a la vez que se revisa la sesión
  const precarga = [obtenerColegios(), obtenerProductosMapa(), obtenerUsuariosMapa()] as const;
  for (const p of precarga) p.catch(() => {}); // si la sesión no es válida se redirige
  const sesion = await requerirSesion(["PERSONAL"]);
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
  // Lo contado hoy (del día y semanal): para verlo y corregirlo desde "Vendido hoy"
  const conteos = check(
    await db()
      .from("conteos")
      .select("id, tipo")
      .eq("colegio_id", colegio.id)
      .or(`and(tipo.eq.DIA,fecha.eq.${hoy}),and(tipo.eq.SEMANA,fecha.eq.${lunesDeSemana(hoy)})`),
  ) as { id: number; tipo: "DIA" | "SEMANA" }[];
  const items = conteos.length
    ? (check(
        await db()
          .from("conteo_items")
          .select("conteo_id, producto_colegio_id, habia, quedan, vendido, monto, sobrante, motivo, updated_at")
          .in("conteo_id", conteos.map((c) => c.id)),
      ) as {
        conteo_id: number;
        producto_colegio_id: number;
        habia: number;
        quedan: number;
        vendido: number;
        monto: number;
        sobrante: number;
        motivo: string | null;
        updated_at: string;
      }[])
    : [];
  // Lo "preparado en el cafetín" hoy (se muestra al corregir para poder cambiarlo también)
  const preparadoHoy = new Map<number, number>();
  if (items.length) {
    const prep = check(
      await db()
        .from("movimientos")
        .select("producto_id, cantidad")
        .eq("colegio_id", colegio.id)
        .eq("fecha", hoy)
        .eq("tipo", "INGRESO")
        .eq("observacion", "Preparado en el cafetín"),
    ) as { producto_id: number; cantidad: number }[];
    for (const m of prep) preparadoHoy.set(m.producto_id, (preparadoHoy.get(m.producto_id) ?? 0) + m.cantidad);
  }
  const productoDePc = new Map(stock.map((s) => [s.id, s.producto_id]));
  const tipoConteo = new Map(conteos.map((c) => [c.id, c.tipo]));
  const contadosHoy = items
    // Del semanal, solo lo que se contó hoy
    .filter((i) => tipoConteo.get(i.conteo_id) === "DIA" || fechaISOLima(i.updated_at) === hoy)
    .map((i) => ({
      id: i.producto_colegio_id,
      habia: i.habia,
      quedan: i.quedan,
      vendido: i.vendido,
      monto: Number(i.monto),
      sobrante: i.sobrante,
      motivo: i.motivo,
      preparado: preparadoHoy.get(productoDePc.get(i.producto_colegio_id) ?? 0) ?? 0,
      hora: i.updated_at,
    }));

  // Precio normal (productos en descuento) y si ya entró en el inventario de arranque
  const extras = check(
    await db().from("producto_colegio").select("id, precio_normal, arranque_at").eq("colegio_id", colegio.id),
  ) as { id: number; precio_normal: number | null; arranque_at: string | null }[];
  const precioNormal = new Map(extras.filter((f) => f.precio_normal != null).map((f) => [f.id, Number(f.precio_normal)]));
  const arranque = new Map(extras.map((f) => [f.id, f.arranque_at]));
  const categorias = await obtenerCategorias();

  const presentacion = new Map(stock.map((s) => [s.id, s.presentacion]));
  /** "2 cajas de 24 + 5 sueltas" */
  const comoViene = (cajas: number, porCaja: number | null, sueltas: number, pcId: number) => {
    if (cajas <= 0) return null;
    const nombre = (NOMBRE_PRESENTACION[presentacion.get(pcId) ?? "CAJA"] ?? "Caja").toLowerCase();
    return `${cajas} ${cajas === 1 ? nombre : `${nombre}s`} de ${porCaja}${sueltas > 0 ? ` + ${sueltas} sueltas` : ""}`;
  };

  /** Envío de cocina en balde o taper: "1½ baldes de 30 vasos" */
  const filaStock = new Map(stock.map((s) => [s.id, s]));
  const enBalde = (vasos: number, pcId: number) => {
    const s = filaStock.get(pcId);
    const e = s ? ENVASES[s.presentacion] : undefined;
    if (!s || !e) return null;
    if (s.presentacion === "LITRO") return enEnvases(vasos, s.unidades_por_presentacion, s.presentacion);
    return `${enEnvases(vasos, s.unidades_por_presentacion, s.presentacion)} de ${s.unidades_por_presentacion} ${e.partes}`;
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
          // Del día que prepara el mismo personal (no lo manda cocina): al contar dice cuánto preparó
          deCocina: productosMapa.get(s.producto_id)?.de_cocina !== false,
          stockMinimo: s.stock_minimo,
          categoria: s.categoria ?? "Otros",
          ultimoConteo: s.ultimo_conteo,
          precio: Number(s.precio_venta),
          precioNormal: precioNormal.get(s.id) ?? null,
          acompanante: productosMapa.get(s.producto_id)?.acompanante === true,
          arranqueAt: arranque.get(s.id) ?? null,
        }))}
        contadosHoy={contadosHoy}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        ventasHoy={ventasHoy.map((v) => ({ productoId: v.producto_id, unidades: v.unidades, monto: Number(v.monto) }))}
        porRecibir={[...envios].reverse().map((e) => ({
          id: e.id,
          lote: e.lote,
          origen: e.origen,
          producto: productosMapa.get(e.producto_id)?.nombre ?? "Producto",
          cantidad: e.cantidad_enviada,
          detalle:
            e.origen === "LOGISTICA"
              ? comoViene(e.cajas, e.unidades_por_caja, e.unidades_sueltas, e.producto_colegio_id)
              : enBalde(e.cantidad_enviada, e.producto_colegio_id),
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
