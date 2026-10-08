import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { DatosCompras, DatosReporte } from "./reporte-mensual";
import { cantidadConUnidad, fechaCorta, fechaISOLima, fechaLarga, nombreMes, numero, soles } from "./format";

// El logo se lee del disco (una ruta "C:\..." de Windows la librería la confunde con una URL)
const LOGO = { data: readFileSync(path.join(process.cwd(), "public", "logo.png")), format: "png" as const };

// Sin cortar palabras con guion ("gas- tos"): mejor pasar la palabra entera a la otra línea
Font.registerHyphenationCallback((palabra) => [palabra]);

// Mismos colores que el panel (uno fijo por colegio)
const COLORES = ["#2f9c3d", "#2a78d6", "#eb6834", "#4a3aa7"];
const VERDE = "#2f9c3d";
const TINTA = "#16201a";
const SUAVE = "#6b7770";
const BORDE = "#e3e8e4";

const s = StyleSheet.create({
  pagina: { padding: 32, paddingBottom: 44, fontFamily: "Helvetica", fontSize: 9.5, color: TINTA },
  cabecera: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  logo: { width: 40, height: 40 },
  titulo: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: SUAVE, marginTop: 2 },
  sello: { fontSize: 8, color: "#8a5a00", backgroundColor: "#fdf6e6", paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4 },
  fichas: { flexDirection: "row", gap: 8, marginBottom: 14 },
  ficha: { flex: 1, borderWidth: 1, borderColor: BORDE, borderRadius: 6, padding: 8 },
  fichaEt: { fontSize: 7.5, color: SUAVE },
  fichaVal: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  fichaNota: { fontSize: 7, color: SUAVE, marginTop: 3 },
  caja: { borderWidth: 1, borderColor: BORDE, borderRadius: 6, padding: 10, marginBottom: 10 },
  cajaTit: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  cajaSub: { fontSize: 7.5, color: SUAVE, marginTop: 1, marginBottom: 8 },
  fila2: { flexDirection: "row", gap: 10 },
  barraFila: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  barraEt: { width: 95, fontSize: 7.5, color: SUAVE },
  barraPista: { flex: 1, height: 9 },
  barraVal: { width: 62, fontSize: 7.5, textAlign: "right", fontFamily: "Helvetica-Bold" },
  leyenda: { flexDirection: "row", gap: 10, marginBottom: 6 },
  punto: { width: 7, height: 7, borderRadius: 4, marginRight: 3 },
  pie: { position: "absolute", bottom: 18, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: SUAVE },
  seccion: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  pregunta: { marginBottom: 9 },
  pTit: { fontSize: 10, fontFamily: "Helvetica-Bold", color: VERDE, marginBottom: 2 },
  pTxt: { fontSize: 9.5, lineHeight: 1.45 },
  lista: { marginTop: 2, marginLeft: 8 },
  item: { fontSize: 9, lineHeight: 1.4 },
});

const pctTxt = (n: number) => `${numero(Math.round(n * 10) / 10)}%`;
const plural = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

