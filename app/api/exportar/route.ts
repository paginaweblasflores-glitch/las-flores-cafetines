import ExcelJS from "exceljs";
import { obtenerSesion } from "@/lib/auth";
import { obtenerColegios, obtenerStock } from "@/lib/data";
import { reporteMensual } from "@/lib/reportes";
import { descPresentacion, hoyISO, mesActual, nombreMes } from "@/lib/format";

const VERDE = "FF3BB54A";
const OSCURO = "FF0F1A14";
const SOLES = '"S/" #,##0.00';

function encabezado(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, columnas: number) {
  ws.mergeCells(1, 1, 1, columnas);
  ws.getCell(1, 1).value = titulo;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: OSCURO } };
  ws.mergeCells(2, 1, 2, columnas);
  ws.getCell(2, 1).value = subtitulo;
  ws.getCell(2, 1).font = { size: 10, color: { argb: "FF6B7770" } };
}

function estiloCabecera(fila: ExcelJS.Row) {
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  fila.height = 30;
}

export async function GET(request: Request) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.rol === "PERSONAL") return new Response("No autorizado", { status: 401 });

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  // Las ventas son de administración
  if (tipo === "ventas" && sesion.rol !== "ADMIN") return new Response("No autorizado", { status: 401 });
  const colegios = await obtenerColegios();
  const colegio = colegios.find((c) => c.id === Number(url.searchParams.get("colegio"))) ?? colegios[0];
  if (!colegio) return new Response("Colegio no encontrado", { status: 404 });

  const libro = new ExcelJS.Workbook();
  libro.creator = "Las Flores - Cafetines";
  let nombreArchivo: string;

  if (tipo === "ventas") {
    const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get("mes") ?? "") ? url.searchParams.get("mes")! : mesActual();
    const { filas, columnas } = await reporteMensual(colegio.id, mes);
    const ws = libro.addWorksheet("Ventas", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });
    const total = 2 + columnas.length + 5; // producto, stock inicial, días, vendido, precio, total, ganancia, stock final
    encabezado(ws, `CONTROL DE VENTAS CAFETÍN · ${colegio.nombre.toUpperCase()}`, nombreMes(mes).toUpperCase(), total);
    const cab = ws.getRow(4);
    cab.values = [
      "PRODUCTO",
      "STOCK INICIAL",
      ...columnas.map((c) => c.dia),
      "VENDIDO",
      "PRECIO",
      "TOTAL",
      "GANANCIA",
      "STOCK FINAL",
    ];
    estiloCabecera(cab);
    filas.forEach((f, i) => {
      const r = ws.getRow(5 + i);
      r.values = [f.producto, f.stockInicial, ...f.dias.map((d) => (d === 0 ? null : d)), f.vendido, f.precio, f.monto, f.ganancia, f.stockFinal];
    });
    const ultima = 4 + filas.length;
    const filaTot = ws.getRow(ultima + 1);
    filaTot.getCell(1).value = "TOTAL";
    const colLetra = (n: number) => ws.getColumn(n).letter;
    for (let c = 3; c <= total; c++) {
      if (c === total - 3 || c === total) continue; // precio y stock final no se suman
      filaTot.getCell(c).value = { formula: `SUM(${colLetra(c)}5:${colLetra(c)}${ultima})` };
    }
    filaTot.font = { bold: true };
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 10;
    for (let c = 3; c < 3 + columnas.length; c++) ws.getColumn(c).width = 5;
    [total - 4, total].forEach((c) => (ws.getColumn(c).width = 10));
    [total - 3, total - 2, total - 1].forEach((c) => {
      ws.getColumn(c).width = 12;
      ws.getColumn(c).numFmt = SOLES;
    });
    nombreArchivo = `Ventas ${colegio.codigo} ${mes}.xlsx`;
  } else {
    const stock = await obtenerStock({ colegioId: colegio.id });
    const ws = libro.addWorksheet("Stock", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
    const cols = [
      ["PRODUCTO", 32],
      ["CATEGORÍA", 14],
      ["PRESENTACIÓN", 16],
      ["UNIDAD POR CAJA/PAQUETE", 12],
      ["STOCK (UNIDADES)", 12],
      ["PRECIO UNIDAD (COSTO)", 12],
      ["PRECIO POR CAJA/PAQUETE", 12],
      ["PRECIO DE VENTA UNIDAD", 12],
      ["VALOR DEL STOCK (VENTA)", 14],
      ["COSTO DEL STOCK", 14],
      ["GANANCIA", 14],
    ] as const;
    encabezado(ws, `CONTROL DE STOCK · ${colegio.nombre.toUpperCase()}`, `Al ${hoyISO().split("-").reverse().join("/")}`, cols.length);
    const cab = ws.getRow(4);
    cab.values = cols.map((c) => c[0]);
    estiloCabecera(cab);
    cols.forEach((c, i) => (ws.getColumn(i + 1).width = c[1]));
    stock.forEach((s, i) => {
      const n = 5 + i;
      ws.getRow(n).values = [
        s.producto,
        s.categoria,
        descPresentacion(s.presentacion, s.unidades_por_presentacion),
        s.unidades_por_presentacion,
        s.total_unidades,
        { formula: `IFERROR(G${n}/D${n},0)`, result: Number(s.costo_unitario) },
        Number(s.costo_presentacion),
        Number(s.precio_venta),
        { formula: `E${n}*H${n}`, result: Number(s.valor_venta_stock) },
        { formula: `E${n}*F${n}`, result: Number(s.valor_costo_stock) },
        { formula: `I${n}-J${n}`, result: Number(s.valor_venta_stock) - Number(s.valor_costo_stock) },
      ];
    });
    const ultima = 4 + stock.length;
    const tot = ws.getRow(ultima + 1);
    tot.getCell(1).value = "TOTAL";
    for (const l of ["E", "I", "J", "K"]) tot.getCell(l).value = { formula: `SUM(${l}5:${l}${ultima})` };
    tot.font = { bold: true };
    for (const l of ["F", "G", "H", "I", "J", "K"]) ws.getColumn(l).numFmt = SOLES;
    nombreArchivo = `Stock ${colegio.codigo} ${hoyISO()}.xlsx`;
  }

  // Las ganancias solo las ve administración: para logística se quita esa columna
  if (sesion.rol !== "ADMIN") {
    libro.eachSheet((ws) => {
      const cab = ws.getRow(4);
      for (let c = cab.cellCount; c >= 1; c--) {
        if (String(cab.getCell(c).value ?? "").toUpperCase().startsWith("GANANCIA")) ws.spliceColumns(c, 1);
      }
    });
  }

  const buffer = await libro.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`,
    },
  });
}
