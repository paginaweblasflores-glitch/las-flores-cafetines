"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const OPCIONES_FILAS = [5, 10, 25, 50, 100, 200, 500];
export const FILAS_POR_DEFECTO = 5;

/**
 * Estado de paginación. Cuando cambia `clave` (por ejemplo, un filtro o una búsqueda)
 * vuelve a la página 1.
 */
export function usePaginacion(total: number, clave: string = "") {
  const [porPagina, setPorPagina] = useState(FILAS_POR_DEFECTO);
  const [pagina, setPagina] = useState(1);
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    setPagina(1);
  }
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, paginas);
  const desde = (actual - 1) * porPagina;
  return {
    pagina: actual,
    paginas,
    porPagina,
    desde,
    hasta: Math.min(desde + porPagina, total),
    total,
    irA: (p: number) => setPagina(Math.min(Math.max(1, p), paginas)),
    cambiarPorPagina: (n: number) => {
      setPorPagina(n);
      setPagina(1);
    },
    cortar: <T,>(lista: T[]) => lista.slice(desde, desde + porPagina),
  };
}

export type Paginacion = ReturnType<typeof usePaginacion>;

/** Números de página a mostrar: 1 … 4 5 6 … 20 */
function numeros(actual: number, paginas: number): (number | "…")[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const set = new Set([1, paginas, actual - 1, actual, actual + 1]);
  const lista = [...set].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  lista.forEach((n, i) => {
    if (i > 0 && n - lista[i - 1] > 1) salida.push("…");
    salida.push(n);
  });
  return salida;
}

/** Barra inferior: filas por página + rango + botones de página */
export function BarraPaginacion({ p, etiqueta = "registros" }: { p: Paginacion; etiqueta?: string }) {
  if (p.total === 0) return null;
  const boton =
    "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-sm text-suave transition-colors hover:bg-fondo hover:text-tinta disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-borde px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-suave">
        <label className="flex items-center gap-2">
          <span>Filas por página</span>
          <select
            value={p.porPagina}
            onChange={(e) => p.cambiarPorPagina(Number(e.target.value))}
            className="cursor-pointer rounded-lg border border-borde bg-white px-2 py-1 text-sm text-tinta outline-none focus:border-verde"
          >
            {OPCIONES_FILAS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums">
          {p.desde + 1}–{p.hasta} de {p.total} {etiqueta}
        </span>
      </div>

      {p.paginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <button className={boton} onClick={() => p.irA(1)} disabled={p.pagina === 1} aria-label="Primera página">
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button className={boton} onClick={() => p.irA(p.pagina - 1)} disabled={p.pagina === 1} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {numeros(p.pagina, p.paginas).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-suave">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => p.irA(n)}
                aria-current={n === p.pagina ? "page" : undefined}
                className={n === p.pagina ? `${boton} bg-panel font-medium text-white hover:bg-panel hover:text-white` : boton}
              >
                {n}
              </button>
            ),
          )}
          <button
            className={boton}
            onClick={() => p.irA(p.pagina + 1)}
            disabled={p.pagina === p.paginas}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className={boton} onClick={() => p.irA(p.paginas)} disabled={p.pagina === p.paginas} aria-label="Última página">
            <ChevronsRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * Tabla paginada para páginas del servidor: recibe las filas ya armadas (<tr>) y las corta.
 */
export function TablaPaginada({
  cabecera,
  filas,
  pie,
  className = "tabla",
  etiqueta,
  vacio,
}: {
  cabecera: ReactNode;
  filas: ReactNode[];
  pie?: ReactNode;
  className?: string;
  etiqueta?: string;
  vacio?: ReactNode;
}) {
  const p = usePaginacion(filas.length);
  if (filas.length === 0 && vacio) return <>{vacio}</>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className={className}>
          {cabecera}
          <tbody>{p.cortar(filas)}</tbody>
          {pie}
        </table>
      </div>
      <BarraPaginacion p={p} etiqueta={etiqueta} />
    </>
  );
}

/** Lista paginada (<li>) para páginas del servidor */
export function ListaPaginada({ items, className, etiqueta }: { items: ReactNode[]; className?: string; etiqueta?: string }) {
  const p = usePaginacion(items.length);
  return (
    <>
      <ul className={className}>{p.cortar(items)}</ul>
      <BarraPaginacion p={p} etiqueta={etiqueta} />
    </>
  );
}
