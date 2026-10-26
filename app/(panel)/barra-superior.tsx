"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { EVENTO_MENU } from "./barra-lateral";

/**
 * Solo en celular y tablet: botón del menú y la marca. En PC el menú lateral siempre se ve
 * (con el perfil al final) y la pantalla queda libre para el trabajo.
 */
export function BarraSuperior() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-borde bg-fondo/90 px-3 backdrop-blur lg:hidden print:hidden">
      <button
        onClick={() => window.dispatchEvent(new Event(EVENTO_MENU))}
        className="rounded-lg p-2 text-tinta hover:bg-white"
        aria-label="Abrir menú"
      >
        <Menu className="h-6 w-6" />
      </button>
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="rounded-full bg-white p-0.5 ring-1 ring-borde">
          <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7" />
        </span>
        <span className="font-marca text-sm font-semibold tracking-wide">LAS FLORES</span>
      </Link>
    </header>
  );
}
