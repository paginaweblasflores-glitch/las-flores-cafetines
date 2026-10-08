"use client";

import { useEffect } from "react";

/**
 * En toda la app: al entrar a un campo de número, su contenido queda seleccionado
 * para escribir encima (sin borrar primero). Vale para cualquier campo, presente o futuro.
 */
export function SeleccionarNumeros() {
  useEffect(() => {
    const alEntrar = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "number" || el.readOnly || el.disabled) return;
      // Después del clic: si se selecciona antes, el mismo clic pone el cursor y quita la selección
      setTimeout(() => {
        if (document.activeElement === el) el.select();
      }, 0);
    };
    document.addEventListener("focusin", alEntrar);
    return () => document.removeEventListener("focusin", alEntrar);
  }, []);
  return null;
}
