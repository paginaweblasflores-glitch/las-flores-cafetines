"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { corregirEntrega } from "@/app/actions/envios";
import { avisar, Modal } from "@/components/ui";
import { numero } from "@/lib/format";

type Entrega = {
  id: number;
  producto: string;
  estado: "PENDIENTE" | "CONFORME" | "OBSERVADO";
  enviada: number;
  recibida: number | null;
  cajas: number;
  unidadesPorCaja: number | null;
  sueltas: number;
  /** Nombre de la caja o paquete ("caja", "paquete"…) */
  nombreCaja: string;
};

const soloDigitos = (v: string) => v.replace(/\D/g, "");

/** Logística corrige cuánto entregó, aunque ya lo hayan recibido: el sistema ajusta el stock */
export function CorregirEntrega({ e }: { e: Entrega }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="flex items-center gap-1 text-xs font-medium text-verde-700 hover:underline">
        <Pencil className="h-3 w-3" /> Corregir
      </button>
      {abierto && <HojaCorregir e={e} cerrar={() => setAbierto(false)} />}
    </>
  );
}

function HojaCorregir({ e, cerrar }: { e: Entrega; cerrar: () => void }) {
  const [cajas, setCajas] = useState(String(e.cajas));
  const [porCaja, setPorCaja] = useState(String(e.unidadesPorCaja ?? ""));
  const [sueltas, setSueltas] = useState(String(e.sueltas));
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const n = (v: string) => (v === "" ? 0 : Number(v));
  const nuevo = n(cajas) * n(porCaja) + n(sueltas);
  const faltaPorCaja = n(cajas) > 0 && n(porCaja) < 1;
  const menorQueLlego = e.estado === "OBSERVADO" && e.recibida != null && nuevo < e.recibida;
  const recibida = e.estado !== "PENDIENTE";
  const valido = nuevo > 0 && !faltaPorCaja && !menorQueLlego && nuevo !== e.enviada;

  // Qué va a pasar, en palabras simples
  let efecto: string;
  if (nuevo === e.enviada) efecto = "Es la misma cantidad.";
  else if (e.estado === "PENDIENTE") efecto = `Queda en ${numero(nuevo)} unidades. Todavía no la reciben, así que el stock no cambia.`;
  else if (e.estado === "CONFORME") {
    const dif = nuevo - (e.recibida ?? 0);
    efecto = `Ya la recibieron: el stock del colegio ${dif > 0 ? "sube" : "baja"} ${numero(Math.abs(dif))} unidades y queda como ajuste en el Historial.`;
  } else if (menorQueLlego) efecto = `Ya llegaron ${numero(e.recibida ?? 0)}: no puede ser menos que eso.`;
  else if (nuevo === e.recibida) efecto = "Coincide con lo que llegó: la entrega pasa a conforme. El stock no cambia.";
  else efecto = `Llegaron ${numero(e.recibida ?? 0)}. Cambia lo enviado; el stock no cambia.`;

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    const r = await corregirEntrega(e.id, {
      cajas: n(cajas),
      unidadesPorCaja: n(cajas) > 0 ? n(porCaja) : null,
      sueltas: n(sueltas),
      nota: recibida ? nota : "",
    });
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(r.mensaje ?? "Entrega corregida");
    cerrar();
  }

  const campo = "input h-12 text-center text-xl font-semibold";
  return (
    <Modal abierto onCerrar={cerrar} titulo={`Corregir: ${e.producto}`} subtitulo={`Registrado: ${numero(e.enviada)} unidades`}>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="label capitalize">{e.nombreCaja}s</span>
          <input inputMode="numeric" value={cajas} onChange={(v) => setCajas(soloDigitos(v.target.value))} className={campo} />
        </label>
        <label className="block">
          <span className="label">Unid. por {e.nombreCaja}</span>
          <input inputMode="numeric" value={porCaja} onChange={(v) => setPorCaja(soloDigitos(v.target.value))} className={campo} />
        </label>
        <label className="block">
          <span className="label">Sueltas</span>
          <input inputMode="numeric" value={sueltas} onChange={(v) => setSueltas(soloDigitos(v.target.value))} className={campo} />
        </label>
      </div>
      <p className="mt-2 text-sm">
        Total correcto: <b>{numero(nuevo)}</b> unidades
        {nuevo !== e.enviada && <span className="text-suave"> (antes {numero(e.enviada)})</span>}
      </p>
      {faltaPorCaja && <p className="mt-1 text-sm text-rojo">Indica cuántas unidades trae cada {e.nombreCaja}.</p>}

      {/* Ya la recibieron: queda anotada; el detalle es opcional */}
      {recibida && (
        <label className="mt-4 block">
          <span className="label">Detalle (opcional)</span>
          <input value={nota} onChange={(v) => setNota(v.target.value)} className="input" placeholder="Ej: registré 10 cajas pero fueron 9" />
        </label>
      )}

      {nuevo !== e.enviada && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${menorQueLlego ? "chip-critico" : recibida ? "chip-atencion" : "chip-neutro"}`}>
          {efecto}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || !valido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
