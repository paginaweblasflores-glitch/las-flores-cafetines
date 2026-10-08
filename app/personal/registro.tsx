"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  CheckCircle2,
  ChevronRight,
  House,
  Menu,
  Package,
  Save,
  Search,
  Sun,
  TriangleAlert,
  Truck,
  Undo2,
} from "lucide-react";
import { guardarRegistro, type CambioRegistro } from "@/app/actions/personal";
import { avisar, Modal } from "@/components/ui";
import { ALTO_NAVEGACION, NavegacionInferior, type ItemNavegacion } from "@/components/navegacion-inferior";
import { BarraSuperiorMovil, PerfilMovil } from "@/components/movil";
import {
  descPresentacion,
  ESTADO_REPOSICION,
  fechaCorta,
  fechaISOLima,
  fechaLarga,
  lunesDeSemana,
  NOMBRE_PRESENTACION,
  normalizar,
  soles,
} from "@/lib/format";
import { RecepcionEnvios, type EnvioPorRecibir } from "./recepcion";
import { Reposicion, type ReposicionEnviada } from "./reposicion";
import { MisProductos } from "./productos";
import type { ItemNuevo } from "@/app/actions/reposiciones";

type Producto = {
  id: number;
  productoId: number;
  nombre: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  /** Unidades en total en el cafetín */
  stock: number;
  precio: number;
  /** Producto del día: se cuenta a diario y lo que sobra es merma */
  perecible: boolean;
  /** Última vez que se contó (timestamp) */
  ultimoConteo: string | null;
  /** Avisar cuando quede esto o menos */
  stockMinimo: number;
  categoria: string;
};

type Edicion = { unidades?: string; merma?: string; motivo?: string; motivoOtro?: string };
type Seccion = "inicio" | "recibir" | "dia" | "semanal" | "reposicion" | "productos" | "menu";
/** Secciones que se abren desde el menú (☰) */
const DEL_MENU: Seccion[] = ["semanal", "reposicion", "productos", "menu"];

const MOTIVOS_MERMA = ["No se vendió", "Se cayó", "Se rompió o malogró", "Se venció", "Otro"];
const MOTIVO_POR_DEFECTO = MOTIVOS_MERMA[0];

/** Sobrante: si no lo cambian, es todo lo que queda (los productos del día no pasan al día siguiente) */
function valorSobrante(e: Edicion, perecible: boolean) {
  return e.merma ?? (perecible ? (e.unidades ?? "") : "");
}

function leerMerma(e: Edicion, perecible: boolean) {
  const v = valorSobrante(e, perecible);
  const cantidad = v !== "" ? Number(v) : 0;
  const motivo = (e.motivo ?? MOTIVO_POR_DEFECTO) === "Otro" ? (e.motivoOtro ?? "").trim() : (e.motivo ?? MOTIVO_POR_DEFECTO);
  return { cantidad, motivo };
}

