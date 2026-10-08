"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { regenerarReporte } from "@/app/actions/reportes";
import { avisar } from "@/components/ui";

/** Vuelve a calcular un mes cerrado (si se corrigió algo de ese mes); pregunta antes */
export function RegenerarReporte({ mes }: { mes: string }) {
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    const r = await regenerarReporte(mes);
    setOcupado(false);
    setPreguntando(false);
    if (r.ok) avisar(r.mensaje ?? "Generado");
    else avisar(r.error, "error");
  }

  if (!preguntando) {
    return (
      <button onClick={() => setPreguntando(true)} className="flex items-center gap-1 text-xs text-suave hover:text-tinta">
        <RefreshCw className="h-3.5 w-3.5" /> Volver a generar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="text-suave">¿Reemplazar con los datos de hoy?</span>
      <button onClick={confirmar} disabled={ocupado} className="font-medium text-verde-700 hover:underline">
        {ocupado ? "Generando..." : "Sí"}
      </button>
      <button onClick={() => setPreguntando(false)} disabled={ocupado} className="text-suave hover:underline">
        No
      </button>
    </span>
  );
}
