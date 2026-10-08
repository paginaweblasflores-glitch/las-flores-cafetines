"use client";

import { useState } from "react";
import { Check, CheckCheck, ChefHat, MessageSquareWarning, Truck } from "lucide-react";
import { recibirConforme, recibirEnvio } from "@/app/actions/envios";
import { avisar } from "@/components/ui";
import { fechaCorta, fechaISOLima, horaLima, numero } from "@/lib/format";

export type EnvioPorRecibir = {
  id: number;
  /** Productos que salieron juntos */
  lote: string | null;
  /** COCINA = del día · LOGISTICA = semanal */
  origen: "COCINA" | "LOGISTICA";
  producto: string;
  /** Unidades enviadas */
  cantidad: number;
  /** Cómo viene (solo logística): "2 cajas de 24 + 5 sueltas" */
  detalle: string | null;
  hora: string;
  enviadoPor: string | null;
  nota: string | null;
};

const MOTIVOS = ["No llegó completo", "Llegó aplastado o dañado", "Otro"];

/** Lo que llegó al cafetín: envíos de cocina (del día) y entregas de logística (semanal) */
export function RecepcionEnvios({ envios }: { envios: EnvioPorRecibir[] }) {
  const secciones = [
    { origen: "COCINA" as const, titulo: "Del día", sub: "de cocina", icono: ChefHat, vacio: "Nada por recibir de cocina." },
    { origen: "LOGISTICA" as const, titulo: "Semanal", sub: "de logística", icono: Truck, vacio: "Nada por recibir de logística." },
  ];
  return (
    <div className="space-y-6">
      {secciones.map((s) => {
        const delOrigen = envios.filter((e) => e.origen === s.origen);
        // Agrupa por lote (lo que salió junto); los envíos antiguos sin lote van solos
        const lotes = new Map<string, EnvioPorRecibir[]>();
        for (const e of delOrigen) {
          const k = e.lote ?? `e${e.id}`;
          lotes.set(k, [...(lotes.get(k) ?? []), e]);
        }
        const Icono = s.icono;
        return (
          <section key={s.origen}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Icono className="h-4 w-4 text-verde-700" />
              {s.titulo} <span className="font-normal text-suave">· {s.sub}</span>
              {delOrigen.length > 0 && (
                <span className="rounded-full bg-ambar px-1.5 text-xs leading-5 text-white">{delOrigen.length}</span>
              )}
            </h2>
            {lotes.size === 0 ? (
              <p className="card p-4 text-center text-sm text-suave">{s.vacio}</p>
            ) : (
              <div className="space-y-3">
                {[...lotes.entries()].map(([k, items]) => (
                  <Lote key={k} items={items} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Un envío o entrega: varios productos, se confirma todo junto o se observa uno */
function Lote({ items }: { items: EnvioPorRecibir[] }) {
  const [guardando, setGuardando] = useState(false);
  const primero = items[0];
  const total = items.reduce((a, e) => a + e.cantidad, 0);

  async function todoConforme() {
    setGuardando(true);
    const r = await recibirConforme(items.map((e) => e.id));
    setGuardando(false);
    if (r.ok) avisar(r.mensaje ?? "Recibido");
    else avisar(r.error, "error");
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-borde bg-[#fafbfa] px-4 py-3">
        <p className="text-sm font-medium">
          {primero.origen === "LOGISTICA" ? "Entrega" : "Envío"}
          {primero.enviadoPor ? ` de ${primero.enviadoPor}` : ""}
        </p>
        <p className="text-xs text-suave">
          {fechaCorta(fechaISOLima(primero.hora))} {horaLima(primero.hora)} · {items.length} producto
          {items.length === 1 ? "" : "s"} · {numero(total)} unid.
        </p>
        {primero.nota && <p className="mt-1 text-xs text-tinta">Nota: {primero.nota}</p>}
      </div>
      <ul className="divide-y divide-borde">
        {items.map((e) => (
          <FilaEnvio key={e.id} envio={e} bloqueado={guardando} />
        ))}
      </ul>
      <div className="border-t border-borde p-3">
        <button onClick={todoConforme} disabled={guardando} className="btn-primario h-12 w-full text-base">
          <CheckCheck className="h-5 w-5" />
          {guardando ? "Guardando..." : items.length === 1 ? "Llegó conforme" : `Todo llegó conforme (${items.length})`}
        </button>
      </div>
    </div>
  );
}

/** Un producto del envío: si algo falló se registra cuántos llegaron y por qué */
function FilaEnvio({ envio: e, bloqueado }: { envio: EnvioPorRecibir; bloqueado: boolean }) {
  const [observando, setObservando] = useState(false);
  const [llegaron, setLlegaron] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [otro, setOtro] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cantidad = llegaron.trim() === "" ? NaN : Number(llegaron);
  const textoMotivo = motivo === "Otro" ? otro.trim() : motivo;
  const cantidadValida = Number.isInteger(cantidad) && cantidad >= 0 && cantidad < e.cantidad;

  async function guardar() {
    setGuardando(true);
    const r = await recibirEnvio(e.id, cantidad, textoMotivo);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(`${e.producto}: recibidas ${r.recibido} de ${e.cantidad} (queda registrado)`);
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{e.producto}</p>
          <p className="text-xs text-suave">
            {numero(e.cantidad)} unid.{e.detalle ? ` · ${e.detalle}` : ""}
          </p>
        </div>
        {!observando && (
          <button
            onClick={() => setObservando(true)}
            disabled={bloqueado}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#8a5a00] hover:bg-ambar-50"
          >
            <MessageSquareWarning className="h-4 w-4" /> Observación
          </button>
        )}
      </div>

      {observando && (
        <div className="mt-3 rounded-xl border border-dashed border-ambar/60 p-3">
          <div className="grid grid-cols-[1fr_1.5fr] gap-3">
            <label className="block">
              <span className="label">¿Cuántas llegaron?</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max={e.cantidad - 1}
                value={llegaron}
                onChange={(ev) => setLlegaron(ev.target.value)}
                placeholder={`de ${e.cantidad}`}
                className="input h-11 text-center text-lg font-semibold placeholder:text-sm placeholder:font-normal"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="label">Motivo</span>
              <select value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className="input h-11">
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {motivo === "Otro" && (
            <input
              value={otro}
              onChange={(ev) => setOtro(ev.target.value)}
              className="input mt-2"
              placeholder="Escribe el motivo"
              aria-label="Otro motivo"
            />
          )}
          {llegaron !== "" && !cantidadValida && (
            <p className="mt-2 text-xs text-rojo">
              Escribe un número de 0 a {e.cantidad - 1}. Si llegó todo, usa &quot;Llegó conforme&quot;.
            </p>
          )}
          {cantidadValida && (
            <p className="mt-2 text-xs text-[#8a5a00]">
              Entran {cantidad} al cafetín. Faltan {e.cantidad - cantidad} ({textoMotivo || "sin motivo"}).
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => setObservando(false)} disabled={guardando} className="btn-secundario h-11 flex-1">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={guardando || !cantidadValida || !textoMotivo}
              className="btn-primario h-11 flex-1 disabled:bg-borde disabled:text-suave disabled:opacity-100"
            >
              <Check className="h-4 w-4" />
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
