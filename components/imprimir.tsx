"use client";

import { Printer } from "lucide-react";

export function BotonImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return (
    <button onClick={() => window.print()} className="btn-secundario print:hidden">
      <Printer className="h-4 w-4" /> {texto}
    </button>
  );
}
