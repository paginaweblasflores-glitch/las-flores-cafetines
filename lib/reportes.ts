import "server-only";
import { obtenerEfectosDesde, obtenerStock, obtenerVentas } from "./data";
import { diaSemana, hoyISO, rangoMes } from "./format";

export type FilaMensual = {
  productoId: number;
  producto: string;
  categoria: string;
  stockInicial: number;
  dias: number[]; // unidades vendidas por día (índice 0 = día 1)
  vendido: number;
  precio: number;
  monto: number;
  ganancia: number;
  stockFinal: number;
};

/** Arma la tabla mensual tipo "INVENTARIO.xlsx": productos x días */
export async function reporteMensual(colegioId: number, mes: string) {
  const { desde, hasta, dias } = rangoMes(mes);
  const [stock, ventas, efectos] = await Promise.all([
    obtenerStock({ colegioId, incluirInactivos: true }),
    obtenerVentas(desde, hasta, colegioId),
    obtenerEfectosDesde(desde, colegioId),
  ]);

  // stock al inicio del mes = stock actual - todo lo que pasó desde el día 1
  // stock al final del mes  = stock actual - todo lo que pasó después del último día
  const desdeInicio = new Map<number, number>();
  const despuesFin = new Map<number, number>();
  for (const e of efectos) {
    desdeInicio.set(e.producto_id, (desdeInicio.get(e.producto_id) ?? 0) + e.efecto_stock);
    if (e.fecha > hasta) despuesFin.set(e.producto_id, (despuesFin.get(e.producto_id) ?? 0) + e.efecto_stock);
  }

  const conVentas = new Set(ventas.map((v) => v.producto_id));
  const filas: FilaMensual[] = stock
    .filter((s) => (s.activo && s.producto_activo) || conVentas.has(s.producto_id))
    .map((s) => {
      const d = new Array(dias).fill(0);
      let monto = 0;
      let ganancia = 0;
      for (const v of ventas) {
        if (v.producto_id !== s.producto_id) continue;
        d[Number(v.fecha.slice(8, 10)) - 1] += Number(v.unidades);
        monto += Number(v.monto);
        ganancia += Number(v.ganancia);
      }
      return {
        productoId: s.producto_id,
        producto: s.producto,
        categoria: s.categoria ?? "Otros",
        stockInicial: s.total_unidades - (desdeInicio.get(s.producto_id) ?? 0),
        dias: d,
        vendido: d.reduce((a, b) => a + b, 0),
        precio: Number(s.precio_venta),
        monto,
        ganancia,
        stockFinal: s.total_unidades - (despuesFin.get(s.producto_id) ?? 0),
      };
    });

  const hoy = hoyISO();
  const columnas = Array.from({ length: dias }, (_, i) => {
    const fecha = `${mes}-${String(i + 1).padStart(2, "0")}`;
    const ds = diaSemana(fecha);
    return { dia: i + 1, fecha, finDeSemana: ds === 0 || ds === 6, esHoy: fecha === hoy, futuro: fecha > hoy };
  });
  const montoPorDia = columnas.map((c) =>
    ventas.filter((v) => v.fecha === c.fecha).reduce((a, v) => a + Number(v.monto), 0),
  );

  return { filas, columnas, montoPorDia };
}
