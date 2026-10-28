import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, AlertTriangle, ArrowRight, Minus } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { check, db } from "@/lib/supabase";
import {
  colegioSeleccionado,
  obtenerActividadDia,
  obtenerConteos,
  obtenerCategorias,
  obtenerEnvios,
  obtenerMovimientos,
  obtenerOtrosGastos,
  obtenerReposiciones,
  obtenerColegios,
  obtenerProductosMapa,
  obtenerStock,
  obtenerVentas,
} from "@/lib/data";
import {
  fechaCorta,
  fechaISOLima,
  hoyISO,
  horaLima,
  mesAnterior,
  nombreMes,
  numero,
  pct,
  rangoMes,
  soles,
} from "@/lib/format";
import { Inicial } from "@/components/ui";
import { asegurarReportesCerrados } from "@/lib/reporte-mensual";
import { ListaPaginada, TablaPaginada } from "@/components/paginacion";
import { MiniTendencia, Medidor } from "@/components/minigrafico";
import { GraficoAcumulado, GraficoDiario, GRIS_CONTEXTO, Leyenda } from "./grafico";
import { InicioLogistica } from "./logistica";
import { ParaHoy, type Tarea } from "@/components/para-hoy";
import { SelectorColegio } from "../selector-colegio";
import { agruparLotes } from "@/lib/entregas";

export const metadata: Metadata = { title: "Inicio" };

// Un color fijo por colegio (sigue al colegio, no a su posición en el ranking).
// Paleta validada con el script de dataviz (daltonismo, contraste). Del 5.º colegio en adelante: "Otros".
const COLORES_COLEGIO = ["#2f9c3d", "#2a78d6", "#eb6834", "#4a3aa7"];
const ACENTO = COLORES_COLEGIO[0];

