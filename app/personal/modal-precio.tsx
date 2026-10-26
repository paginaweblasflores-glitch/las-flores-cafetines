"use client";

import { useEffect, useRef, useState } from "react";
import { BadgePercent, RotateCcw } from "lucide-react";
import { guardarRegistro } from "@/app/actions/personal";
import { avisar, Modal } from "@/components/ui";
import { soles } from "@/lib/format";

/**
 * Cambiar el precio: modal con el precio actual seleccionado para escribir encima (se monta al abrir).
 * Opcional y discreto: "Es un descuento" guarda el precio normal para volver con un toque,
 * y las ventas con descuento quedan marcadas para el reporte de administración.
 */
export function ModalPrecio({
  p,
  cerrar,
}: {
  p: { id: number; nombre: string; precio: number; precioNormal?: number | null };
  cerrar: () => void;
}) {
  const enDescuento = p.precioNormal != null;
  const [valor, setValor] = useState(p.precio.toFixed(2));
  // Si ya está en descuento y cambia el precio, sigue siendo descuento (salvo que lo desmarque)
  const [descuento, setDescuento] = useState(enDescuento);
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => campo.current?.select(), 50);
    return () => clearTimeout(t);
  }, []);

  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isFinite(n) && n >= 0 && n < 10000;
  // Precio de siempre (si ya estaba en descuento, el de antes del descuento)
  const normal = p.precioNormal ?? p.precio;
  const descuentoValido = !descuento || (valido && n < normal);

  async function guardar(precio: number, esDescuento: boolean) {
    if (guardando) return;
    if (Math.round(precio * 100) === Math.round(p.precio * 100) && esDescuento === enDescuento) return cerrar();
    setGuardando(true);
    const r = await guardarRegistro([{ id: p.id, precio, ...(esDescuento ? { descuento: true } : {}) }]);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    if (r.errores.length) return avisar(r.errores[0].error, "error");
    avisar(esDescuento ? `${p.nombre}: en descuento a ${soles(precio)} (normal ${soles(normal)})` : `${p.nombre}: precio ${soles(precio)}`);
    cerrar();
  }
  const aceptar = () => valido && descuentoValido && guardar(n, descuento);

  return (
    <Modal abierto onCerrar={cerrar} titulo="Cambiar precio" subtitulo={`${p.nombre} · ahora ${soles(p.precio)}`}>
      {enDescuento && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-azul-50 px-3 py-2 text-sm text-azul">
          <span className="flex items-center gap-1.5">
            <BadgePercent className="h-4 w-4 shrink-0" /> En descuento · normal {soles(normal)}
          </span>
          <button
            type="button"
            onClick={() => guardar(normal, false)}
            disabled={guardando}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-azul ring-1 ring-azul/30"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Volver a {soles(normal)}
          </button>
        </div>
      )}
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

      {/* Opcional: marcar que es un descuento de unos días */}
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-suave">
        <input type="checkbox" checked={descuento} onChange={(e) => setDescuento(e.target.checked)} className="mt-0.5" />
        <span>
          Es un descuento <span className="text-xs">(por unos días, para que no se pierda)</span>
          {descuento && (
            <span className={`mt-0.5 block text-xs ${descuentoValido ? "text-azul" : "text-rojo"}`}>
              {descuentoValido ? `Se guarda el precio normal ${soles(normal)} para volver después.` : `El descuento debe ser menor a ${soles(normal)}.`}
            </span>
          )}
        </span>
      </label>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={aceptar} disabled={guardando || !valido || !descuentoValido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Aceptar"}
        </button>
      </div>
    </Modal>
  );
}
