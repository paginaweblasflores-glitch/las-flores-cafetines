import { fechaISOLima } from "@/lib/format";
import { textoObservacion } from "@/lib/entregas";
import type { CambioPrecio } from "@/lib/data";
import type { Movimiento, TipoMovimiento } from "@/lib/types";

/** Armado y agrupación del Historial (lo usan la lista y la página de detalle) */

export type Tipo = TipoMovimiento | "PRECIO";

export const TIPOS: Record<Tipo, { texto: string; clase: string }> = {
  VENTA: { texto: "Venta", clase: "bg-verde-50 text-verde-700" },
  INGRESO: { texto: "Entrega", clase: "bg-[#e8f0fb] text-[#2b5ea7]" },
  AJUSTE: { texto: "Ajuste", clase: "bg-ambar-50 text-[#8a5a00]" },
  MERMA: { texto: "Merma", clase: "bg-rojo-50 text-rojo" },
  PRECIO: { texto: "Cambio de precio", clase: "bg-[#f1ebfa] text-[#6a3fb0]" },
};

/**
 * Filtro "Tipo" del Historial, con los mismos nombres que se ven en la tabla.
 * db: tipo que se pide a la base (null = todos); incluye: qué filas quedan.
 */
export const FILTROS: Record<string, { texto: string; db: TipoMovimiento | null; precios: boolean; incluye: (f: Fila) => boolean }> = {
  venta: { texto: "Venta", db: "VENTA", precios: false, incluye: (f) => f.tipo === "VENTA" },
  cocina: { texto: "Envío de cocina", db: "INGRESO", precios: false, incluye: (f) => f.etiqueta === "Envío de cocina" },
  entrega: {
    texto: "Entrega de logística",
    db: "INGRESO",
    precios: false,
    incluye: (f) => f.etiqueta === "Entrega recibida" || f.etiqueta === TIPOS.INGRESO.texto,
  },
  ajuste: { texto: "Ajuste", db: null, precios: false, incluye: (f) => f.tipo === "AJUSTE" },
  merma: { texto: "Merma", db: "MERMA", precios: false, incluye: (f) => f.tipo === "MERMA" },
  precio: { texto: "Cambio de precio", db: null, precios: true, incluye: (f) => f.tipo === "PRECIO" },
};

// Lo que se registra junto (un envío, un conteo, una entrega) queda a pocos minutos de distancia
const PAUSA_MIN = 15;

/** Un movimiento de stock o un cambio de precio */
export type Fila = {
  clave: string;
  fecha: string;
  hora: string;
  tipo: Tipo;
  etiqueta: string;
  colegioId: number;
  usuarioId: number | null;
  producto: string;
  /** Efecto en el stock (+ entra, − sale); null en cambios de precio */
  cantidad: number | null;
  monto: number | null;
  precio: { antes: number; despues: number } | null;
  stock: number | null;
  detalle: string | null;
};

/** Lo que se registró junto: mismo día, colegio, tipo y usuario, sin pausas de más de PAUSA_MIN minutos */
export type Grupo = {
  clave: string;
  fecha: string;
  hora: string;
  tipo: Tipo;
  etiqueta: string;
  colegioId: number;
  usuarioId: number | null;
  items: Fila[];
};

export function armarFilas(movs: Movimiento[], precios: CambioPrecio[], producto: (id: number) => string): Fila[] {
  return [
    ...movs.map((m): Fila => {
      const recibidoPersonal = m.tipo === "INGRESO" && m.observacion?.startsWith("Recibido en el cafetín");
      const deCocina = m.tipo === "INGRESO" && m.observacion?.startsWith("Envío de cocina");
      const deLogistica = m.tipo === "INGRESO" && m.observacion?.startsWith("Entrega de logística");
      const etiqueta = deCocina
        ? "Envío de cocina"
        : deLogistica
        ? "Entrega recibida"
        : recibidoPersonal
        ? "Recibido (personal)"
        : m.tipo === "VENTA" && m.cantidad < 0
          ? "Corrección"
          : TIPOS[m.tipo].texto;
      return {
        clave: `m${m.id}`,
        fecha: m.fecha,
        hora: m.created_at,
        tipo: recibidoPersonal ? "AJUSTE" : m.tipo,
        etiqueta,
        colegioId: m.colegio_id,
        usuarioId: m.usuario_id,
        producto: producto(m.producto_id),
        cantidad: m.efecto_stock,
        monto: Number(m.monto) !== 0 ? Number(m.monto) : null,
        precio: null,
        stock: m.stock_resultante ?? null,
        // Entregas: detalle de cajas, por ejemplo "4 × 24 + 5 sueltas"
        detalle:
          m.tipo === "INGRESO" && m.cajas > 0
            ? [`${m.cajas} × ${m.unidades_por_caja ?? "?"}${m.cantidad - m.cajas * (m.unidades_por_caja ?? 0) > 0 ? ` + ${m.cantidad - m.cajas * (m.unidades_por_caja ?? 0)} sueltas` : ""}`, m.observacion && textoObservacion(m.observacion)]
                .filter(Boolean)
                .join(" · ")
            : m.observacion && textoObservacion(m.observacion),
      };
    }),
    ...precios.map(
      (c): Fila => ({
        clave: `p${c.id}`,
        fecha: fechaISOLima(c.created_at),
        hora: c.created_at,
        tipo: "PRECIO",
        etiqueta: TIPOS.PRECIO.texto,
        colegioId: c.colegio_id,
        usuarioId: c.usuario_id,
        producto: producto(c.producto_id),
        cantidad: null,
        monto: null,
        precio: { antes: Number(c.precio_anterior), despues: Number(c.precio_nuevo) },
        stock: null,
        detalle: "Precio de venta por unidad",
      }),
    ),
  ].sort((a, b) => (a.hora < b.hora ? 1 : a.hora > b.hora ? -1 : a.clave < b.clave ? 1 : -1));
}

/** filas: ordenadas de la más nueva a la más antigua (como las devuelve armarFilas) */
export function agrupar(filas: Fila[]): Grupo[] {
  const grupos: Grupo[] = [];
  const abiertos = new Map<string, { g: Grupo; ultimo: number }>();
  for (const f of filas) {
    const llave = `${f.fecha}|${f.colegioId}|${f.etiqueta}|${f.usuarioId ?? ""}`;
    const t = new Date(f.hora).getTime();
    const actual = abiertos.get(llave);
    if (actual && actual.ultimo - t <= PAUSA_MIN * 60_000) {
      actual.g.items.push(f);
      actual.ultimo = t;
      continue;
    }
    const g: Grupo = {
      clave: f.clave,
      fecha: f.fecha,
      hora: f.hora,
      tipo: f.tipo,
      etiqueta: f.etiqueta,
      colegioId: f.colegioId,
      usuarioId: f.usuarioId,
      items: [f],
    };
    grupos.push(g);
    abiertos.set(llave, { g, ultimo: t });
  }
  // Dentro de cada grupo, los productos en orden alfabético
  for (const g of grupos) g.items.sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  return grupos;
}

/** Totales de un grupo (null si ningún producto tiene ese dato) */
export function totales(g: Grupo) {
  const suma = (f: (i: Fila) => number | null) => {
    const v = g.items.map(f).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const detalles = new Set(g.items.map((i) => i.detalle ?? ""));
  return {
    cantidad: suma((i) => i.cantidad),
    monto: suma((i) => i.monto),
    // Detalle común a todos (por ejemplo "Envío de cocina: recibido conforme")
    detalle: detalles.size === 1 ? g.items[0].detalle : null,
  };
}
