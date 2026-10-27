"use client";

import { useState } from "react";
import { CheckCircle2, Lock, Pencil, Wallet } from "lucide-react";
import { registrarCaja } from "@/app/actions/personal";
import { avisar } from "@/components/ui";
import { horaLima, soles } from "@/lib/format";

export type CajaHoy = { fisico: number; sistema: number; motivo: string | null; hora: string } | null;

const MOTIVOS_RAPIDOS = ["No anoté algunas ventas", "Di vuelto de más", "Pagaron por Yape", "Falta contar un producto"];

/**
 * Caja de hoy: el personal escribe cuánto dinero tiene en efectivo y se compara con
 * la venta de hoy según el sistema. Si no cuadra, escribe el motivo. Se puede corregir hasta la medianoche.
 */
export function CajaDelDia({ ventaSistema, registrada }: { ventaSistema: number; registrada: CajaHoy }) {
  const [fisico, setFisico] = useState(registrada ? registrada.fisico.toFixed(2) : "");
  const [motivo, setMotivo] = useState(registrada?.motivo ?? "");
  const [guardando, setGuardando] = useState(false);
  // Ya registrada: queda cerrada (solo el resumen); "Corregir caja" la vuelve a abrir
  const [corrigiendo, setCorrigiendo] = useState(false);

  const n = fisico.trim() === "" ? NaN : Number(fisico);
  const valido = Number.isFinite(n) && n >= 0 && n < 1000000;
  const dif = valido ? Math.round((n - ventaSistema) * 100) / 100 : 0;
  const cuadra = valido && dif === 0;
  const listo = valido && (cuadra || motivo.trim().length >= 3);

  async function guardar() {
    if (!listo || guardando) return;
    setGuardando(true);
    const r = await registrarCaja(n, cuadra ? null : motivo);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(cuadra ? "Caja registrada: cuadra con el sistema" : "Caja registrada con el motivo");
    setCorrigiendo(false);
  }

  const cerrada = !!registrada && !corrigiendo;

  return (
    <div className="pt-1">
      {/* Lo que dice el sistema */}
      <div className="rounded-2xl bg-gradient-to-br from-verde-700 to-verde-oscuro p-5 text-white">
        <p className="text-xs text-verde-100">Venta de hoy según el sistema</p>
        <p className="text-3xl font-semibold tracking-tight">{soles(ventaSistema)}</p>
        <p className="text-xs text-verde-100">Sale de tus conteos de hoy</p>
      </div>

      {cerrada && registrada ? (
        <div className="card mt-4 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-verde-700">
            <Lock className="h-4 w-4" /> Caja registrada a las {horaLima(registrada.hora)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-fondo px-3 py-2.5">
              <p className="text-[11px] text-suave">En efectivo</p>
              <p className="font-semibold">{soles(registrada.fisico)}</p>
            </div>
            <div className="rounded-xl bg-fondo px-3 py-2.5">
              <p className="text-[11px] text-suave">Diferencia</p>
              {Math.round((registrada.fisico - ventaSistema) * 100) === 0 ? (
                <p className="font-semibold text-verde-700">Cuadra</p>
              ) : (
                <p className="font-semibold text-[#8a5a00]">
                  {registrada.fisico > ventaSistema ? "Sobran " : "Faltan "}
                  {soles(Math.abs(registrada.fisico - ventaSistema))}
                </p>
              )}
            </div>
          </div>
          {registrada.motivo && <p className="mt-2 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">Motivo: {registrada.motivo}</p>}
          <button
            type="button"
            onClick={() => setCorrigiendo(true)}
            className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-suave hover:text-tinta"
          >
            <Pencil className="h-3.5 w-3.5" /> Corregir caja (solo si te equivocaste, hasta la medianoche)
          </button>
        </div>
      ) : (
      <div className="card mt-4 p-4">
        <label className="block">
          <span className="label">¿Cuánto tienes en efectivo? (S/)</span>
          <input
            inputMode="decimal"
            value={fisico}
            onChange={(e) => setFisico(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""))}
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
            className="input h-16 text-center text-3xl font-semibold placeholder:text-suave/40"
            autoFocus={!registrada}
          />
          <span className="mt-1 block text-xs text-suave">Solo el efectivo de las ventas de hoy.</span>
        </label>

        {valido &&
          (cuadra ? (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-verde-50 px-3 py-2 text-sm font-medium text-verde-700">
              <CheckCircle2 className="h-4 w-4" /> Cuadra con el sistema
            </p>
          ) : (
            <>
              <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
                {dif > 0 ? "Sobran" : "Faltan"} <b>{soles(Math.abs(dif))}</b> respecto al sistema
              </p>
              <label className="mt-3 block">
                <span className="label">¿Por qué no cuadra?</span>
                <div className="mb-2 flex flex-wrap gap-2">
                  {MOTIVOS_RAPIDOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivo(m)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${motivo === m ? "bg-panel text-white" : "border border-borde bg-white text-tinta"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  className="input"
                  placeholder="Ej: la chicha no la anoto en mi cuaderno"
                />
              </label>
            </>
          ))}

        <button onClick={guardar} disabled={!listo || guardando} className="btn-primario mt-4 h-12 w-full text-base">
          <Wallet className="h-4 w-4" />
          {guardando ? "Guardando..." : registrada ? "Guardar corrección" : "Guardar caja"}
        </button>
        {registrada && (
          <button type="button" onClick={() => setCorrigiendo(false)} disabled={guardando} className="btn-secundario mt-2 h-11 w-full">
            Cancelar
          </button>
        )}
      </div>
      )}
    </div>
  );
}
