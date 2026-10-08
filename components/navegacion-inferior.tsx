"use client";

import type { LucideIcon } from "lucide-react";

export type ItemNavegacion<T extends string> = {
  id: T;
  texto: string;
  icono: LucideIcon;
  /** Número pequeño sobre el icono (pendientes) */
  marca?: string | null;
  /** La marca resalta en ámbar cuando hay algo por hacer */
  alerta?: boolean;
};

/** Alto del menú inferior; lo usan las barras fijas que van encima */
export const ALTO_NAVEGACION = "calc(4rem + env(safe-area-inset-bottom))";

/** Menú de iconos fijo abajo, como en las aplicaciones del celular */
export function NavegacionInferior<T extends string>({
  items,
  activo,
  cambiar,
}: {
  items: ItemNavegacion<T>[];
  activo: T;
  cambiar: (id: T) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-white pb-[env(safe-area-inset-bottom)]"
      role="tablist"
    >
      <div className="mx-auto grid h-16 max-w-3xl" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((it) => {
          const sel = it.id === activo;
          const Icono = it.icono;
          return (
            <button
              key={it.id}
              role="tab"
              aria-selected={sel}
              onClick={() => {
                cambiar(it.id);
                window.scrollTo({ top: 0 });
              }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                sel ? "text-verde-700" : "text-suave"
              }`}
            >
              <span className={`relative grid h-7 w-14 place-items-center rounded-full transition-colors ${sel ? "bg-verde-50" : ""}`}>
                <Icono className="h-5 w-5" strokeWidth={sel ? 2.2 : 1.8} />
                {it.marca && (
                  <span
                    className={`absolute -top-1 left-8 min-w-[18px] rounded-full px-1 text-center text-[10px] leading-[18px] font-semibold ${
                      it.alerta ? "bg-ambar text-white" : "bg-fondo text-suave ring-1 ring-borde"
                    }`}
                  >
                    {it.marca}
                  </span>
                )}
              </span>
              {it.texto}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