export function RegistroPersonal({
  hoy,
  nombreUsuario,
  colegio,
  colegios,
  esPersonal,
  productos,
  ventasHoy,
  porRecibir,
  reposiciones,
}: {
  hoy: string;
  nombreUsuario: string;
  colegio: { id: number; nombre: string };
  colegios: { id: number; nombre: string }[];
  esPersonal: boolean;
  productos: Producto[];
  ventasHoy: { productoId: number; unidades: number; monto: number }[];
  porRecibir: EnvioPorRecibir[];
  reposiciones: ReposicionEnviada[];
}) {
  const router = useRouter();
  const [seccion, setSeccion] = useState<Seccion>("inicio");
  const [ediciones, setEdiciones] = useState<Record<number, Edicion>>({});
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [precioDe, setPrecioDe] = useState<Producto | null>(null);
  const [precarga, setPrecarga] = useState<ItemNuevo[]>([]);
  const [verTodosAcaban, setVerTodosAcaban] = useState(false);
  const [recienGuardados, setRecienGuardados] = useState<Set<number>>(() => new Set());

  // Borrador: lo escrito queda en el celular hasta que se guarda (por si se cierra la app)
  const claveBorrador = `lf_conteo_${colegio.id}_${hoy}`;
  const cargado = useRef(false);
  useEffect(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(`lf_conteo_${colegio.id}_`) && k !== claveBorrador) localStorage.removeItem(k);
      }
      const g = localStorage.getItem(claveBorrador);
      // Se restaura después de hidratar para que el HTML del servidor coincida
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (g) setEdiciones(JSON.parse(g));
    } catch {}
    cargado.current = true;
  }, [claveBorrador, colegio.id]);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      if (Object.keys(ediciones).length) localStorage.setItem(claveBorrador, JSON.stringify(ediciones));
      else localStorage.removeItem(claveBorrador);
    } catch {}
  }, [ediciones, claveBorrador]);

  const vendidoPorProducto = useMemo(() => new Map(ventasHoy.map((v) => [v.productoId, v])), [ventasHoy]);
  const totalHoy = ventasHoy.reduce((s, v) => s + v.monto, 0);
  const unidadesHoy = ventasHoy.reduce((s, v) => s + v.unidades, 0);

  const lunes = lunesDeSemana(hoy);
  const contadoHoy = (p: Producto) =>
    recienGuardados.has(p.id) || (!!p.ultimoConteo && fechaISOLima(p.ultimoConteo) === hoy);
  const contadoSemana = (p: Producto) =>
    recienGuardados.has(p.id) || (!!p.ultimoConteo && fechaISOLima(p.ultimoConteo) >= lunes);
  const delDia = productos.filter((p) => p.perecible);
  const semanales = productos.filter((p) => !p.perecible);
  const delDiaContados = delDia.filter(contadoHoy).length;
  const porContarSemana = semanales.filter((p) => !contadoSemana(p)).length;

  const q = normalizar(busqueda);
  const contadoEnSeccion = (p: Producto) => (p.perecible ? contadoHoy(p) : contadoSemana(p));
  const deSeccion = seccion === "dia" ? delDia : semanales;
  // Primero lo que falta contar; lo contado queda abajo con su marca verde
  const lista = deSeccion
    .filter((p) => !q || normalizar(p.nombre).includes(q))
    .sort((a, b) => Number(contadoEnSeccion(a)) - Number(contadoEnSeccion(b)));
  const todoContado = deSeccion.length > 0 && deSeccion.every(contadoEnSeccion);

  // Lo escrito en la sección: se guarda todo con un solo botón
  const escritos = deSeccion.map((p) => ({ p, r: evaluar(p, ediciones[p.id] ?? {}) })).filter((x) => x.r.hayCambio);
  const listos = escritos.filter((x) => x.r.cambio);
  const conError = escritos.length - listos.length;
  const ventaEscrita = listos.reduce((a, x) => a + Math.max(x.r.vendio, 0) * x.p.precio, 0);

  function editar(id: number, campo: keyof Edicion, valor: string) {
    setEdiciones((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
    setErrores((prev) => {
      if (!(id in prev)) return prev;
      const resto = { ...prev };
      delete resto[id];
      return resto;
    });
  }
  function descartar(id: number) {
    setEdiciones((prev) => {
      const resto = { ...prev };
      delete resto[id];
      return resto;
    });
  }

  /** Guarda de una vez todo lo escrito en la sección; lo que tenga error queda para corregir */
  async function guardarTodo() {
    if (!listos.length || guardando) return;
    setGuardando(true);
    const r = await guardarRegistro(listos.map((x) => x.r.cambio!));
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    setEdiciones((prev) => {
      const resto = { ...prev };
      for (const id of r.guardados) delete resto[id];
      return resto;
    });
    setErrores(Object.fromEntries(r.errores.map((x) => [x.id, x.error])));
    setRecienGuardados((prev) => new Set([...prev, ...r.guardados]));
    const partes = [`${r.guardados.length} producto${r.guardados.length === 1 ? "" : "s"} guardado${r.guardados.length === 1 ? "" : "s"}`];
    if (r.vendido > 0) partes.push(`${r.vendido} vendida${r.vendido === 1 ? "" : "s"}`);
    if (r.merma > 0) partes.push(`${r.merma} de sobrante`);
    if (r.ajustes > 0) partes.push(`${r.ajustes} como ajuste para revisión`);
    avisar(partes.join(" · "));
    if (r.errores.length) avisar(`${r.errores.length} no se pudo guardar: revisa los marcados en rojo`, "error");
  }

  const irA = (id: Seccion) => {
    setSeccion(id);
    setBusqueda("");
  };

  const faltanDelDia = delDia.length - delDiaContados;

  // Se está acabando: semanales en su mínimo o menos (los del día los manda cocina a diario)
  const pedidoEnCurso = new Map<number, string>();
  for (const r of reposiciones) {
    if (r.estado !== "POR_APROBAR" && r.estado !== "APROBADA" && r.estado !== "EN_COMPRA") continue;
    for (const i of r.items) if (i.productoId != null && !i.quitado) pedidoEnCurso.set(i.productoId, r.codigo);
  }
  const seAcaban = semanales.filter((p) => p.stock <= p.stockMinimo).sort((a, b) => a.stock - b.stock);
  const porPedir = seAcaban.filter((p) => !pedidoEnCurso.has(p.productoId));
  function pedirLosQueSeAcaban() {
    setPrecarga(
      porPedir.map((p) => ({
        productoId: p.productoId,
        nombre: p.nombre,
        cantidad: 1,
        unidad: ["CAJA", "PAQUETE", "BOLSA"].includes(p.presentacion) ? p.presentacion : "UNIDAD",
      })),
    );
    irA("reposicion");
  }
  const recibirDelDia = porRecibir.filter((e) => e.origen === "COCINA").length;
  const recibirSemanal = porRecibir.length - recibirDelDia;
  const menu: ItemNavegacion<Seccion>[] = [
    { id: "inicio", texto: "Inicio", icono: House },
    { id: "recibir", texto: "Recibir", icono: Truck, marca: porRecibir.length > 0 ? String(porRecibir.length) : null, alerta: true },
    { id: "dia", texto: "Del día", icono: Sun, marca: faltanDelDia > 0 ? String(faltanDelDia) : null, alerta: true },
    { id: "menu", texto: "Menú", icono: Menu, marca: porContarSemana > 0 ? String(porContarSemana) : null },
  ];
  const activoEnMenu: Seccion = DEL_MENU.includes(seccion) ? "menu" : seccion;
  const porAprobar = reposiciones.filter((r) => r.estado === "POR_APROBAR").length;
  const ultimaRespondida = reposiciones.find((r) => r.estado !== "POR_APROBAR" && r.estado !== "ANULADA");

  const titulos: Record<Seccion, string> = {
    inicio: colegio.nombre,
    recibir: "Recibir",
    dia: "Productos del día",
    semanal: "Conteo semanal",
    reposicion: "Reposición",
    productos: "Mis productos",
    menu: "Menú",
  };
  const conBuscador = seccion === "dia" || seccion === "semanal";

  // Lo que falta hoy: cada tarea lleva a su sección
  const tareas: { id: Seccion; icono: typeof House; titulo: string; detalle: string; listo: boolean }[] = [
    {
      id: "recibir",
      icono: Truck,
      titulo: "Recibir",
      detalle:
        porRecibir.length > 0
          ? [
              recibirDelDia ? `${recibirDelDia} del día (cocina)` : "",
              recibirSemanal ? `${recibirSemanal} semanal (logística)` : "",
            ]
              .filter(Boolean)
              .join(" · ") + " por revisar"
          : "Nada por recibir",
      listo: porRecibir.length === 0,
    },
    {
      id: "dia",
      icono: Sun,
      titulo: "Contar los del día",
      detalle: delDia.length ? `${delDiaContados} de ${delDia.length} contados hoy` : "Aún no hay productos del día",
      listo: delDia.length > 0 && faltanDelDia === 0,
    },
    {
      id: "semanal",
      icono: CalendarDays,
      titulo: "Conteo semanal",
      detalle: !semanales.length
        ? "Aún no hay productos semanales"
        : porContarSemana > 0
          ? `${porContarSemana} por contar esta semana`
          : "Todo contado esta semana",
      listo: semanales.length > 0 && porContarSemana === 0,
    },
  ];

  return (
    <div
      className="min-h-screen bg-fondo"
      style={{ paddingBottom: `calc(${escritos.length && conBuscador ? "11rem" : "5.5rem"} + env(safe-area-inset-bottom))` }}
    >
      <main className="mx-auto max-w-3xl px-4">
        {/* ------- Barra superior limpia (y buscador en las listas) ------- */}
        <div className={`sticky top-0 z-20 -mx-4 bg-fondo/95 px-4 backdrop-blur ${conBuscador ? "pb-3" : ""}`}>
          <BarraSuperiorMovil
            titulo={titulos[seccion]}
            volverAlPanel={!esPersonal}
            alVolver={seccion === "semanal" || seccion === "reposicion" || seccion === "productos" ? () => irA("menu") : undefined}
            derecha={
              seccion === "dia"
                ? `${delDiaContados}/${delDia.length}`
                : seccion === "semanal" && porContarSemana > 0
                  ? `${porContarSemana} por contar`
                  : null
            }
          />
          {conBuscador && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto..."
                className="input py-3 pl-10 text-base"
              />
            </div>
          )}
        </div>

        {/* ------- Inicio: lo vendido y lo que falta ------- */}
        {seccion === "inicio" && (
          <div className="pt-1">
            <p className="text-lg font-semibold">Hola, {nombreUsuario}</p>
            <p className="text-sm text-suave first-letter:uppercase">{fechaLarga(hoy)}</p>

            <div className="mt-4 rounded-2xl bg-gradient-to-br from-verde-700 to-verde-oscuro p-5 text-white">
              <p className="text-xs text-verde-100">Vendido hoy</p>
              <p className="text-3xl font-semibold tracking-tight">{soles(totalHoy)}</p>
              <p className="text-xs text-verde-100">{unidadesHoy} unidades</p>
            </div>

            <h2 className="mt-6 mb-2 text-sm font-semibold">Por hacer</h2>
            <ul className="space-y-2">
              {tareas.map((t) => {
                const Icono = t.icono;
                return (
                  <li key={t.id}>
                    <button onClick={() => irA(t.id)} className="card flex w-full items-center gap-3 p-3.5 text-left">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                          t.listo ? "bg-verde-50 text-verde-700" : "bg-ambar-50 text-[#8a5a00]"
                        }`}
                      >
                        {t.listo ? <CheckCircle2 className="h-5 w-5" /> : <Icono className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.titulo}</span>
                        <span className="block text-xs text-suave">{t.detalle}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {seAcaban.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="h-4 w-4 text-ambar" /> Se está acabando ({seAcaban.length})
                </h2>
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-borde">
                    {(verTodosAcaban ? seAcaban : seAcaban.slice(0, 5)).map((p) => {
                      const pedido = pedidoEnCurso.get(p.productoId);
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{p.nombre}</span>
                            <span className={`block text-xs ${p.stock === 0 ? "text-rojo" : "text-suave"}`}>
                              {p.stock === 0 ? "Agotado" : `Quedan ${p.stock}`} · mínimo {p.stockMinimo}
                            </span>
                          </span>
                          {pedido && <span className="chip shrink-0 bg-[#e8f0fb] text-[#2b5ea7]">Pedido {pedido}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {seAcaban.length > 5 && (
                    <button
                      onClick={() => setVerTodosAcaban((v) => !v)}
                      className="w-full border-t border-borde py-2 text-sm font-medium text-verde-700"
                    >
                      {verTodosAcaban ? "Ver menos" : `Ver los ${seAcaban.length}`}
                    </button>
                  )}
                  <div className="border-t border-borde p-3">
                    <button
                      onClick={pedirLosQueSeAcaban}
                      disabled={porPedir.length === 0}
                      className="btn-primario h-11 w-full disabled:bg-borde disabled:text-suave disabled:opacity-100"
                    >
                      <ClipboardList className="h-4 w-4" />
                      {porPedir.length === 0
                        ? "Todo ya está pedido"
                        : `Pedir reposición (${porPedir.length} producto${porPedir.length === 1 ? "" : "s"})`}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ------- Menú: conteo semanal, reposición y perfil ------- */}
        {seccion === "menu" && (
          <PerfilMovil
            fecha={fechaLarga(hoy)}
            volverAlPanel={!esPersonal}
          >
            <ul className="card mt-3 divide-y divide-borde overflow-hidden">
              {[
                {
                  id: "semanal" as const,
                  icono: CalendarDays,
                  titulo: "Conteo semanal",
                  detalle: !semanales.length
                    ? "Aún no hay productos semanales"
                    : porContarSemana > 0
                      ? `${porContarSemana} por contar esta semana`
                      : "Todo contado esta semana",
                  marca: porContarSemana,
                },
                {
                  id: "productos" as const,
                  icono: Boxes,
                  titulo: "Mis productos",
                  detalle: `${productos.length} productos${seAcaban.length ? ` · ${seAcaban.length} se están acabando` : " · ver y ajustar mínimos"}`,
                  marca: 0,
                },
                {
                  id: "reposicion" as const,
                  icono: ClipboardList,
                  titulo: "Reposición",
                  detalle: porAprobar
                    ? `${porAprobar} lista${porAprobar === 1 ? "" : "s"} esperando aprobación`
                    : ultimaRespondida
                      ? `${ultimaRespondida.codigo}: ${ESTADO_REPOSICION[ultimaRespondida.estado]?.texto.toLowerCase() ?? ""}`
                      : "Pide productos que se están acabando",
                  marca: 0,
                },
              ].map((o) => {
                const Icono = o.icono;
                return (
                  <li key={o.id}>
                    <button onClick={() => irA(o.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-fondo">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde-50 text-verde-700">
                        <Icono className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{o.titulo}</span>
                        <span className="block truncate text-xs text-suave">{o.detalle}</span>
                      </span>
                      {o.marca > 0 && (
                        <span className="rounded-full bg-fondo px-2 text-xs leading-5 text-suave ring-1 ring-borde">{o.marca}</span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {colegios.length > 0 && (
              <label className="card mt-3 block p-4">
                <span className="text-xs text-suave">Colegio que estás viendo</span>
                <select
                  value={colegio.id}
                  onChange={(e) => router.push(`/personal?colegio=${e.target.value}`)}
                  className="input mt-1.5 text-base"
                >
                  {colegios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </PerfilMovil>
        )}

        {/* ------- Mis productos: lo que hay y los mínimos ------- */}
        {seccion === "productos" && (
          <div className="pt-1">
            <MisProductos productos={productos} />
          </div>
        )}

        {/* ------- Reposición: lista de pedido ------- */}
        {seccion === "reposicion" && (
          <Reposicion
            colegioId={colegio.id}
            catalogo={semanales.map((p) => ({
              productoId: p.productoId,
              nombre: p.nombre,
              presentacion: p.presentacion,
              unidadesPorPresentacion: p.unidadesPorPresentacion,
              stock: p.stock,
            }))}
            enviadas={reposiciones}
            precarga={precarga}
            alPrecargar={() => setPrecarga([])}
          />
        )}

        {seccion === "recibir" && (
          <div className="pt-1">
            <RecepcionEnvios envios={porRecibir} />
          </div>
        )}

        {(seccion === "dia" || seccion === "semanal") && (
          <ul className="space-y-3">
            {todoContado && !busqueda && (
              <li className="flex items-center gap-3 rounded-2xl bg-verde-50 px-4 py-4 text-verde-700">
                <CheckCircle2 className="h-8 w-8 shrink-0" />
                <span>
                  <span className="block font-semibold">Estás al día</span>
                  <span className="block text-sm">
                    {seccion === "dia"
                      ? `Contaste los ${deSeccion.length} productos de hoy.`
                      : `Contaste los ${deSeccion.length} productos de esta semana.`}{" "}
                    Si te equivocaste, toca &quot;Corregir&quot;.
                  </span>
                </span>
              </li>
            )}
            {lista.map((p) => (
              <TarjetaProducto
                key={`${p.id}-${p.ultimoConteo ?? ""}`}
                p={p}
                e={ediciones[p.id] ?? {}}
                vendidoHoy={vendidoPorProducto.get(p.productoId)?.unidades ?? 0}
                contado={contadoEnSeccion(p)}
                errorServidor={errores[p.id] ?? null}
                bloqueado={guardando}
                editar={(campo, valor) => editar(p.id, campo, valor)}
                cambiarPrecio={() => setPrecioDe(p)}
                descartar={() => descartar(p.id)}
              />
            ))}
            {lista.length === 0 && (
              <p className="py-10 text-center text-sm text-suave">
                {busqueda
                  ? `No hay productos con "${busqueda}".`
                  : seccion === "dia"
                    ? "Aún no hay productos del día. Administración los agrega en el Catálogo."
                    : "Aún no hay productos semanales. Administración los agrega en el Catálogo."}
              </p>
            )}
          </ul>
        )}
      </main>

      {conBuscador && escritos.length > 0 && (
        <div className="fixed inset-x-0 z-20 border-t border-borde bg-white/95 backdrop-blur" style={{ bottom: ALTO_NAVEGACION }}>
          <div className="mx-auto max-w-3xl px-4 py-3">
            <p className="mb-2 truncate text-center text-xs text-suave">
              {listos.length} producto{listos.length === 1 ? "" : "s"} · vendiste <b className="text-tinta">{soles(ventaEscrita)}</b>
              {conError > 0 && <span className="text-rojo"> · {conError} con error</span>}
            </p>
            <button
              onClick={guardarTodo}
              disabled={guardando || listos.length === 0}
              className="btn-primario h-12 w-full text-base disabled:bg-borde disabled:text-suave disabled:opacity-100"
            >
              <Save className="h-4 w-4" />
              {guardando
                ? "Guardando..."
                : listos.length === 0
                  ? "Corrige los marcados en rojo"
                  : `Guardar conteo (${listos.length})`}
            </button>
          </div>
        </div>
      )}

      {precioDe && <ModalPrecio key={precioDe.id} p={precioDe} cerrar={() => setPrecioDe(null)} />}

      <NavegacionInferior items={menu} activo={activoEnMenu} cambiar={irA} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Lo que resulta de lo escrito en un producto: venta, sobrante, errores y el cambio a guardar */
function evaluar(p: Producto, e: Edicion) {
  const valorUnidades = e.unidades ?? "";
  const nuevo = valorUnidades === "" ? null : Number(valorUnidades);
  const invalido = nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0);
  const vendio = nuevo !== null && !invalido ? p.stock - nuevo : 0;
  const merma = leerMerma(e, p.perecible);
  const quedan = nuevo ?? p.stock;
  const hayMerma = p.perecible && merma.cantidad > 0;
  const mermaInvalida =
    p.perecible && merma.cantidad !== 0 && (!Number.isInteger(merma.cantidad) || merma.cantidad < 0 || merma.cantidad > quedan);
  const faltaMotivo = hayMerma && merma.motivo.length === 0;
  const hayCambio = nuevo !== null || hayMerma;
  const error = invalido
    ? "Escribe un número entero (0 o más)."
    : mermaInvalida
      ? `El sobrante no puede ser mayor a lo que queda (${quedan}).`
      : faltaMotivo
        ? "Escribe el motivo del sobrante."
        : null;
  const cambio: CambioRegistro | null =
    hayCambio && !error ? { id: p.id, ...(nuevo !== null ? { unidades: nuevo } : {}), ...(hayMerma ? { merma } : {}) } : null;
  return { nuevo, invalido, vendio, merma, quedan, hayMerma, hayCambio, error, cambio };
}

function TarjetaProducto({
  p,
  e,
  vendidoHoy,
  contado,
  errorServidor,
  bloqueado,
  editar,
  cambiarPrecio,
  descartar,
}: {
  p: Producto;
  e: Edicion;
  vendidoHoy: number;
  contado: boolean;
  /** Error al guardar este producto (los demás sí se guardaron) */
  errorServidor: string | null;
  bloqueado: boolean;
  editar: (campo: keyof Edicion, valor: string) => void;
  cambiarPrecio: () => void;
  descartar: () => void;
}) {
  const r = evaluar(p, e);
  const error = r.error ?? errorServidor;
  const [corrigiendo, setCorrigiendo] = useState(false);

  // Ya contado: no se vuelve a pedir; solo se abre si quieren corregir
  if (contado && !corrigiendo && !r.hayCambio && !error) {
    return (
      <li className="card flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium">{p.nombre}</p>
          <p className="text-xs text-suave">
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-3px] text-verde-700" />
            <span className="text-verde-700">{p.perecible ? "Contado hoy" : "Contado"}</span>
            {` · quedan ${p.stock}`}
            {vendidoHoy > 0 ? ` · vendido ${vendidoHoy}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCorrigiendo(true)}
          disabled={bloqueado}
          className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-verde-700 underline"
        >
          Corregir
        </button>
      </li>
    );
  }

  // "Siguiente" del teclado pasa al próximo producto
  function siguiente(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const campos = [...document.querySelectorAll<HTMLInputElement>("input[data-quedan]")];
    const prox = campos[campos.indexOf(ev.currentTarget) + 1];
    if (prox) {
      prox.focus();
      prox.scrollIntoView({ block: "center", behavior: "smooth" });
    } else ev.currentTarget.blur();
  }

  return (
    <li
      className={`card p-4 transition-shadow ${
        error ? "border-rojo shadow-[0_0_0_3px] shadow-rojo/15" : r.hayCambio ? "border-verde shadow-[0_0_0_3px] shadow-verde/15" : ""
      }`}
    >
      {/* Nombre y estado */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{p.nombre}</p>
          <p className="mt-0.5 text-sm text-suave">
            Hay <b className="text-tinta">{p.stock}</b> · {soles(p.precio)}
            <button type="button" onClick={cambiarPrecio} className="ml-1.5 text-xs text-verde-700 underline">
              cambiar precio
            </button>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(r.hayCambio || corrigiendo) && (
            <button
              type="button"
              onClick={() => {
                descartar();
                setCorrigiendo(false);
              }}
              disabled={bloqueado}
              className="rounded-lg p-1.5 text-suave hover:bg-fondo"
              title="Deshacer"
              aria-label="Deshacer cambios"
            >
              <Undo2 className="h-4 w-4" />
            </button>
          )}
          {contado ? (
            <span className="chip bg-verde-50 text-verde-700">
              <CheckCircle2 className="h-3 w-3" /> {p.perecible ? "Contado hoy" : "Contado"}
            </span>
          ) : (
            <span className="chip bg-ambar-50 text-[#8a5a00]">Por contar</span>
          )}
        </div>
      </div>
      {!p.perecible && p.ultimoConteo && !contado && (
        <p className="mt-1 text-xs text-suave">Último conteo: {fechaCorta(fechaISOLima(p.ultimoConteo))}</p>
      )}
      {vendidoHoy !== 0 && <p className="mt-1 text-xs text-verde-700">Vendido hoy: {vendidoHoy}</p>}

      {/* Campos */}
      <div className={`mt-3 grid gap-3 ${p.perecible ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="block">
          <span className="label">{p.perecible ? "¿Cuántas quedan?" : "¿Cuántas quedan? (todo, también en cajas)"}</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={e.unidades ?? ""}
            placeholder="Contar"
            onChange={(ev) => editar("unidades", ev.target.value)}
            onKeyDown={siguiente}
            enterKeyHint="next"
            data-quedan=""
            disabled={bloqueado}
            className="input h-12 text-center text-xl font-semibold placeholder:text-sm placeholder:font-normal"
            aria-label={`Quedan de ${p.nombre}`}
          />
        </label>
        {p.perecible && (
          <label className="block">
            <span className="label">Sobrante (no se vende)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={valorSobrante(e, p.perecible)}
              placeholder="0"
              onFocus={(ev) => ev.target.select()}
              onChange={(ev) => editar("merma", ev.target.value)}
              disabled={bloqueado}
              className={`input h-12 text-center text-xl font-semibold placeholder:font-normal ${r.hayMerma ? "border-ambar" : ""}`}
              aria-label={`Sobrante de ${p.nombre}`}
            />
          </label>
        )}
      </div>

      {r.hayMerma && (
        <div className="mt-2 grid gap-2">
          <select
            value={e.motivo ?? MOTIVO_POR_DEFECTO}
            onChange={(ev) => editar("motivo", ev.target.value)}
            disabled={bloqueado}
            className="input h-11"
          >
            {MOTIVOS_MERMA.map((m) => (
              <option key={m} value={m}>
                Motivo: {m}
              </option>
            ))}
          </select>
          {(e.motivo ?? MOTIVO_POR_DEFECTO) === "Otro" && (
            <input
              value={e.motivoOtro ?? ""}
              onChange={(ev) => editar("motivoOtro", ev.target.value)}
              className="input"
              placeholder="Escribe el motivo"
              aria-label="Otro motivo"
            />
          )}
        </div>
      )}

      {!p.perecible && p.unidadesPorPresentacion > 1 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-suave">
          <Package className="h-3.5 w-3.5 shrink-0" />
          Viene en {descPresentacion(p.presentacion, p.unidadesPorPresentacion)}: suma también las que están en{" "}
          {NOMBRE_PRESENTACION[p.presentacion]?.toLowerCase()}s cerrad{p.presentacion === "PAQUETE" ? "os" : "as"}.
        </p>
      )}

      {/* Resultado antes de guardar */}
      {error ? (
        <p className="mt-3 rounded-xl bg-rojo-50 px-3 py-2 text-sm text-rojo">{error}</p>
      ) : r.nuevo !== null && r.vendio < 0 ? (
        <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          Es más de lo que había ({p.stock}). Si te equivocaste antes, se corrige; si no, queda como ajuste para que logística lo
          revise.
        </p>
      ) : r.hayCambio ? (
        <p className="mt-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
          {r.vendio > 0 ? (
            <>
              Vendiste <b>{r.vendio}</b> = <b>{soles(r.vendio * p.precio)}</b>
            </>
          ) : (
            "Sin ventas desde el último conteo"
          )}
          {r.hayMerma && (
            <>
              {" "}
              · <b>{r.merma.cantidad}</b> de sobrante ({r.merma.motivo})
            </>
          )}
        </p>
      ) : null}
    </li>
  );
}

/** Cambiar el precio: modal con el precio actual seleccionado para escribir encima (se monta al abrir) */
function ModalPrecio({ p, cerrar }: { p: Producto; cerrar: () => void }) {
  const [valor, setValor] = useState(p.precio.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => campo.current?.select(), 50);
    return () => clearTimeout(t);
  }, []);

  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isFinite(n) && n >= 0 && n < 10000;

  async function aceptar() {
    if (!valido || guardando) return;
    if (Math.round(n * 100) === Math.round(p.precio * 100)) return cerrar();
    setGuardando(true);
    const r = await guardarRegistro([{ id: p.id, precio: n }]);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    if (r.errores.length) return avisar(r.errores[0].error, "error");
    avisar(`${p.nombre}: precio cambiado a ${soles(n)}`);
    cerrar();
  }

  return (
    <Modal abierto onCerrar={cerrar} titulo="Cambiar precio" subtitulo={`${p.nombre} · ahora ${soles(p.precio)}`}>
      <label className="block">
        <span className="label">Nuevo precio (S/)</span>
        <input
          ref={campo}
          type="number"
          inputMode="decimal"
          step="0.10"
          min="0"
          value={valor}
          onChange={(ev) => setValor(ev.target.value)}
          onFocus={(ev) => ev.target.select()}
          onKeyDown={(ev) => ev.key === "Enter" && aceptar()}
          enterKeyHint="done"
          className="input h-14 text-center text-2xl font-semibold"
          autoFocus
        />
      </label>
      {!valido && <p className="mt-2 text-sm text-rojo">Escribe un precio válido.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={aceptar} disabled={guardando || !valido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Aceptar"}
        </button>
      </div>
    </Modal>
  );
}
