"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  FileText,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  School,
  Settings,
  Sun,
  Tag,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Rol } from "@/lib/types";

/** Evento que dispara el botón de menú de la barra superior (en celular) */
export const EVENTO_MENU = "lf-abrir-menu";

/** soloAdmin: logística (Fernanda) no lo ve; su trabajo es comprar y entregar */
type Enlace = { href: string; texto: string; icono: LucideIcon; soloAdmin?: boolean };
type Grupo = { id: string; texto: string; icono: LucideIcon; hijos: Enlace[]; soloAdmin?: boolean };
type Item = Enlace | Grupo;

/**
 * Lo de todos los días va suelto; lo que tiene sub-pantallas o se usa menos va en un desplegable,
 * así el menú cabe sin scroll.
 */
const MENU: Item[] = [
  { href: "/dashboard", texto: "Inicio", icono: LayoutDashboard },
  {
    id: "conteos",
    texto: "Conteos",
    icono: ClipboardCheck,
    soloAdmin: true,
    hijos: [
      { href: "/conteos?tipo=dia", texto: "Del día", icono: Sun },
      { href: "/conteos?tipo=semana", texto: "Semanal", icono: CalendarDays },
    ],
  },
  { href: "/reposiciones", texto: "Reposiciones", icono: ClipboardList },
  { href: "/ingresos", texto: "Entregas", icono: Truck },
  {
    id: "productos",
    texto: "Productos",
    icono: Package,
    hijos: [
      { href: "/productos", texto: "Catálogo", icono: Tag },
      { href: "/stock", texto: "Stock por cafetín", icono: Boxes },
    ],
  },
  {
    id: "reportes",
    texto: "Reportes",
    icono: BarChart3,
    hijos: [
      { href: "/reporte-mensual", texto: "Reporte mensual", icono: FileText },
      { href: "/ventas", texto: "Ventas del mes", icono: CalendarDays, soloAdmin: true },
      { href: "/movimientos", texto: "Historial", icono: History },
    ],
  },
  {
    id: "pantallas",
    texto: "Cafetín",
    icono: MonitorSmartphone,
    soloAdmin: true,
    hijos: [
      { href: "/personal", texto: "Personal", icono: ClipboardPen },
      { href: "/cocina", texto: "Cocina", icono: ChefHat },
    ],
  },
  {
    id: "admin",
    texto: "Administración",
    icono: Settings,
    soloAdmin: true,
    hijos: [
      { href: "/colegios", texto: "Colegios", icono: School },
      { href: "/usuarios", texto: "Usuarios", icono: Users },
    ],
  },
];

const esGrupo = (i: Item): i is Grupo => "hijos" in i;

/** avisos: número de pendientes por ruta (se muestra junto al enlace) */
export function BarraLateral({ rol, avisos = {} }: { rol: Rol; avisos?: Record<string, number> }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const items = MENU.filter((i) => !(i.soloAdmin && rol !== "ADMIN")).map((i) =>
    esGrupo(i) ? { ...i, hijos: i.hijos.filter((h) => !(h.soloAdmin && rol !== "ADMIN")) } : i,
  );

  /** ¿El enlace corresponde a la página actual? (con ?tipo= cuando el enlace lo indica) */
  const activo = (href: string) => {
    const [camino, consulta] = href.split("?");
    if (!(ruta === camino || ruta.startsWith(camino + "/"))) return false;
    if (!consulta) return true;
    const [clave, valor] = consulta.split("=");
    // Sin ?tipo en la URL vale el primero (Del día)
    return (params.get(clave) ?? "dia") === valor;
  };
  const grupoActivo = (g: Grupo) => g.hijos.some((h) => activo(h.href));

  // Un solo grupo abierto a la vez (así el menú siempre cabe); por defecto, el de la página actual
  const [elegido, setElegido] = useState<string | null | undefined>(undefined);
  const deLaPagina = items.find((i) => esGrupo(i) && grupoActivo(i)) as Grupo | undefined;
  const grupoAbierto = elegido === undefined ? (deLaPagina?.id ?? null) : elegido;
  const estaAbierto = (g: Grupo) => grupoAbierto === g.id;

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_MENU, abrir);
    return () => window.removeEventListener(EVENTO_MENU, abrir);
  }, []);

  const aviso = (n: number | undefined) =>
    (n ?? 0) > 0 ? (
      <span className="min-w-5 rounded-full bg-ambar px-1.5 text-center text-xs leading-5 font-semibold text-white">{n}</span>
    ) : null;

  const enlace = (item: Enlace, hijo = false) => {
    const sel = activo(item.href);
    const Icono = item.icono;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setAbierto(false)}
        className={`flex items-center gap-3 rounded-xl px-3 text-sm transition-colors ${hijo ? "py-2 pl-10" : "py-2.5"} ${
          sel ? "bg-panel-3 font-medium text-white" : "text-panel-text hover:bg-panel-2 hover:text-white"
        }`}
      >
        {!hijo && <Icono className={`h-[18px] w-[18px] ${sel ? "text-verde" : ""}`} />}
        <span className="flex-1">{item.texto}</span>
        {aviso(avisos[item.href])}
      </Link>
    );
  };

  const grupo = (g: Grupo) => {
    const abiertoG = estaAbierto(g);
    const activoG = grupoActivo(g);
    const Icono = g.icono;
    const pendientes = g.hijos.reduce((a, h) => a + (avisos[h.href] ?? 0), 0);
    return (
      <div key={g.id}>
        <button
          type="button"
          onClick={() => setElegido(abiertoG ? null : g.id)}
          aria-expanded={abiertoG}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-panel-2 hover:text-white ${
            activoG ? "font-medium text-white" : "text-panel-text"
          }`}
        >
          <Icono className={`h-[18px] w-[18px] ${activoG ? "text-verde" : ""}`} />
          <span className="flex-1">{g.texto}</span>
          {!abiertoG && aviso(pendientes)}
          <ChevronDown className={`h-4 w-4 opacity-70 transition-transform ${abiertoG ? "rotate-180" : ""}`} />
        </button>
        {abiertoG && <div className="mt-0.5 flex flex-col gap-0.5">{g.hijos.map((h) => enlace(h, true))}</div>}
      </div>
    );
  };

  return (
    <>
      {abierto && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setAbierto(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[220px] shrink-0 flex-col bg-panel px-3 py-6 transition-transform print:hidden lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="rounded-full bg-white p-0.5">
              <Image src="/logo.png" alt="Las Flores" width={40} height={40} className="h-9 w-9" />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-wide text-white">LAS FLORES</span>
              <span className="block text-[11px] text-panel-text">Cafetines</span>
            </span>
          </Link>
          <button onClick={() => setAbierto(false)} className="p-1 text-panel-text lg:hidden" aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Si en una pantalla baja no alcanza, el scroll es fino y del color del menú */}
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-color:var(--color-panel-3)_transparent] [scrollbar-width:thin]">
          {items.map((i) => (esGrupo(i) ? grupo(i) : enlace(i)))}
        </nav>
      </aside>
    </>
  );
}
