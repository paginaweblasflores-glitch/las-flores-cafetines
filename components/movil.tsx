"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, LayoutDashboard, LogOut } from "lucide-react";
import { cerrarSesion } from "@/app/actions/auth";

/** Barra superior limpia de las pantallas de celular: volver · título · extra */
export function BarraSuperiorMovil({
  titulo,
  volverAlPanel,
  alVolver,
  derecha,
}: {
  titulo: string;
  /** Vuelve a la pantalla anterior dentro de la app (tiene prioridad sobre volver al panel) */
  alVolver?: () => void;
  /** Administración/logística pueden volver al panel */
  volverAlPanel?: boolean;
  derecha?: ReactNode;
}) {
  return (
    <div className="grid h-14 grid-cols-[2.5rem_1fr_auto] items-center gap-2">
      {alVolver ? (
        <button
          onClick={alVolver}
          className="grid h-10 w-10 place-items-center rounded-xl border border-borde bg-white text-tinta"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : volverAlPanel ? (
        <Link
          href="/dashboard"
          className="grid h-10 w-10 place-items-center rounded-xl border border-borde bg-white text-tinta"
          title="Volver al panel"
          aria-label="Volver al panel"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
      <h1 className="truncate text-center text-base font-semibold">{titulo}</h1>
      <div className="flex min-w-10 justify-end text-sm text-suave">{derecha}</div>
    </div>
  );
}

/** Pantalla de menú/perfil: logo, opciones y cerrar sesión (quién es ya se sabe: es su pantalla) */
export function PerfilMovil({
  fecha,
  volverAlPanel,
  children,
}: {
  fecha: string;
  volverAlPanel?: boolean;
  /** Opciones extra (por ejemplo, elegir colegio) */
  children?: ReactNode;
}) {
  return (
    <div className="pt-2">
      <div className="flex flex-col items-center py-4 text-center">
        <span className="rounded-full bg-white p-1 shadow-sm ring-1 ring-borde">
          <Image src="/logo.png" alt="Las Flores" width={88} height={88} className="h-20 w-20" />
        </span>
        <p className="mt-3 font-semibold">Restaurante Las Flores</p>
        <p className="text-xs text-suave first-letter:uppercase">{fecha}</p>
      </div>


      {children}

      {volverAlPanel && (
        <Link href="/dashboard" className="card mt-3 flex items-center gap-3 p-4 font-medium">
          <LayoutDashboard className="h-5 w-5 text-suave" />
          Volver al panel
        </Link>
      )}

      <form action={cerrarSesion} className="mt-6">
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-rojo/30 bg-white font-medium text-rojo hover:bg-rojo-50">
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
