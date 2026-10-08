"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";

export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rojo-50 text-rojo">
          <CircleAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Algo salió mal</h1>
        <p className="mt-2 text-sm break-words text-suave">{error.message || "Error inesperado."}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="btn-primario">
            Reintentar
          </button>
          <Link href="/" className="btn-secundario">
            Ir al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
