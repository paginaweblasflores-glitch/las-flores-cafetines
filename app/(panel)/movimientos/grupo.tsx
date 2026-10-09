"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

/** Fila de la tabla que, si tiene varios productos, abre su página de detalle al tocarla */
export function FilaEnlace({ href, children }: { href: string | null; children: ReactNode }) {
  const router = useRouter();
  if (!href) return <tr>{children}</tr>;
  return (
    <tr onClick={() => router.push(href)} className="cursor-pointer">
      {children}
    </tr>
  );
}
