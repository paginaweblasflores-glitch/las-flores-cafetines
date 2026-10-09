"use client";

import type { ReactNode } from "react";

/** Formulario de filtros que se aplica solo al cambiar un campo (sin tener que tocar "Filtrar") */
export function FormularioFiltros({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form className={className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}
