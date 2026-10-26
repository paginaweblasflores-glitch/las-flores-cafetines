"use client";

import { useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";
import { elegirColegio } from "@/app/actions/panel";

/** Filtro de colegio del Inicio: va en el encabezado de la página, a la derecha del título */
export function SelectorColegio({ colegios, colegioId }: { colegios: { id: number; nombre: string }[]; colegioId: number | null }) {
  const [pendiente, iniciar] = useTransition();
  const actual = colegios.find((c) => c.id === colegioId);
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-borde bg-white py-1.5 pr-3 pl-1.5 shadow-[0_1px_0_rgba(15,26,20,0.04)] transition-colors hover:border-campo print:hidden">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-panel text-sm font-semibold text-white">
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
            className="w-full max-w-[220px] cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-medium text-tinta outline-none"
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
  );
}
