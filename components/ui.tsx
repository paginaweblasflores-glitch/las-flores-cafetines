"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Avisos flotantes (toasts)                                           */
/* ------------------------------------------------------------------ */
type Aviso = { id: number; texto: string; tipo: "ok" | "error" };

export function avisar(texto: string, tipo: Aviso["tipo"] = "ok") {
  window.dispatchEvent(new CustomEvent("lf-aviso", { detail: { texto, tipo } }));
}

export function Avisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  useEffect(() => {
    const escuchar = (e: Event) => {
      const { texto, tipo } = (e as CustomEvent).detail as Omit<Aviso, "id">;
      const id = Date.now() + Math.random();
      setAvisos((a) => [...a, { id, texto, tipo }]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "error" ? 6000 : 3500);
    };
    window.addEventListener("lf-aviso", escuchar);
    return () => window.removeEventListener("lf-aviso", escuchar);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {avisos.map((a) => (
        <div
          key={a.id}
          role="status"
          className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            a.tipo === "ok" ? "bg-verde-oscuro text-white" : "bg-rojo text-white"
          }`}
        >
          {a.tipo === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verde-200" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{a.texto}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ventana modal                                                       */
/* ------------------------------------------------------------------ */
export function Modal({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  ancho = "max-w-lg",
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-panel/50 backdrop-blur-[2px]" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative max-h-[92vh] w-full ${ancho} overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{titulo}</h2>
            {subtitulo && <div className="mt-0.5 text-sm text-suave">{subtitulo}</div>}
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-suave hover:bg-fondo" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Anillo de porcentaje (como en el diseño)                            */
/* ------------------------------------------------------------------ */
export function Anillo({
  valor,
  color = "var(--color-verde)",
  tam = 56,
  texto,
}: {
  valor: number;
  color?: string;
  tam?: number;
  texto?: string;
}) {
  const v = Math.max(0, Math.min(100, Number.isFinite(valor) ? valor : 0));
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: tam, height: tam }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#edf0ee" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-semibold text-tinta">
        {texto ?? `${Math.round(v)}%`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estado vacío                                                        */
/* ------------------------------------------------------------------ */
export function Vacio({ titulo, texto, icono }: { titulo: string; texto?: string; icono?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icono && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-verde-50 text-verde">{icono}</div>}
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-suave">{texto}</p>}
    </div>
  );
}

/** Inicial del producto en un cuadrito de color (en lugar de foto) */
export function Inicial({ nombre, className = "" }: { nombre: string; className?: string }) {
  const colores = ["#e7f6e9", "#fdf0e3", "#e8f0fb", "#fbe9ec", "#f1ebfa", "#e6f6f4"];
  const texto = ["#237a2f", "#b5651d", "#2b5ea7", "#b42336", "#6a3fb0", "#1d7f72"];
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = h % colores.length;
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold ${className}`}
      style={{ background: colores[i], color: texto[i] }}
    >
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}