export default async function Dashboard() {
  const sesion = await requerirSesion(ROLES_PANEL);
  // El día 1, la primera visita genera y guarda el reporte del mes que cerró.
  // Se hace después de mostrar la página, para no hacer esperar el Inicio.
  after(() => asegurarReportesCerrados().catch((e) => console.error("Reporte mensual:", e)));
  const colegioId = await colegioSeleccionado();
  // Logística tiene su propio Inicio: comprar, entregar y revisar (sin ventas ni ganancias)
  if (sesion.rol === "LOGISTICA") return <InicioLogistica sesion={sesion} colegioId={colegioId} />;
  const hoy = hoyISO();
  const mes = hoy.slice(0, 7);
  const mesPrev = mesAnterior(mes);
  const rMes = rangoMes(mes);
  const rPrev = rangoMes(mesPrev);
  const diaHoy = Number(hoy.slice(8, 10));
  const diaDe = (fecha: string) => Number(fecha.slice(8, 10));

  const [
    colegiosTodos,
    stockTodo,
    ventasMes,
    ventasPrev,
    actividad,
    productos,
    categorias,
    conteosHoy,
    mermasMes,
    porRecibirTodo,
    reposiciones,
    gastosMes,
    arranques,
    cajasHoy,
    movimientosHoy,
    observadosSemana,
  ] = await Promise.all([
    obtenerColegios(),
    obtenerStock({ colegioId }),
    obtenerVentas(rMes.desde, hoy, colegioId),
    obtenerVentas(rPrev.desde, rPrev.hasta, colegioId),
    obtenerActividadDia(hoy),
    obtenerProductosMapa(),
    obtenerCategorias(),
    // si aún no se ejecutó la migración 11, simplemente no hay enlace
    obtenerConteos({ tipo: "DIA", desde: hoy, hasta: hoy }).catch(() => []),
    obtenerMovimientos({ tipo: "MERMA", desde: rMes.desde, hasta: hoy, colegioId, limite: 5000 }),
    obtenerEnvios({ estado: "PENDIENTE", colegioId }),
    obtenerReposiciones({ colegioId, limite: 200 }),
    obtenerOtrosGastos(rMes.desde, hoy, colegioId),
    // Inventario de arranque: qué productos ya registró cada colegio y cuándo
    db().from("producto_colegio").select("colegio_id, arranque_at").not("arranque_at", "is", null).then(check) as Promise<
      { colegio_id: number; arranque_at: string }[]
    >,
    // Caja de hoy de cada colegio
    db().from("cierres_dia").select("colegio_id, total_ventas, monto_fisico, motivo").eq("fecha", hoy).then(check) as Promise<
      { colegio_id: number; total_ventas: number; monto_fisico: number | null; motivo: string | null }[]
    >,
    // Ajustes de cantidad que hizo hoy el personal (no son venta)
    obtenerMovimientos({ desde: hoy, hasta: hoy, colegioId, limite: 500 }),
    // Lo que llegó a un colegio incompleto o dañado en los últimos 7 días
    obtenerEnvios({ estado: "OBSERVADO", desde: new Date(Date.parse(hoy) - 7 * 86400000).toISOString().slice(0, 10), hasta: hoy, colegioId }),
  ]);
  const colegios = colegioId ? colegiosTodos.filter((c) => c.id === colegioId) : colegiosTodos;
  // Los acompañantes (salsas) no se venden ni llevan stock: fuera de indicadores, avance y "por reponer"
  const stock = stockTodo.filter((s) => !productos.get(s.producto_id)?.acompanante);
  const nombreColegio = new Map(colegiosTodos.map((c) => [c.id, c.nombre]));
  const corto = (n: string) => n.replace(/^Colegio\s+/i, "");
  const suma = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + Number(f(x) || 0), 0);

  // ---------------- Indicadores ----------------
  const ventasHoy = suma(
    ventasMes.filter((v) => v.fecha === hoy),
    (v) => v.monto,
  );
  const totalMes = suma(ventasMes, (v) => v.monto);
  // Lo que sobró de los productos del día se pierde: se descuenta a costo
  const costoSobrante = suma(mermasMes, (m) => Number(m.cantidad) * Number(m.costo_unitario));
  const unidadesSobrante = suma(mermasMes, (m) => m.cantidad);
  // Y lo comprado fuera del catálogo (descartables, utensilios…) que anotó logística
  const otrosGastos = suma(gastosMes, (g) => g.costo);
  const gananciaMes = suma(ventasMes, (v) => v.ganancia) - costoSobrante - otrosGastos;
  const prevMismoPeriodo = suma(
    ventasPrev.filter((v) => diaDe(v.fecha) <= diaHoy),
    (v) => v.monto,
  );
  const variacion = prevMismoPeriodo > 0 ? ((totalMes - prevMismoPeriodo) / prevMismoPeriodo) * 100 : null;
  const margen = totalMes > 0 ? (gananciaMes / totalMes) * 100 : null;
  const valorStock = suma(stock, (s) => s.valor_venta_stock);
  const costoStock = suma(stock, (s) => s.valor_costo_stock);
  // Por reponer: solo semanales (los del día los manda cocina cada mañana y siempre terminan en 0)
  const semanales = stock.filter((s) => !s.perecible);
  const bajos = semanales.filter((s) => s.stock_bajo).sort((a, b) => a.total_unidades - b.total_unidades);
  const agotados = bajos.filter((s) => s.total_unidades === 0).length;
  const conRegistro = colegios.filter((c) => actividad.has(c.id)).length;
  // Conteo del día: productos del día contados hoy (cada "Guardar" del personal cuenta)
  const conteoHoy = new Map(conteosHoy.map((x) => [x.colegio_id, x.id]));
  const avanceDelDia = (colegioIdDe: number) => {
    // Flexible: lo que no llegó hoy (stock 0 y sin contar) no cuenta como pendiente
    const contadoHoy = (s: (typeof stock)[number]) => !!s.ultimo_conteo && fechaISOLima(s.ultimo_conteo) === hoy;
    // Lo de "Del día" del personal: lo que manda la cocina, lo que prepara el personal y lo que se retira al cierre
    const deDia = (s: (typeof stock)[number]) => {
      const p = productos.get(s.producto_id);
      return s.perecible || !!p?.de_cocina || !!p?.prepara_personal;
    };
    const delDia = stock.filter((s) => s.colegio_id === colegioIdDe && deDia(s) && (s.total_unidades > 0 || contadoHoy(s)));
    const contados = delDia.filter(contadoHoy).length;
    return { contados, total: delDia.length };
  };
  // Los que se guardan se cuentan cuando quieran: solo se muestra cuántos se contaron hoy
  const otrosContadosHoy = (cid: number) =>
    semanales.filter((s) => s.colegio_id === cid && !!s.ultimo_conteo && fechaISOLima(s.ultimo_conteo) === hoy).length;
  const porRecibirDe = (cid: number) => {
    const p = porRecibirTodo.filter((e) => e.colegio_id === cid);
    return { cocina: p.filter((e) => e.origen === "COCINA").length, logistica: p.filter((e) => e.origen === "LOGISTICA").length };
  };

  const pedidoEnCurso = new Map<string, string>();
  for (const r of reposiciones) {
    if (r.estado !== "POR_APROBAR" && r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") continue;
    for (const i of r.items)
      if (i.producto_id != null && !i.quitado) pedidoEnCurso.set(`${r.colegio_id}-${i.producto_id}`, r.codigo);
  }

  // Ventas por día del mes actual (total)
  const porDia = Array.from({ length: rMes.dias }, () => 0);
  for (const v of ventasMes) porDia[diaDe(v.fecha) - 1] += Number(v.monto);
  const tendencia = porDia.slice(0, diaHoy);

  // ---------------- ¿Qué días vendemos más? (columnas por colegio) ----------------
  const indiceColegio = new Map(colegiosTodos.map((c, i) => [c.id, i]));
  const claveSerie = (cid: number) => {
    const i = indiceColegio.get(cid) ?? 99;
    return i < COLORES_COLEGIO.length ? `c${cid}` : "otros";
  };
  const series = colegioId
    ? [{ clave: `c${colegioId}`, nombre: corto(nombreColegio.get(colegioId) ?? ""), color: ACENTO }]
    : [
        ...colegiosTodos.slice(0, COLORES_COLEGIO.length).map((c, i) => ({
          clave: `c${c.id}`,
          nombre: corto(c.nombre),
          color: COLORES_COLEGIO[i],
        })),
        ...(colegiosTodos.length > COLORES_COLEGIO.length
          ? [{ clave: "otros", nombre: "Otros colegios", color: GRIS_CONTEXTO }]
          : []),
      ];
  const datosDiarios = Array.from({ length: rMes.dias }, (_, i) => {
    const fila: { dia: number } & Record<string, number> = { dia: i + 1 } as { dia: number } & Record<string, number>;
    for (const s of series) fila[s.clave] = 0;
    return fila;
  });
  for (const v of ventasMes) {
    const k = colegioId ? `c${colegioId}` : claveSerie(v.colegio_id);
    datosDiarios[diaDe(v.fecha) - 1][k] += Math.round(Number(v.monto) * 100) / 100;
  }

  // ---------------- ¿Vamos mejor que el mes pasado? (acumulado) ----------------
  const acumular = (arr: number[]) => {
    let s = 0;
    return arr.map((v) => (s += v));
  };
  const prevPorDia = Array.from({ length: rPrev.dias }, () => 0);
  for (const v of ventasPrev) prevPorDia[diaDe(v.fecha) - 1] += Number(v.monto);
  const acumActual = acumular(porDia);
  const acumPrev = acumular(prevPorDia);
  const hayMesPrevio = ventasPrev.length > 0;
  const datosAcumulado = Array.from({ length: Math.max(rMes.dias, rPrev.dias) }, (_, i) => ({
    dia: i + 1,
    actual: i < diaHoy && i < rMes.dias ? Math.round(acumActual[i] * 100) / 100 : null,
    anterior: hayMesPrevio && i < rPrev.dias ? Math.round(acumPrev[i] * 100) / 100 : null,
  }));

  // ---------------- ¿Qué categoría vende más? ----------------
  const catDe = (productoId: number) =>
    categorias.find((c) => c.id === productos.get(productoId)?.categoria_id)?.nombre ?? "Otros";
  const porCategoria = new Map<string, number>();
  for (const v of ventasMes)
    porCategoria.set(catDe(v.producto_id), (porCategoria.get(catDe(v.producto_id)) ?? 0) + Number(v.monto));
  const categoriasOrden = [...porCategoria.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
  const maxCategoria = categoriasOrden[0]?.[1] ?? 0;

  // ---------------- Más vendidos ----------------
  const agrupado = new Map<
    string,
    { colegio_id: number; producto_id: number; unidades: number; monto: number; ganancia: number }
  >();
  for (const v of ventasMes) {
    const k = `${v.colegio_id}-${v.producto_id}`;
    const a = agrupado.get(k) ?? { colegio_id: v.colegio_id, producto_id: v.producto_id, unidades: 0, monto: 0, ganancia: 0 };
    a.unidades += Number(v.unidades);
    a.monto += Number(v.monto);
    a.ganancia += Number(v.ganancia);
    agrupado.set(k, a);
  }
  const top = [...agrupado.values()].filter((a) => a.unidades > 0).sort((a, b) => b.monto - a.monto);
  const maxTop = top[0]?.monto ?? 0;
  const stockDe = (c: number, p: number) => stock.find((s) => s.colegio_id === c && s.producto_id === p);

  // ---------------- Para hoy: lo que le toca a administración ----------------
  const tareas: Tarea[] = [];
  for (const l of agruparLotes(observadosSemana)) {
    tareas.push({
      texto: `${l.origen === "COCINA" ? "Envío de cocina" : "Entrega"} del ${fechaCorta(l.fecha)} llegó con observación a ${corto(nombreColegio.get(l.colegioId) ?? "")}`,
      detalle: `${l.observados} producto${l.observados === 1 ? "" : "s"} con diferencia (faltó, llegó de más o dañado)`,
      href: `/ingresos/${l.clave}`,
      accion: "Ver",
      tono: "critico",
    });
  }
  // Conteo del día: recién se pide desde la 1 p. m. (en la mañana todavía están vendiendo)
  const horaAhora = Number(new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "numeric", hour12: false }).format(new Date()));
  if (horaAhora >= 13) {
    for (const c of colegios) {
      const a = avanceDelDia(c.id);
      if (a.total > 0 && a.contados < a.total) {
        tareas.push({
          texto: `${corto(c.nombre)} aún no termina su conteo de hoy`,
          detalle: `${a.contados} de ${a.total} productos del día contados`,
          href: "/conteos?tipo=dia",
          accion: "Ver",
          tono: "atencion",
        });
      }
    }
  }
  // Productos que creó el personal (inventario de arranque): falta costo y cómo se compra
  const porCompletar = [...productos.values()].filter((p) => p.por_revisar && p.activo);
  if (porCompletar.length) {
    tareas.push({
      texto: `${porCompletar.length} producto${porCompletar.length === 1 ? "" : "s"} nuevo${porCompletar.length === 1 ? "" : "s"} del personal por completar`,
      detalle: `Pon el costo y cómo se compra: ${porCompletar
        .slice(0, 4)
        .map((p) => p.nombre)
        .join(", ")}`,
      href: "/productos",
      accion: "Completar",
      tono: "atencion",
    });
  }
  // Inventario de arranque registrado hoy (por colegio)
  const arranqueHoy = new Map<number, number>();
  for (const a of arranques) if (fechaISOLima(a.arranque_at) === hoy) arranqueHoy.set(a.colegio_id, (arranqueHoy.get(a.colegio_id) ?? 0) + 1);
  for (const [cid, n] of arranqueHoy) {
    if (colegioId && cid !== colegioId) continue;
    tareas.push({
      texto: `${corto(nombreColegio.get(cid) ?? "")} registró ${n} producto${n === 1 ? "" : "s"} en su inventario de arranque hoy`,
      detalle: "Lo que tienen en su almacén (no es venta)",
      href: "/movimientos?tipo=personal",
      accion: "Ver",
      tono: "info",
    });
  }
  // Caja de hoy que no cuadra
  for (const cj of cajasHoy) {
    if (cj.monto_fisico == null || (colegioId && cj.colegio_id !== colegioId)) continue;
    const dif = Math.round((Number(cj.monto_fisico) - Number(cj.total_ventas)) * 100) / 100;
    if (dif === 0) continue;
    tareas.push({
      texto: `Caja de ${corto(nombreColegio.get(cj.colegio_id) ?? "")}: ${dif > 0 ? "sobran" : "faltan"} ${soles(Math.abs(dif))}`,
      detalle: cj.motivo ? `Motivo: ${cj.motivo}` : "Sin motivo",
      href: `/conteos?colegio=${cj.colegio_id}`,
      accion: "Ver",
      tono: "atencion",
    });
  }
  // Ajustes del personal hoy (por colegio): discreto, en azul
  const ajustesHoy = new Map<number, number>();
  for (const m of movimientosHoy) {
    if (m.observacion?.startsWith("Ajuste del personal: ")) ajustesHoy.set(m.colegio_id, (ajustesHoy.get(m.colegio_id) ?? 0) + 1);
  }
  for (const [cid, n] of ajustesHoy) {
    tareas.push({
      texto: `${corto(nombreColegio.get(cid) ?? "")} hizo ${n} ajuste${n === 1 ? "" : "s"} de cantidad hoy`,
      detalle: "No son ventas: el personal corrigió lo que había, con su motivo",
      href: "/movimientos?tipo=personal",
      accion: "Ver",
      tono: "info",
    });
  }
  const sinPrecio = new Set(stock.filter((s) => s.activo && Number(s.precio_venta) === 0).map((s) => s.producto));
  if (sinPrecio.size) {
    tareas.push({
      texto: `${sinPrecio.size} producto${sinPrecio.size === 1 ? "" : "s"} con precio de venta S/ 0`,
      detalle: [...sinPrecio].slice(0, 4).join(", "),
      href: "/productos",
      accion: "Poner precio",
      tono: "critico",
    });
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <h1 className="text-2xl font-normal tracking-tight">
          Hola de nuevo, <b className="font-semibold">{sesion.nombre}</b>
        </h1>
        <p className="mt-1 text-sm text-suave">
          {colegioId ? nombreColegio.get(colegioId) : "Todos los colegios"} · resumen de {nombreMes(mes)}
        </p>
        </div>
        <SelectorColegio colegios={colegiosTodos.map((c) => ({ id: c.id, nombre: c.nombre }))} colegioId={colegioId} />
      </div>

      <ParaHoy tareas={tareas} />

      {/* ---------- Indicadores: el número es la respuesta ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-suave">Ventas de hoy</p>
          <p className="mt-1 text-xl font-semibold">{soles(ventasHoy)}</p>
          <div className="mt-3">
            <Medidor valor={conRegistro} total={colegios.length} color={ACENTO} />
            <p className="mt-1.5 text-xs text-suave">
              {conRegistro} de {colegios.length} colegio{colegios.length === 1 ? "" : "s"} registraron
            </p>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs text-suave">Ventas del mes</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="text-xl font-semibold">{soles(totalMes)}</p>
            <MiniTendencia valores={tendencia} color={ACENTO} />
          </div>
          {variacion === null ? (
            <p className="mt-2 flex items-center gap-1 text-xs text-suave">
              <Minus className="h-3.5 w-3.5" />
              {ventasPrev.length
                ? `Sin ventas del 1 al ${diaHoy} de ${nombreMes(mesPrev)} para comparar`
                : "Sin datos del mes pasado"}
            </p>
          ) : (
            <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${variacion >= 0 ? "text-verde-700" : "text-rojo"}`}>
              {variacion >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {variacion >= 0 ? "+" : "−"}
              {numero(Math.abs(Math.round(variacion * 10) / 10))}%
              <span className="font-normal text-suave">vs mismos días del mes pasado</span>
            </p>
          )}
        </div>

        <div className="card p-4">
          <p className="text-xs text-suave">Ganancia del mes</p>
          <p className="mt-1 text-xl font-semibold">{soles(gananciaMes)}</p>
          <p className="mt-2 text-xs text-suave">
            Margen <b className="font-medium text-tinta">{pct(margen == null ? null : Math.round(margen * 10) / 10)}</b>
            {costoSobrante > 0 && (
              <>
                {" "}
                · ya descuenta <b className="font-medium text-tinta">{soles(costoSobrante)}</b> de sobrante (
                {numero(unidadesSobrante)} unid.)
                {otrosGastos > 0 && (
                  <>
                    {" "}
                    y <b className="font-medium text-tinta">{soles(otrosGastos)}</b> de otros gastos
                  </>
                )}
              </>
            )}
          </p>
        </div>

        <div className="card p-4">
          <p className="text-xs text-suave">Valor del stock</p>
          <p className="mt-1 text-xl font-semibold">{soles(valorStock)}</p>
          <p className="mt-2 text-xs text-suave">
            A precio de venta · costó <b className="font-medium text-tinta">{soles(costoStock)}</b>
          </p>
        </div>

        <Link href="/stock" className="card block p-4 transition-colors hover:border-ambar/60">
          <p className="text-xs text-suave">Por reponer</p>
          <p className="mt-1 text-xl font-semibold">
            {bajos.length} <span className="text-sm font-normal text-suave">de {semanales.length} semanales</span>
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs text-suave">
            <AlertTriangle className="h-3.5 w-3.5 text-ambar" />
            {agotados} agotado{agotados === 1 ? "" : "s"} · {bajos.length - agotados} bajo el mínimo
          </p>
        </Link>
      </div>

      {/* ---------- ¿Qué días vendemos más? + estado de hoy ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Ventas por día</h2>
              <p className="text-xs text-suave">
                {colegioId ? "Soles vendidos cada día del mes" : "Soles vendidos cada día, por colegio"} · en negrita, hoy · los
                semanales se suman el día de su conteo
              </p>
            </div>
            {series.length > 1 && <Leyenda series={series} />}
          </div>
          <GraficoDiario datos={datosDiarios} series={series} diaHoy={diaHoy} />
          <Link href="/ventas" className="mt-3 inline-flex items-center gap-1 text-xs text-verde-700 hover:underline">
            Ver la tabla día por día <ArrowRight className="h-3 w-3" />
          </Link>
        </section>

        {/* Estado de cada colegio hoy */}
        <section className="card flex flex-col overflow-hidden">
          <div className="border-b border-borde px-5 py-4">
            <h2 className="font-medium">¿Qué falta hoy en cada cafetín?</h2>
            <p className="text-xs text-suave">Conteos y recepciones del personal</p>
          </div>
          <ul className="flex-1 divide-y divide-borde">
            {colegios.map((c) => {
              const avance = avanceDelDia(c.id);
              const recibir = porRecibirDe(c.id);
              const otros = otrosContadosHoy(c.id);
              const completo = avance.total > 0 && avance.contados === avance.total && recibir.cocina + recibir.logistica === 0;
              const ultimo = actividad.get(c.id);
              const monto = suma(
                ventasMes.filter((v) => v.fecha === hoy && v.colegio_id === c.id),
                (v) => v.monto,
              );
              return (
                <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                  {completo ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-verde-600" />
                  ) : ultimo ? (
                    <Clock className="h-5 w-5 shrink-0 text-ambar" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-suave/60" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.nombre}</p>
                    <p className="text-xs text-suave">
                      Del día: {avance.contados} de {avance.total} contados
                      {ultimo ? ` · último ${horaLima(ultimo)}` : ""}
                    </p>
                    {recibir.cocina + recibir.logistica > 0 && (
                      <p className="text-xs text-[#8a5a00]">
                        Por recibir:{" "}
                        {[
                          recibir.cocina ? `${recibir.cocina} de cocina` : "",
                          recibir.logistica ? `${recibir.logistica} de logística` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {otros > 0 && <p className="text-xs text-suave">Los demás: {otros} contados hoy</p>}
                  </div>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">{soles(monto)}</span>
                    {conteoHoy.get(c.id) && (
                      <Link href={`/conteos/${conteoHoy.get(c.id)}`} className="text-xs text-verde-700 hover:underline">
                        Ver conteo
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-borde px-5 py-3">
            <Link href="/conteos?tipo=dia" className="inline-flex items-center gap-1 text-sm text-verde-700 hover:underline">
              Ver conteos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>

      {/* ---------- ¿Vamos mejor que el mes pasado? + ¿Qué categoría vende más? ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">¿Vamos mejor que el mes pasado?</h2>
              <p className="text-xs text-suave">Ventas acumuladas día a día</p>
            </div>
            <Leyenda
              linea
              series={[
                { nombre: nombreMes(mes), color: ACENTO },
                { nombre: hayMesPrevio ? nombreMes(mesPrev) : `${nombreMes(mesPrev)} (sin datos)`, color: GRIS_CONTEXTO },
              ]}
            />
          </div>
          <GraficoAcumulado datos={datosAcumulado} mes={nombreMes(mes)} mesPrevio={nombreMes(mesPrev)} color={ACENTO} />
          <p className="mt-3 text-xs text-suave">
            Al día {diaHoy}: <b className="font-medium text-tinta">{soles(totalMes)}</b>
            {hayMesPrevio &&
              (prevMismoPeriodo > 0 ? (
                <>
                  {" "}
                  frente a <b className="font-medium text-tinta">{soles(prevMismoPeriodo)}</b> el mes pasado
                </>
              ) : (
                ` · ${nombreMes(mesPrev)} no tiene ventas en esos mismos días`
              ))}
          </p>
        </section>

        <section className="card p-5">
          <h2 className="font-medium">¿Qué categoría vende más?</h2>
          <p className="mb-5 text-xs text-suave">Soles vendidos en el mes, de mayor a menor</p>
          {categoriasOrden.length === 0 ? (
            <p className="py-10 text-center text-sm text-suave">Aún no hay ventas este mes.</p>
          ) : (
            <ul className="space-y-3.5">
              {categoriasOrden.map(([nombre, monto]) => (
                <li key={nombre} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate text-suave">{nombre}</span>
                  <span className="h-5" title={`${nombre}: ${soles(monto)}`}>
                    <span
                      className="block h-full rounded-r-[4px]"
                      style={{ width: `${Math.max(1, (monto / maxCategoria) * 100)}%`, background: ACENTO }}
                    />
                  </span>
                  <span className="text-right font-medium tabular-nums">
                    {soles(monto)}
                    <span className="ml-1.5 text-xs font-normal text-suave">
                      {pct(Math.round((monto / totalMes) * 1000) / 10)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- ¿Qué productos venden más? + ¿Qué hay que reponer? ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <div>
              <h2 className="font-medium">Productos más vendidos del mes</h2>
              <p className="text-xs text-suave">Ordenados por soles vendidos</p>
            </div>
            <Link href="/stock" className="text-sm text-verde-700 hover:underline">
              Ver stock
            </Link>
          </div>
          {top.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-suave">Aún no hay ventas este mes.</p>
          ) : (
            <TablaPaginada
              etiqueta="productos"
              cabecera={
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="w-[34%]">Ventas</th>
                    <th className="text-right">Unidades</th>
                    <th className="text-right">Ganancia</th>
                    <th className="text-right">En stock</th>
                  </tr>
                </thead>
              }
              filas={top.map((t) => {
                const s = stockDe(t.colegio_id, t.producto_id);
                const nombre = productos.get(t.producto_id)?.nombre ?? "?";
                return (
                  <tr key={`${t.colegio_id}-${t.producto_id}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Inicial nombre={nombre} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{nombre}</p>
                          <p className="text-xs text-suave">{nombreColegio.get(t.colegio_id)}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-2 flex-1">
                          <span
                            className="block h-full rounded-r-[4px]"
                            style={{ width: `${Math.max(2, (t.monto / maxTop) * 100)}%`, background: ACENTO }}
                          />
                        </span>
                        <span className="w-20 text-right font-medium tabular-nums">{soles(t.monto)}</span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{numero(t.unidades)}</td>
                    <td className="text-right tabular-nums">{soles(t.ganancia)}</td>
                    <td className="text-right tabular-nums">
                      {s?.perecible ? <span className="text-xs text-suave">del día</span> : s ? numero(s.total_unidades) : "—"}
                    </td>
                  </tr>
                );
              })}
            />
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <div>
              <h2 className="font-medium">Por reponer</h2>
              <p className="text-xs text-suave">Semanales en su mínimo o menos</p>
            </div>
            <Link href="/reposiciones" className="text-sm text-verde-700 hover:underline">
              Reposiciones
            </Link>
          </div>
          {bajos.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-suave">Todos los semanales están sobre su mínimo.</p>
          ) : (
            <ListaPaginada
              className="divide-y divide-borde"
              etiqueta="productos"
              items={bajos.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <Inicial nombre={s.producto} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.producto}</p>
                    <p className="truncate text-xs text-suave">{s.colegio}</p>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`chip ${s.total_unidades === 0 ? "chip-critico" : "chip-atencion"}`}>
                      {s.total_unidades === 0 ? "Agotado" : `Quedan ${s.total_unidades}`}
                    </span>
                    {pedidoEnCurso.get(`${s.colegio_id}-${s.producto_id}`) && (
                      <span className="text-[11px] text-[#2b5ea7]">
                        Pedido {pedidoEnCurso.get(`${s.colegio_id}-${s.producto_id}`)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
