"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronsUpDown, LogOut, Menu, ShieldCheck } from "lucide-react";
import { elegirColegio } from "@/app/actions/panel";
import { cerrarSesion } from "@/app/actions/auth";
import { EVENTO_MENU } from "./barra-lateral";

export function BarraSuperior({
  nombre,
  usuario,
  nombreRol,
  colegios,
  colegioId,
}: {
  nombre: string;
  usuario: string;
  nombreRol: string;
  colegios: { id: number; nombre: string }[];
  colegioId: number | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [perfil, setPerfil] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const actual = colegios.find((c) => c.id === colegioId);
  // Solo Inicio usa este selector; las demás páginas tienen sus propios filtros de colegio
  const conSelector = usePathname() === "/dashboard";

  // Cerrar el menú de perfil al hacer clic afuera o con Escape
  useEffect(() => {
    if (!perfil) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setPerfil(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPerfil(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [perfil]);

  return (
    <header className="sticky top-0 z-30 flex print:hidden h-[72px] items-center gap-3 border-b border-borde bg-fondo/90 px-4 backdrop-blur sm:px-6 lg:px-9">
      <button
        onClick={() => window.dispatchEvent(new Event(EVENTO_MENU))}
        className="rounded-xl p-2 text-tinta hover:bg-white lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Selector de colegio */}
      {conSelector && (
        <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-borde bg-white py-1.5 pr-3 pl-1.5 transition-colors hover:border-verde/50">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-sm font-bold text-white">
            {actual ? actual.nombre.replace(/^Colegio\s+/i, "").charAt(0) : "T"}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[11px] text-suave">{pendiente ? "Cambiando..." : "Colegio"}</span>
            <span className="relative block">
              <select
                value={colegioId ?? ""}
                disabled={pendiente}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  iniciar(() => elegirColegio(v));
                }}
                className="w-full max-w-[200px] cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-tinta outline-none sm:max-w-none"
                aria-label="Cambiar colegio"
              >
                <option value="">Todos los colegios</option>
                {colegios.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-0 h-4 w-4 -translate-y-1/2 text-suave" />
            </span>
          </span>
        </label>
      )}

      {/* Perfil */}
      <div ref={caja} className="relative ml-auto">
        <button
          onClick={() => setPerfil((v) => !v)}
          aria-expanded={perfil}
          aria-haspopup="menu"
          className={`flex items-center gap-3 rounded-2xl border py-1.5 pr-3 pl-1.5 transition-colors ${
            perfil ? "border-verde/50 bg-white" : "border-transparent hover:border-borde hover:bg-white"
          }`}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-verde text-sm font-semibold text-white">
            {nombre.charAt(0)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-semibold">{nombre}</span>
            <span className="block text-[11px] text-suave">{nombreRol}</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-suave transition-transform ${perfil ? "rotate-180" : ""}`} />
        </button>

        {perfil && (
          <div
            role="menu"
            className="absolute top-[calc(100%+8px)] right-0 w-72 overflow-hidden rounded-2xl border border-borde bg-white shadow-xl shadow-black/10"
          >
            <div className="flex items-center gap-3 border-b border-borde bg-[#fafbfa] p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-verde text-lg font-semibold text-white">
                {nombre.charAt(0)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{nombre}</p>
                <p className="truncate text-xs text-suave">Usuario: {usuario}</p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-verde-50 px-2 py-0.5 text-[11px] font-medium text-verde-700">
                  <ShieldCheck className="h-3 w-3" />
                  {nombreRol}
                </p>
              </div>
            </div>
            <form action={cerrarSesion} className="p-2">
              <button
                role="menuitem"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rojo hover:bg-rojo-50"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
