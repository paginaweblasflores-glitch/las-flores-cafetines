import type { Envio } from "./data";

/** Una entrega de logística o un envío de cocina: los productos que salieron juntos */
export type Lote = {
  /** Para la URL: el lote, o "e<id>" en envíos antiguos sin lote */
  clave: string;
  origen: Envio["origen"];
  fecha: string;
  creado: string;
  colegioId: number;
  enviadoPor: number | null;
  nota: string | null;
  items: Envio[];
  porRecibir: number;
  observados: number;
};

export const claveLote = (e: Envio) => e.lote ?? `e${e.id}`;

/** Agrupa envíos por lote (sin los anulados), del más reciente al más antiguo */
export function agruparLotes(envios: Envio[]): Lote[] {
  const lotes = new Map<string, Lote>();
  for (const e of envios) {
    if (e.estado === "ANULADO") continue;
    const k = claveLote(e);
    let l = lotes.get(k);
    if (!l) {
      l = {
        clave: k,
        origen: e.origen,
        fecha: e.fecha,
        creado: e.created_at,
        colegioId: e.colegio_id,
        enviadoPor: e.enviado_por,
        nota: e.observacion,
        items: [],
        porRecibir: 0,
        observados: 0,
      };
      lotes.set(k, l);
    }
    l.items.push(e);
    if (e.estado === "PENDIENTE") l.porRecibir++;
    if (e.estado === "OBSERVADO") l.observados++;
  }
  return [...lotes.values()].sort((a, b) => b.creado.localeCompare(a.creado));
}

/** Estado de toda la entrega para la tabla */
export function estadoLote(l: Pick<Lote, "items" | "porRecibir" | "observados">) {
  if (l.porRecibir === l.items.length) return { texto: "Por recibir", clase: "bg-fondo text-suave" };
  if (l.porRecibir > 0) return { texto: `Faltan ${l.porRecibir} por recibir`, clase: "bg-fondo text-suave" };
  if (l.observados > 0) return { texto: "Con observación", clase: "bg-ambar-50 text-[#8a5a00]" };
  return { texto: "Conforme", clase: "bg-verde-50 text-verde-700" };
}

export const ESTADO_ENVIO = {
  PENDIENTE: { texto: "Por recibir", clase: "bg-fondo text-suave" },
  CONFORME: { texto: "Conforme", clase: "bg-verde-50 text-verde-700" },
  OBSERVADO: { texto: "Con observación", clase: "bg-ambar-50 text-[#8a5a00]" },
  ANULADO: { texto: "Anulado", clase: "bg-fondo text-suave" },
} as const;

/**
 * "Envío de cocina: enviaron 50, llegaron 45 (Llegó aplastado o dañado)"
 *   → "Envío de cocina: enviaron 50, llegaron 45 (5 Llegó aplastado o dañado)"
 * Agrega cuántas unidades faltaron al motivo (vale también para los registros ya guardados).
 */
export function textoObservacion(obs: string) {
  return obs.replace(/enviaron (\d+), llegaron (\d+) \((?!\d)/, (t, env: string, lleg: string) => `${t}${Number(env) - Number(lleg)} `);
}
