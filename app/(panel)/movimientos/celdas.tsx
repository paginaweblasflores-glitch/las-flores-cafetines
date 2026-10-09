import { numero, soles } from "@/lib/format";

/** Unidades con signo y color: + entra al stock (verde), − sale (rojo) */
export function Cantidad({ n }: { n: number | null }) {
  if (n === null) return <span className="text-suave">—</span>;
  return (
    <span className={n > 0 ? "text-verde-600" : n < 0 ? "text-rojo" : "text-suave"}>
      {n > 0 ? "+" : n < 0 ? "−" : ""}
      {numero(Math.abs(n))}
    </span>
  );
}

/** Cambio de precio: anterior tachado → nuevo */
export function Precio({ p }: { p: { antes: number; despues: number } }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-suave line-through">{soles(p.antes)}</span>{" "}
      <span className={p.despues >= p.antes ? "text-verde-700" : "text-rojo"}>→ {soles(p.despues)}</span>
    </span>
  );
}
