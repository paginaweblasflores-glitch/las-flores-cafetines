import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ListTodo } from "lucide-react";

export type Tarea = {
  texto: ReactNode;
  detalle?: ReactNode;
  href: string;
  /** Lo que dice el botón: "Revisar", "Comprar"… */
  accion: string;
  /** critico: algo salió mal · atencion: hay que hacerlo · info: para tener en cuenta */
  tono: "critico" | "atencion" | "info";
};

const PUNTO: Record<Tarea["tono"], string> = { critico: "bg-rojo", atencion: "bg-ambar", info: "bg-azul" };
const ORDEN: Record<Tarea["tono"], number> = { critico: 0, atencion: 1, info: 2 };

/**
 * "Para hoy": lo primero que ve cada persona al entrar. Solo lo que le toca hacer, con el botón
 * que la lleva a resolverlo. Si no hay nada, dice "Todo al día" y no estorba.
 */
export function ParaHoy({ tareas, accion }: { tareas: Tarea[]; accion?: ReactNode }) {
  const lista = [...tareas].sort((a, b) => ORDEN[a.tono] - ORDEN[b.tono]);
  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-medium">
          <ListTodo className="h-4 w-4 text-suave" /> Para hoy
          {lista.length > 0 && <span className="chip chip-atencion">{lista.length}</span>}
        </h2>
        {accion}
      </div>
      {lista.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-verde-700">
          <CheckCircle2 className="h-4 w-4" /> Todo al día: no tienes pendientes.
        </p>
      ) : (
        <ul className="divide-y divide-borde">
          {lista.map((t, i) => (
            <li key={i}>
              <Link href={t.href} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#f7f9f8]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[t.tono]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.texto}</span>
                  {t.detalle && <span className="block truncate text-xs text-suave">{t.detalle}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-verde-700">
                  {t.accion} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
