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
  Save,
  Search,
  Sun,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { guardarRegistro } from "@/app/actions/personal";
import { avisar } from "@/components/ui";
import { bajoDeBarra, NavegacionInferior, useTecladoAbierto, type ItemNavegacion } from "@/components/navegacion-inferior";
import { BarraSuperiorMovil, PerfilMovil } from "@/components/movil";
import { buscarPorNombre, ESTADO_REPOSICION, fechaISOLima, fechaLarga, lunesDeSemana, soles } from "@/lib/format";
import { RecepcionEnvios, type EnvioPorRecibir } from "./recepcion";
import { Reposicion, type ReposicionEnviada } from "./reposicion";
import { MisProductos } from "./productos";
import { ModalPrecio } from "./modal-precio";
import { evaluar, FilaConteo, HojaConteo, type Edicion, type ProductoConteo } from "./conteo";
import type { ItemNuevo } from "@/app/actions/reposiciones";

type Producto = ProductoConteo;

type Seccion = "inicio" | "recibir" | "dia" | "semanal" | "reposicion" | "productos" | "menu";
/** Secciones que se abren desde el menú (☰) */
const DEL_MENU: Seccion[] = ["semanal", "reposicion", "productos", "menu"];

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
  const teclado = useTecladoAbierto();
  const [seccion, setSeccion] = useState<Seccion>("inicio");
  const [ediciones, setEdiciones] = useState<Record<number, Edicion>>({});
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [precioDe, setPrecioDe] = useState<Producto | null>(null);
  // Producto abierto en la hoja de conteo
  const [abiertoId, setAbiertoId] = useState<number | null>(null);
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
  const contadoHoy = (p: Producto) => recienGuardados.has(p.id) || (!!p.ultimoConteo && fechaISOLima(p.ultimoConteo) === hoy);
  const contadoSemana = (p: Producto) => recienGuardados.has(p.id) || (!!p.ultimoConteo && fechaISOLima(p.ultimoConteo) >= lunes);
  const delDia = productos.filter((p) => p.perecible);
  const semanales = productos.filter((p) => !p.perecible);
  const contadoEnSeccion = (p: Producto) => (p.perecible ? contadoHoy(p) : contadoSemana(p));
  // Flexible: solo se pide contar lo que HAY (llegó o sobró). Lo que no llegó hoy (stock 0) no queda pendiente.
  const aplica = (p: Producto) => p.stock > 0 || contadoEnSeccion(p);
  const delDiaAplican = delDia.filter(aplica);
  const delDiaContados = delDiaAplican.filter(contadoHoy).length;
  const porContarSemana = semanales.filter((p) => p.stock > 0 && !contadoSemana(p)).length;
  const deSeccion = seccion === "dia" ? delDia : semanales;
  // Al buscar, primero los que EMPIEZAN con lo escrito
  const lista = buscarPorNombre(deSeccion, busqueda, (p) => p.nombre);
  // Tres grupos: por contar (hay stock) · ya contados · sin stock hoy (no llegó: no es obligatorio)
  const grupos = [
    { id: "contar", titulo: "Por contar", items: lista.filter((p) => !contadoEnSeccion(p) && p.stock > 0) },
    { id: "listos", titulo: "Ya contados", items: lista.filter((p) => contadoEnSeccion(p)) },
    {
      id: "sinStock",
      titulo: seccion === "dia" ? "Sin stock hoy (no llegó)" : "Sin stock",
      nota: "No es obligatorio contarlos. Ábrelos solo si tienes algo que registrar.",
      items: lista.filter((p) => !contadoEnSeccion(p) && p.stock <= 0),
    },
  ].filter((g) => g.items.length > 0);
  const deSeccionAplican = deSeccion.filter(aplica);
  const todoContado = deSeccionAplican.length > 0 && deSeccionAplican.every(contadoEnSeccion);
  const abierto = abiertoId === null ? null : (lista.find((p) => p.id === abiertoId) ?? null);
  // "Siguiente": el próximo de la lista que falta contar y no tiene nada escrito
  const pendiente = (p: Producto) => p.stock > 0 && !contadoEnSeccion(p) && !evaluar(p, ediciones[p.id] ?? {}).hayCambio;
  const siguienteId = (() => {
    if (!abierto) return null;
    const i = lista.findIndex((p) => p.id === abierto.id);
    return [...lista.slice(i + 1), ...lista.slice(0, i)].find(pendiente)?.id ?? null;
  })();

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
    const partes = [
      `${r.guardados.length} producto${r.guardados.length === 1 ? "" : "s"} guardado${r.guardados.length === 1 ? "" : "s"}`,
    ];
    if (r.vendido > 0) partes.push(`${r.vendido} vendida${r.vendido === 1 ? "" : "s"}`);
    if (r.merma > 0) partes.push(`${r.merma} de sobrante`);
    if (r.ajustes > 0) partes.push(`${r.ajustes} como ajuste para revisión`);
    avisar(partes.join(" · "));
    if (r.errores.length) avisar(`${r.errores.length} no se pudo guardar: revisa los marcados en rojo`, "error");
  }

  const irA = (id: Seccion) => {
    setSeccion(id);
    setAbiertoId(null);
    setBusqueda("");
  };

  const faltanDelDia = delDiaAplican.length - delDiaContados;

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
    {
      id: "recibir",
      texto: "Recibir",
      icono: Truck,
      marca: porRecibir.length > 0 ? String(porRecibir.length) : null,
      alerta: true,
    },
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
          ? [recibirDelDia ? `${recibirDelDia} de cocina` : "", recibirSemanal ? `${recibirSemanal} de logística` : ""]
              .filter(Boolean)
              .join(" · ") + " por revisar"
          : "Nada por recibir",
      listo: porRecibir.length === 0,
    },
    {
      id: "dia",
      icono: Sun,
      titulo: "Contar los del día",
      detalle: !delDia.length
        ? "Aún no hay productos del día"
        : delDiaAplican.length
          ? `${delDiaContados} de ${delDiaAplican.length} contados hoy`
          : "Nada por contar hoy (no llegó nada todavía)",
      listo: faltanDelDia === 0,
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
      listo: porContarSemana === 0,
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
            alVolver={
              seccion === "semanal" || seccion === "reposicion" || seccion === "productos" ? () => irA("menu") : undefined
            }
            derecha={
              seccion === "dia"
                ? `${delDiaContados}/${delDiaAplican.length}`
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
                          t.listo ? "chip-exito" : "chip-atencion"
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
                          {pedido && <span className="chip shrink-0 chip-info">Pedido {pedido}</span>}
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
          <PerfilMovil fecha={fechaLarga(hoy)} volverAlPanel={!esPersonal}>
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
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl chip-exito">
                        <Icono className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{o.titulo}</span>
                        <span className="block truncate text-xs text-suave">{o.detalle}</span>
                      </span>
                      {o.marca > 0 && (
                        <span className="rounded-full bg-fondo px-2 text-xs leading-5 text-suave ring-1 ring-borde">
                          {o.marca}
                        </span>
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
                      ? `Contaste los ${deSeccionAplican.length} productos que tenías hoy.`
                      : `Contaste los ${deSeccionAplican.length} productos de esta semana.`}{" "}
                    Si te equivocaste, toca &quot;Corregir&quot;.
                  </span>
                </span>
              </li>
            )}
            {grupos.map((g) => (
              <li key={g.id}>
                <p className="mb-1.5 px-1 text-xs font-semibold text-suave">
                  {g.titulo} ({g.items.length})
                </p>
                {"nota" in g && g.nota && <p className="mb-1.5 px-1 text-xs text-suave">{g.nota}</p>}
                <div className={`card overflow-hidden ${g.id === "sinStock" ? "opacity-80" : ""}`}>
                  <ul className="divide-y divide-borde">
                    {g.items.map((p) => (
                      <FilaConteo
                        key={`${p.id}-${p.ultimoConteo ?? ""}`}
                        p={p}
                        e={ediciones[p.id] ?? {}}
                        contado={contadoEnSeccion(p)}
                        errorServidor={errores[p.id] ?? null}
                        abrir={() => setAbiertoId(p.id)}
                      />
                    ))}
                  </ul>
                </div>
              </li>
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
        <div
          className="fixed inset-x-0 z-20 border-t border-borde bg-white/95 backdrop-blur"
          style={{ bottom: bajoDeBarra(teclado) }}
        >
          <div className="mx-auto max-w-3xl px-4 py-3">
            <p className="mb-2 truncate text-center text-xs text-suave">
              {listos.length} producto{listos.length === 1 ? "" : "s"} · vendiste{" "}
              <b className="text-tinta">{soles(ventaEscrita)}</b>
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

      {abierto && (
        <HojaConteo
          p={abierto}
          e={ediciones[abierto.id] ?? {}}
          contado={contadoEnSeccion(abierto)}
          vendidoHoy={vendidoPorProducto.get(abierto.productoId)?.unidades ?? 0}
          errorServidor={errores[abierto.id] ?? null}
          posicion={`${lista.findIndex((x) => x.id === abierto.id) + 1} de ${lista.length}`}
          hayOtro={siguienteId !== null}
          editar={(campo, valor) => editar(abierto.id, campo, valor)}
          descartar={() => descartar(abierto.id)}
          cambiarPrecio={() => setPrecioDe(abierto)}
          siguiente={() => setAbiertoId(siguienteId)}
          cerrar={() => setAbiertoId(null)}
        />
      )}
      {precioDe && <ModalPrecio key={precioDe.id} p={precioDe} cerrar={() => setPrecioDe(null)} />}

      <NavegacionInferior items={menu} activo={activoEnMenu} cambiar={irA} />
    </div>
  );
}

