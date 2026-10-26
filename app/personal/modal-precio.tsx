"use client";

import { useEffect, useRef, useState } from "react";
import { guardarRegistro } from "@/app/actions/personal";
import { avisar, Modal } from "@/components/ui";
import { soles } from "@/lib/format";

/** Cambiar el precio: modal con el precio actual seleccionado para escribir encima (se monta al abrir) */
export function ModalPrecio({ p, cerrar }: { p: { id: number; nombre: string; precio: number }; cerrar: () => void }) {
  const [valor, setValor] = useState(p.precio.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => campo.current?.select(), 50);
    return () => clearTimeout(t);
  }, []);

  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isFinite(n) && n >= 0 && n < 10000;

  async function aceptar() {
    if (!valido || guardando) return;
    if (Math.round(n * 100) === Math.round(p.precio * 100)) return cerrar();
    setGuardando(true);
    const r = await guardarRegistro([{ id: p.id, precio: n }]);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    if (r.errores.length) return avisar(r.errores[0].error, "error");
    avisar(`${p.nombre}: precio cambiado a ${soles(n)}`);
    cerrar();
  }

  return (
    <Modal abierto onCerrar={cerrar} titulo="Cambiar precio" subtitulo={`${p.nombre} · ahora ${soles(p.precio)}`}>
      <label className="block">
        <span className="label">Nuevo precio (S/)</span>
        <input
          ref={campo}
          type="number"
          inputMode="decimal"
          step="0.10"
          min="0"
          value={valor}
          onChange={(ev) => setValor(ev.target.value)}
          onFocus={(ev) => ev.target.select()}
          onKeyDown={(ev) => ev.key === "Enter" && aceptar()}
          enterKeyHint="done"
          className="input h-14 text-center text-2xl font-semibold"
          autoFocus
        />
      </label>
      {!valido && <p className="mt-2 text-sm text-rojo">Escribe un precio válido.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={aceptar} disabled={guardando || !valido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Aceptar"}
        </button>
      </div>
    </Modal>
  );
}