/** Barras horizontales (colegios, categorías, productos) */
function Barras({ filas, color = VERDE }: { filas: { etiqueta: string; valor: number; color?: string }[]; color?: string }) {
  const max = Math.max(...filas.map((f) => f.valor), 1);
  if (filas.length === 0) return <Text style={{ fontSize: 8, color: SUAVE }}>Sin datos en el mes.</Text>;
  return (
    <View>
      {filas.map((f) => (
        <View key={f.etiqueta} style={s.barraFila}>
          <Text style={s.barraEt}>{f.etiqueta}</Text>
          <View style={s.barraPista}>
            <View style={{ width: `${Math.max(1, (f.valor / max) * 100)}%`, height: 9, backgroundColor: f.color ?? color, borderRadius: 2 }} />
          </View>
          <Text style={s.barraVal}>{soles(f.valor)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Columnas por día, apiladas por colegio */
function VentasPorDia({ d }: { d: DatosReporte }) {
  const dias = d.ventas.porDia.length;
  const max = Math.max(...d.ventas.porDia, 1);
  const ALTO = 110;
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: ALTO, gap: 2, borderBottomWidth: 1, borderBottomColor: BORDE }}>
        {Array.from({ length: dias }, (_, i) => (
          <View key={i} style={{ flex: 1, height: ALTO, justifyContent: "flex-end" }}>
            {d.colegios.map((c, k) => {
              const v = d.ventas.porDiaColegio[c.id]?.[i] ?? 0;
              return v > 0 ? <View key={c.id} style={{ height: (v / max) * ALTO, backgroundColor: COLORES[k % COLORES.length] }} /> : null;
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 2, marginTop: 2 }}>
        {Array.from({ length: dias }, (_, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 6, color: SUAVE, textAlign: "center" }}>
            {i === 0 || (i + 1) % 5 === 0 ? i + 1 : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Pregunta({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.pregunta} wrap={false}>
      <Text style={s.pTit}>
        {n}. {titulo}
      </Text>
      {children}
    </View>
  );
}

const Lista = ({ items }: { items: string[] }) => (
  <View style={s.lista}>
    {items.map((t, i) => (
      <Text key={i} style={s.item}>
        - {t}
      </Text>
    ))}
  </View>
);

function ReportePDF({ d, generado, preliminar }: { d: DatosReporte; generado: string; preliminar: boolean }) {
  const mes = nombreMes(d.mes);
  const v = d.ventas;
  const comp = d.mesAnterior && d.mesAnterior.total > 0 ? ((v.total - d.mesAnterior.total) / d.mesAnterior.total) * 100 : null;
  // "septiembre" o "del 1 al 8 de septiembre" (mes en curso: mismos días)
  const anterior = d.mesAnterior
    ? d.mesAnterior.hastaDia
      ? `del 1 al ${d.mesAnterior.hastaDia} de ${nombreMes(d.mesAnterior.mes)}`
      : nombreMes(d.mesAnterior.mes)
    : "";
  const colorColegio = (id: number) => COLORES[Math.max(0, d.colegios.findIndex((c) => c.id === id)) % COLORES.length];
  const ESTADOS: Record<string, [string, string]> = {
    POR_APROBAR: ["por aprobar", "por aprobar"],
    APROBADA: ["aprobada, por comprar", "aprobadas, por comprar"],
    EN_COMPRA: ["en compra", "en compra"],
    COMPRADA: ["comprada", "compradas"],
    RECHAZADA: ["no aprobada", "no aprobadas"],
    ANULADA: ["anulada por el personal", "anuladas por el personal"],
  };
  const pie = (
    <View style={s.pie} fixed>
      <Text>Reporte mensual · Cafetines Las Flores · {mes}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );

  let n = 0;
  return (
    <Document title={`Reporte ${mes} - Las Flores`} author="Cafetines Las Flores">
      {/* ================= Hoja 1: cifras y gráficos ================= */}
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecera}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO} style={s.logo} />
            <View style={{ flex: 1 }}>
              <Text style={s.titulo}>Reporte mensual · {mes.charAt(0).toUpperCase() + mes.slice(1)}</Text>
              <Text style={s.sub}>
                Cafetines Las Flores · {d.colegios.map((c) => c.nombre).join(" y ")} ·{" "}
                {preliminar ? `avance al ${fechaCorta(fechaISOLima(generado))} (el mes aún no termina)` : `generado el ${fechaCorta(fechaISOLima(generado))}`}
              </Text>
            </View>
          </View>
          {preliminar && <Text style={[s.sello, { marginLeft: 10, alignSelf: "flex-start" }]}>PRELIMINAR</Text>}
        </View>

        <View style={s.fichas}>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Ventas del mes</Text>
            <Text style={s.fichaVal}>{soles(v.total)}</Text>
            <Text style={s.fichaNota}>
              {comp == null ? "Sin mes anterior para comparar" : `${comp >= 0 ? "+" : "-"}${pctTxt(Math.abs(comp))} vs ${anterior}`}
            </Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Ganancia neta</Text>
            <Text style={s.fichaVal}>{soles(d.gananciaNeta)}</Text>
            <Text style={s.fichaNota}>
              Margen {d.margenNeto == null ? "-" : pctTxt(d.margenNeto)} (ya sin sobrante{d.otrosGastos ? " ni otros gastos" : ""})
            </Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Sobrante (pérdida a costo)</Text>
            <Text style={s.fichaVal}>{soles(d.sobrante.costo)}</Text>
            <Text style={s.fichaNota}>{plural(d.sobrante.unidades, "unidad", "unidades")} no vendidas</Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Compras del mes</Text>
            <Text style={s.fichaVal}>{soles(d.logistica.costo + (d.otrosGastos ?? 0))}</Text>
            <Text style={s.fichaNota}>
              {plural(d.logistica.entregas, "entrega", "entregas")}
              {d.otrosGastos ? ` + ${soles(d.otrosGastos)} en otros gastos` : " de logística"}
            </Text>
          </View>
        </View>

        <View style={s.caja}>
          <Text style={s.cajaTit}>Ventas por día</Text>
          <Text style={s.cajaSub}>Soles vendidos cada día del mes, por colegio (los semanales se suman el día de su conteo)</Text>
          <View style={s.leyenda}>
            {d.colegios.map((c, k) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[s.punto, { backgroundColor: COLORES[k % COLORES.length] }]} />
                <Text style={{ fontSize: 7.5, color: SUAVE }}>{c.nombre}</Text>
              </View>
            ))}
          </View>
          <VentasPorDia d={d} />
        </View>

        <View style={s.fila2}>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>Ventas por colegio</Text>
            <Text style={s.cajaSub}>Soles vendidos en el mes</Text>
            <Barras filas={d.porColegio.map((c) => ({ etiqueta: c.nombre, valor: c.ventas, color: colorColegio(c.id) }))} />
          </View>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>Ventas por categoría</Text>
            <Text style={s.cajaSub}>De mayor a menor</Text>
            <Barras filas={d.porCategoria.map((c) => ({ etiqueta: c.nombre, valor: c.ventas }))} />
          </View>
        </View>

        <View style={s.fila2}>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>5 productos más vendidos</Text>
            <Text style={s.cajaSub}>Soles, sumando los colegios</Text>
            <Barras filas={d.masVendidos.map((p) => ({ etiqueta: p.producto, valor: p.ventas }))} />
          </View>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>Dónde se pierde el sobrante</Text>
            <Text style={s.cajaSub}>Costo de lo que no se vendió, por producto</Text>
            <Barras filas={d.sobrante.productos.map((p) => ({ etiqueta: `${p.producto} (${p.colegio.replace(/^Colegio\s+/i, "")})`, valor: p.costo }))} color="#eb6834" />
          </View>
        </View>
        {pie}
      </Page>

      {/* ================= Hojas 2+: preguntas y respuestas ================= */}
      <Page size="A4" style={s.pagina}>
        <Text style={s.seccion}>Preguntas y respuestas</Text>

        <Pregunta n={++n} titulo="¿Cuánto vendimos?">
          <Text style={s.pTxt}>
            {v.total > 0
              ? `Vendimos ${soles(v.total)} en ${plural(v.dias, "día de colegio", "días de colegio")} (${numero(v.unidades)} unidades), un promedio de ${soles(v.promedioDia)} por día.${
                  v.mejorDia ? ` El mejor día fue el ${fechaLarga(v.mejorDia.fecha)}, con ${soles(v.mejorDia.total)}.` : ""
                }`
              : "No hubo ventas registradas en el mes."}{" "}
            {d.mesAnterior
              ? comp == null
                ? `No hubo ventas ${d.mesAnterior.hastaDia ? anterior : `en ${anterior}`} para comparar.`
                : `Frente a ${anterior} (${soles(d.mesAnterior.total)}) vendimos ${pctTxt(Math.abs(comp))} ${comp >= 0 ? "más" : "menos"}.`
              : "No hay datos del mes anterior para comparar."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Cuánto ganamos?">
          <Text style={s.pTxt}>
            Lo vendido costó {soles(v.costo)}, así que la ganancia de las ventas fue {soles(v.ganancia)}. A eso se le restan{" "}
            {soles(d.sobrante.costo)} de sobrante (lo que se preparó o compró y no se vendió)
            {d.otrosGastos ? ` y ${soles(d.otrosGastos)} de otros gastos (descartables, utensilios y demás compras fuera del catálogo)` : ""}. La
            ganancia neta del mes es{" "}
            {soles(d.gananciaNeta)}, un margen de {d.margenNeto == null ? "-" : pctTxt(d.margenNeto)} sobre lo vendido.
            {d.mesAnterior && d.mesAnterior.total > 0 ? ` ${anterior.charAt(0).toUpperCase() + anterior.slice(1)} la ganancia neta fue ${soles(d.mesAnterior.gananciaNeta)}.` : ""}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué colegio vendió más?">
          {d.porColegio.length === 0 ? (
            <Text style={s.pTxt}>Ningún colegio registró ventas.</Text>
          ) : (
            <Lista
              items={d.porColegio.map(
                (c) =>
                  `${c.nombre}: ${soles(c.ventas)} (${pctTxt(v.total ? (c.ventas / v.total) * 100 : 0)} del total), ganancia neta ${soles(c.ganancia)}, sobrante ${soles(c.sobrante)}.`,
              )}
            />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué productos se venden más?">
          <Lista items={d.masVendidos.map((p) => `${p.producto}: ${soles(p.ventas)} (${numero(p.unidades)} unid.), ganancia ${soles(p.ganancia)}.`)} />
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué productos se venden menos?">
          <Text style={s.pTxt}>
            {d.menosVendidos.length
              ? `Los que menos vendieron: ${d.menosVendidos.map((p) => `${p.producto} (${soles(p.ventas)}, ${numero(p.unidades)} unid.)`).join("; ")}.`
              : "Todos los productos vendidos están entre los más vendidos."}{" "}
            {d.sinVenta.length
              ? `Sin ninguna venta en el mes: ${d.sinVenta.join(", ")}. Conviene revisar si se siguen ofreciendo.`
              : "Todos los productos activos tuvieron ventas."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué categoría vende más?">
          <Lista items={d.porCategoria.map((c) => `${c.nombre}: ${soles(c.ventas)} (${pctTxt(v.total ? (c.ventas / v.total) * 100 : 0)}).`)} />
        </Pregunta>

        <Pregunta n={++n} titulo="¿Cuánto se perdió en sobrante y por qué?">
          <Text style={s.pTxt}>
            {d.sobrante.unidades > 0
              ? `Sobraron ${numero(d.sobrante.unidades)} unidades de productos del día, que costaron ${soles(d.sobrante.costo)}.`
              : "No hubo sobrante en el mes."}
          </Text>
          {d.sobrante.porMotivo.length > 0 && (
            <Lista items={d.sobrante.porMotivo.map((m) => `${m.motivo}: ${numero(m.unidades)} unid. (${soles(m.costo)}).`)} />
          )}
          {d.sobrante.productos.length > 0 && (
            <Text style={[s.pTxt, { marginTop: 2 }]}>
              Donde más se pierde: {d.sobrante.productos.slice(0, 3).map((p) => `${p.producto} en ${p.colegio} (${soles(p.costo)})`).join("; ")}. Conviene
              ajustar cuánto se prepara de esos productos.
            </Text>
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Cómo llegó lo que mandó cocina?">
          <Text style={s.pTxt}>
            {d.cocina.envios
              ? `Cocina hizo ${plural(d.cocina.envios, "envío", "envíos")} con ${numero(d.cocina.enviadas)} unidades; llegaron ${numero(d.cocina.llegaron)}${
                  d.cocina.enviadas > d.cocina.llegaron && d.cocina.sinRecibir === 0 ? ` (faltaron ${numero(d.cocina.enviadas - d.cocina.llegaron)})` : ""
                }. ${d.cocina.conObservacion ? `${plural(d.cocina.conObservacion, "producto llegó", "productos llegaron")} con observación (incompleto o dañado).` : "Todo llegó conforme."}${
                  d.cocina.sinRecibir ? ` ${plural(d.cocina.sinRecibir, "producto quedó", "productos quedaron")} sin recibir.` : ""
                }`
              : "No hubo envíos de cocina registrados."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué entregó logística y cuánto costó?">
          <Text style={s.pTxt}>
            {d.logistica.entregas
              ? `Logística hizo ${plural(d.logistica.entregas, "entrega", "entregas")} con ${numero(d.logistica.enviadas)} unidades; los colegios recibieron ${numero(d.logistica.llegaron)}, por un costo de ${soles(d.logistica.costo)}. ${
                  d.logistica.conObservacion ? `${plural(d.logistica.conObservacion, "producto llegó", "productos llegaron")} con observación.` : "Todo llegó conforme."
                }${d.logistica.sinRecibir ? ` ${plural(d.logistica.sinRecibir, "producto quedó", "productos quedaron")} sin recibir al cierre.` : ""}`
              : "No hubo entregas de logística registradas."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿El personal hizo sus conteos?">
          {d.conteos.length === 0 ? (
            <Text style={s.pTxt}>No hubo conteos registrados.</Text>
          ) : (
            <Lista
              items={d.conteos.map(
                (c) =>
                  `${c.colegio}: contó ${numero(c.diasConteo)} de ${numero(c.diasVenta)} días con venta (${numero(c.completos)} completos) y ${plural(c.semanas, "conteo semanal", "conteos semanales")}.`,
              )}
            />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué pidió el personal (reposiciones)?">
          <Text style={s.pTxt}>
            {d.reposiciones.total
              ? `${d.reposiciones.total === 1 ? "Se envió" : "Se enviaron"} ${plural(d.reposiciones.total, "lista", "listas")} de reposición con ${numero(d.reposiciones.productos)} productos (${numero(
                  d.reposiciones.fueraCatalogo,
                )} fuera del catálogo, como descartables o utensilios). Estado: ${Object.entries(d.reposiciones.porEstado)
                  .map(([e, k]) => `${k} ${ESTADOS[e]?.[k === 1 ? 0 : 1] ?? e}`)
                  .join(", ")}.`
              : "No se pidieron reposiciones."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Hubo diferencias entre lo contado y el sistema?">
          <Text style={s.pTxt}>
            {d.ajustes.movimientos
              ? `Hubo ${plural(d.ajustes.movimientos, "ajuste", "ajustes")} (${numero(d.ajustes.unidades)} unidades, ${soles(Math.abs(d.ajustes.valor))} a costo): el personal contó más de lo que figuraba. Conviene revisarlos en el Historial.`
              : "No hubo diferencias: los conteos cuadraron con el sistema."}
          </Text>
        </Pregunta>

        <Pregunta n={++n} titulo="¿Cambiaron precios?">
          {d.precios.length === 0 ? (
            <Text style={s.pTxt}>No hubo cambios de precio.</Text>
          ) : (
            <Lista
              items={d.precios.map(
                (p) => `${p.producto} (${p.colegio}): de ${soles(p.antes)} a ${soles(p.despues)}, el ${fechaCorta(fechaISOLima(p.fecha))}.`,
              )}
            />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo={preliminar ? "¿Cómo está el stock hoy?" : "¿Cómo quedó el stock al cierre del mes?"}>
          <Text style={s.pTxt}>
            En los cafetines {preliminar ? "hay" : "quedó"} mercadería por {soles(d.cierre.valorVenta)} a precio de venta (costó {soles(d.cierre.valorCosto)}).{" "}
            {d.cierre.bajoMinimo.length
              ? `${plural(d.cierre.bajoMinimo.length, "producto semanal quedó", "productos semanales quedaron")} en su mínimo o menos:`
              : "Todos los productos semanales quedaron sobre su mínimo."}
          </Text>
          {d.cierre.bajoMinimo.length > 0 && (
            <Lista
              items={d.cierre.bajoMinimo
                .slice(0, 10)
                .map((b) => `${b.producto} (${b.colegio}): ${b.quedan === 0 ? "agotado" : `quedan ${numero(b.quedan)}`}, mínimo ${numero(b.minimo)}.`)
                .concat(d.cierre.bajoMinimo.length > 10 ? [`y ${d.cierre.bajoMinimo.length - 10} más.`] : [])}
            />
          )}
        </Pregunta>
        {pie}
      </Page>
    </Document>
  );
}

/** PDF del reporte listo para descargar */
export function pdfReporte(d: DatosReporte, generado: string, preliminar: boolean) {
  return renderToBuffer(<ReportePDF d={d} generado={generado} preliminar={preliminar} />);
}

/* ================================================================== */
/* Reporte de compras y entregas (logística)                          */
/* ================================================================== */

const ESTADO_REPO: Record<string, string> = {
  POR_APROBAR: "por aprobar",
  APROBADA: "aprobada, por comprar",
  EN_COMPRA: "en compra",
  COMPRADA: "comprada",
  RECHAZADA: "no aprobada",
  ANULADA: "anulada",
};

function ReporteComprasPDF({ c, mes, generado, preliminar }: { c: DatosCompras; mes: string; generado: string; preliminar: boolean }) {
  const nombre = nombreMes(mes);
  const atendidas = c.reposiciones.filter((r) => r.estado === "COMPRADA").length;
  const aprobadas = c.reposiciones.filter((r) => r.estado === "APROBADA" || r.estado === "EN_COMPRA" || r.estado === "COMPRADA").length;
  const pendientes = c.pendientes.porComprar.length + c.pendientes.enCompra.length + c.pendientes.sinRecibir;
  const pie = (
    <View style={s.pie} fixed>
      <Text>Compras y entregas · Cafetines Las Flores · {nombre}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
  let n = 0;
  return (
    <Document title={`Compras y entregas ${nombre} - Las Flores`} author="Cafetines Las Flores">
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecera}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO} style={s.logo} />
            <View style={{ flex: 1 }}>
              <Text style={s.titulo}>Compras y entregas · {nombre.charAt(0).toUpperCase() + nombre.slice(1)}</Text>
              <Text style={s.sub}>
                Logística · Cafetines Las Flores ·{" "}
                {preliminar ? `avance al ${fechaCorta(fechaISOLima(generado))} (el mes aún no termina)` : `generado el ${fechaCorta(fechaISOLima(generado))}`}
              </Text>
            </View>
          </View>
          {preliminar && <Text style={[s.sello, { marginLeft: 10, alignSelf: "flex-start" }]}>PRELIMINAR</Text>}
        </View>

        <View style={s.fichas}>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Total gastado</Text>
            <Text style={s.fichaVal}>{soles(c.costo + (c.otrosGastos?.total ?? 0))}</Text>
            <Text style={s.fichaNota}>
              {soles(c.costo)} en entregas{c.otrosGastos?.total ? ` + ${soles(c.otrosGastos.total)} otros` : ""}
            </Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Entregas</Text>
            <Text style={s.fichaVal}>{numero(c.entregas.length)}</Text>
            <Text style={s.fichaNota}>a {plural(c.porColegio.length, "colegio", "colegios")}</Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Reposiciones aprobadas</Text>
            <Text style={s.fichaVal}>{numero(aprobadas)}</Text>
            <Text style={s.fichaNota}>{numero(atendidas)} ya compradas</Text>
          </View>
          <View style={s.ficha}>
            <Text style={s.fichaEt}>Llegaron con observación</Text>
            <Text style={s.fichaVal}>{numero(c.observaciones.length)}</Text>
            <Text style={s.fichaNota}>{c.observaciones.length === 1 ? "producto incompleto o dañado" : "productos incompletos o dañados"}</Text>
          </View>
        </View>

        <View style={s.fila2}>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>Costo por colegio</Text>
            <Text style={s.cajaSub}>Lo entregado en el mes</Text>
            <Barras filas={c.porColegio.map((x, i) => ({ etiqueta: x.nombre, valor: x.costo, color: COLORES[i % COLORES.length] }))} />
          </View>
          <View style={[s.caja, { flex: 1 }]}>
            <Text style={s.cajaTit}>Costo de cada entrega</Text>
            <Text style={s.cajaSub}>Por fecha y colegio</Text>
            <Barras
              filas={c.entregas.map((e) => ({
                etiqueta: `${fechaCorta(e.fecha).slice(0, 5)} ${e.colegio.replace(/^Colegio\s+/i, "")}`,
                valor: e.costo,
              }))}
            />
          </View>
        </View>

        <View style={s.caja}>
          <Text style={s.cajaTit}>Lo que más se compró</Text>
          <Text style={s.cajaSub}>Costo de lo entregado, por producto (los 10 primeros)</Text>
          <Barras filas={c.productos.map((p) => ({ etiqueta: p.producto, valor: p.costo }))} />
        </View>
        {pie}
      </Page>

      <Page size="A4" style={s.pagina}>
        <Text style={s.seccion}>Preguntas y respuestas</Text>

        <Pregunta n={++n} titulo="¿Cuánto se compró y entregó?">
          <Text style={s.pTxt}>
            {c.entregas.length
              ? `Se hicieron ${plural(c.entregas.length, "entrega", "entregas")} con ${numero(c.unidades)} unidades, por un costo de ${soles(c.costo)}.`
              : "No hubo entregas en el mes."}
            {c.otrosGastos?.total
              ? ` Además se gastaron ${soles(c.otrosGastos.total)} en productos fuera del catálogo. Total del mes: ${soles(c.costo + c.otrosGastos.total)}.`
              : ""}
          </Text>
          {c.porColegio.length > 0 && <Lista items={c.porColegio.map((x) => `${x.nombre}: ${soles(x.costo)} en ${plural(x.entregas, "entrega", "entregas")}.`)} />}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué entregas se hicieron?">
          {c.entregas.length === 0 ? (
            <Text style={s.pTxt}>Ninguna.</Text>
          ) : (
            <Lista
              items={c.entregas.map(
                (e) =>
                  `${fechaCorta(e.fecha)} · ${e.colegio}${e.nota ? ` · ${e.nota}` : ""}: ${plural(e.productos, "producto", "productos")}, ${numero(e.unidades)} unid., ${soles(e.costo)} (${e.estado.toLowerCase()}).`,
              )}
            />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué productos se compraron más?">
          {c.productos.length === 0 ? (
            <Text style={s.pTxt}>Ninguno.</Text>
          ) : (
            <Lista items={c.productos.map((p) => `${p.producto}: ${numero(p.unidades)} unid., ${soles(p.costo)}.`)} />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué pidió el personal y qué se atendió?">
          <Text style={s.pTxt}>
            {c.reposiciones.length
              ? `El personal envió ${plural(c.reposiciones.length, "lista", "listas")} de reposición en el mes:`
              : "El personal no envió listas de reposición en el mes."}
          </Text>
          {c.reposiciones.length > 0 && (
            <Lista
              items={c.reposiciones.map(
                (r) =>
                  `${r.codigo} · ${r.colegio} · ${fechaCorta(fechaISOLima(r.fecha))}: ${plural(r.productos, "producto", "productos")}${
                    r.quitados ? ` (${r.quitados} quitados al revisar)` : ""
                  }, ${ESTADO_REPO[r.estado] ?? r.estado}.`,
              )}
            />
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Qué se compró fuera del catálogo y cuánto costó?">
          {!c.otrosGastos?.items.length && c.fueraCatalogo.length === 0 ? (
            <Text style={s.pTxt}>Nada: todo lo comprado era del catálogo.</Text>
          ) : (
            <>
              {(c.otrosGastos?.items.length ?? 0) > 0 && (
                <>
                  <Text style={s.pTxt}>Gastos anotados en el mes ({soles(c.otrosGastos!.total)}):</Text>
                  <Lista
                    items={c.otrosGastos!.items.map(
                      (g) => `${g.nombre}: ${cantidadConUnidad(g.cantidad, g.unidad)}, ${soles(g.costo)} (${g.codigo}, ${g.colegio}, ${fechaCorta(g.fecha)}).`,
                    )}
                  />
                </>
              )}
              {c.fueraCatalogo.filter((f) => f.costo == null).length > 0 && (
                <>
                  <Text style={[s.pTxt, { marginTop: 2 }]}>Todavía sin costo anotado:</Text>
                  <Lista
                    items={c.fueraCatalogo
                      .filter((f) => f.costo == null)
                      .map((f) => `${f.nombre}: ${cantidadConUnidad(f.cantidad, f.unidad)} (${f.codigo}, ${ESTADO_REPO[f.estado] ?? f.estado}).`)}
                  />
                </>
              )}
            </>
          )}
        </Pregunta>

        <Pregunta n={++n} titulo="¿Llegó todo bien?">
          {c.observaciones.length === 0 ? (
            <Text style={s.pTxt}>Sí: el personal recibió todo conforme.</Text>
          ) : (
            <>
              <Text style={s.pTxt}>El personal reportó diferencias en {plural(c.observaciones.length, "producto", "productos")}:</Text>
              <Lista
                items={c.observaciones.map(
                  (o) =>
                    `${fechaCorta(o.fecha)} · ${o.colegio} · ${o.producto}: se enviaron ${numero(o.enviadas)}, llegaron ${numero(o.llegaron)} (${o.motivo}).`,
                )}
              />
            </>
          )}
        </Pregunta>

        <Pregunta n={++n} titulo={preliminar ? "¿Qué está pendiente hoy?" : "¿Qué quedó pendiente al cierre?"}>
          {pendientes === 0 ? (
            <Text style={s.pTxt}>Nada: todo lo aprobado ya se compró y entregó.</Text>
          ) : (
            <Lista
              items={[
                ...c.pendientes.porComprar.map((r) => `${r.codigo} (${r.colegio}): aprobada el ${fechaCorta(fechaISOLima(r.desde))}, falta comprar.`),
                ...c.pendientes.enCompra.map((r) => `${r.codigo} (${r.colegio}): en compra desde el ${fechaCorta(fechaISOLima(r.desde))}.`),
                ...(c.pendientes.sinRecibir
                  ? [`${plural(c.pendientes.sinRecibir, "producto entregado sigue", "productos entregados siguen")} sin que el colegio confirme la recepción.`]
                  : []),
              ]}
            />
          )}
        </Pregunta>
        {pie}
      </Page>
    </Document>
  );
}

/** PDF de compras y entregas (logística) */
export function pdfCompras(c: DatosCompras, mes: string, generado: string, preliminar: boolean) {
  return renderToBuffer(<ReporteComprasPDF c={c} mes={mes} generado={generado} preliminar={preliminar} />);
}
