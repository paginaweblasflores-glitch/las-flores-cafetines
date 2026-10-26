"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";
import { cerrarSesion } from "@/app/actions/auth";

/** Perfil al final del menú lateral (como Linear o Vercel): nombre, rol y cerrar sesión */
export function PerfilLateral({ nombre, usuario, nombreRol }: { nombre: string; usuario: string; nombreRol: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al hacer clic afuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative mt-3 border-t border-white/10 pt-3">
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 bottom-[calc(100%+6px)] left-0 overflow-hidden rounded-xl border border-borde bg-white text-tinta shadow-xl shadow-black/30"
        >
          <div className="border-b border-borde bg-[#fafbfa] p-3">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            <p className="truncate text-xs text-suave">Usuario: {usuario}</p>
            <p className="chip chip-exito mt-1.5">
              <ShieldCheck className="h-3 w-3" />
              {nombreRol}
            </p>
          </div>
          <form action={cerrarSesion} className="p-1.5">
            <button
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rojo hover:bg-rojo-50"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${abierto ? "bg-panel-3" : "hover:bg-panel-2"}`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-verde text-sm font-semibold text-white">
          {nombre.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-white">{nombre}</span>
          <span className="block truncate text-[11px] text-panel-text">{nombreRol}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-panel-text" />
      </button>
    </div>
  );
}
