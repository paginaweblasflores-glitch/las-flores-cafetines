"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Inicial } from "@/components/ui";
import { buscarPorNombre, numero } from "@/lib/format";

export type OpcionProducto = {
  id: number;
  nombre: string;
  /** Texto chico al lado del nombre (categoría, cómo viene…) */
  detalle?: string;
  /** Unidades que hay ahora (se muestra con color) */
  stock: number;
  /** Mínimo: si hay esto o menos, el stock sale en ámbar */
  minimo?: number;
};

/**
 * Buscador de productos para el panel: al hacer clic se abre la lista (con su stock) y se puede
 * desplazar; al escribir, filtra al instante. Con solo tener el cursor no se abre (no tapa lo de abajo). Flechas ↑ ↓ para moverse, Enter para elegir, Esc para cerrar.
 */
export function BuscadorProducto({
  opciones,
  valor,
  onElegir,
  placeholder = "Buscar producto por nombre...",
  autoFocus,
}: {
  opciones: OpcionProducto[];
  valor: number | null;
  onElegir: (id: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const elegido = opciones.find((o) => o.id === valor) ?? null;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const visibles = buscarPorNombre(opciones, texto, (o) => o.nombre);

  // Clic fuera: se cierra
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // La opción marcada con el teclado siempre queda a la vista
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function abrir() {
    setTexto("");
    setActivo(0);
    setAbierto(true);
  }
  function elegir(o: OpcionProducto) {
    onElegir(o.id);
    setAbierto(false);
    setTexto("");
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) return abrir();
      setActivo((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visibles[activo];
      if (abierto && o) elegir(o);
      else abrir();
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const colorStock = (o: OpcionProducto) =>
    o.stock <= 0 ? "text-rojo" : o.minimo != null && o.stock <= o.minimo ? "text-[#b5651d]" : "text-verde-700";

  return (
    <div ref={caja} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
        <input
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={abierto ? texto : (elegido?.nombre ?? "")}
          placeholder={abierto && elegido ? elegido.nombre : placeholder}
          onClick={() => !abierto && abrir()}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
            if (!abierto) setAbierto(true);
          }}
          onKeyDown={teclas}
          className={`input pr-16 pl-10 ${abierto ? "border-verde ring-2 ring-verde/15" : ""} ${elegido && !abierto ? "font-medium" : ""}`}
        />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {elegido && !abierto && (
            <button
              type="button"
              onClick={() => onElegir(null)}
              className="rounded-md p-1 text-suave hover:bg-fondo hover:text-tinta"
              aria-label="Quitar producto"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className={`pointer-events-none h-4 w-4 text-suave transition-transform ${abierto ? "rotate-180" : ""}`} />
        </span>
      </div>

      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-borde bg-white py-1 shadow-xl"
        >
          {visibles.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-suave">No hay productos con &quot;{texto}&quot;.</li>
          ) : (
            visibles.map((o, i) => (
              <li
                key={o.id}
                data-i={i}
                role="option"
                aria-selected={o.id === valor}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(o)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === activo ? "bg-fondo" : ""} ${
                  o.id === valor ? "bg-verde-50" : ""
                }`}
              >
                <Inicial nombre={o.nombre} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.nombre}</span>
                  <span className={`block text-xs font-medium ${colorStock(o)}`}>
                    Stock: {numero(o.stock)} unid.
                    {o.detalle && <span className="font-normal text-suave"> · {o.detalle}</span>}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
