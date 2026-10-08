"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { anularEnvio } from "@/app/actions/envios";
import { avisar } from "@/components/ui";

/** Anula una entrega que el colegio todavía no recibió (por ejemplo, si se registró por error) */
export function AnularEntrega({ id, producto }: { id: number; producto: string }) {
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function anular() {
    setOcupado(true);
    const r = await anularEnvio(id);
    setOcupado(false);
    setPreguntando(false);
    if (r.ok) avisar(`${producto}: entrega anulada`);
    else avisar(r.error, "error");
  }

  if (!preguntando) {
    return (
      <button onClick={() => setPreguntando(true)} className="flex items-center gap-1 text-xs text-rojo hover:underline">
        <X className="h-3 w-3" /> Anular
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-suave">¿Anular?</span>
      <button onClick={anular} disabled={ocupado} className="font-medium text-rojo hover:underline">
        {ocupado ? "Anulando..." : "Sí"}
      </button>
      <button onClick={() => setPreguntando(false)} disabled={ocupado} className="text-suave hover:underline">
        No
      </button>
    </span>
  );
}
