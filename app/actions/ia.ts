"use server";

import { refresh } from "next/cache";
import { sesionAccion, ROLES_PANEL } from "@/lib/auth";
import { obtenerCategorias, obtenerStock } from "@/lib/data";
import { mayusculas } from "@/lib/format";
import {
  claveDe,
  escribirEnEnv,
  geminiJSON,
  guardarClave,
  guardarModelo,
  leerConfiguracion,
  mejorModeloGemini,
  modelosDeRespaldo,
  modeloDe,
  normalizar,
  probarClave,
  PROVEEDORES,
  type Archivo,
  type Proveedor,
} from "@/lib/ia";
import { check, db, mensajeError } from "@/lib/supabase";
import type { Presentacion, Resultado } from "@/lib/types";

const PRESENTACIONES: Presentacion[] = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO"];
const esProveedor = (p: unknown): p is Proveedor => p === "GEMINI" || p === "DEEPSEEK";
/** Lo que se le manda a la IA no puede pasar de esto (Vercel no deja subir más de ~4.5 MB) */
const MAX_ARCHIVO = 4 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// =====================================================================
//  Administración → API (administración y logística)
// =====================================================================

/** Guarda la clave (cifrada en la base y, en la PC de desarrollo, también en .env) después de probarla */
export async function guardarClaveIA(p: Proveedor, clave: string): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    if (!esProveedor(p)) return { ok: false, error: "Proveedor no válido." };
    const limpia = clave.trim().replace(/^["']|["']$/g, "");
    if (limpia.length < 20 || /\s/.test(limpia)) return { ok: false, error: "Esa clave no parece completa. Cópiala de nuevo." };
    const prueba = await probarClave(p, limpia);
    if (!prueba.ok) return { ok: false, error: prueba.error };
    await guardarClave(p, limpia, sesion.uid);
    // Si el modelo elegido no está entre los de esta clave, se usa el recomendado
    const conf = await leerConfiguracion();
    if (prueba.modelos.length && !prueba.modelos.includes(modeloDe(conf, p))) {
      const recomendado =
        (p === "GEMINI" ? mejorModeloGemini(prueba.modelos) : null) ??
        (prueba.modelos.includes(PROVEEDORES[p].modeloPorDefecto) ? PROVEEDORES[p].modeloPorDefecto : prueba.modelos[0]);
      await guardarModelo(p, recomendado, sesion.uid);
    }
    const enEnv = await escribirEnEnv(PROVEEDORES[p].variable, limpia);
    refresh();
    return { ok: true, mensaje: `Clave de ${PROVEEDORES[p].nombre} conectada${enEnv ? " (también quedó en .env)" : ""}.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export async function quitarClaveIA(p: Proveedor): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    if (!esProveedor(p)) return { ok: false, error: "Proveedor no válido." };
    await guardarClave(p, null, sesion.uid);
    await escribirEnEnv(PROVEEDORES[p].variable, null);
    refresh();
    return { ok: true, mensaje: "Clave quitada del sistema." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Prueba la clave que está en uso y devuelve los modelos disponibles */
export async function probarIA(p: Proveedor): Promise<{ ok: true; mensaje: string; modelos: string[] } | { ok: false; error: string }> {
  try {
    await sesionAccion(ROLES_PANEL);
    if (!esProveedor(p)) return { ok: false, error: "Proveedor no válido." };
    const { clave } = claveDe(await leerConfiguracion(), p);
    if (!clave) return { ok: false, error: "Todavía no hay clave." };
    const r = await probarClave(p, clave);
    return r.ok ? { ok: true, mensaje: `Conexión correcta: ${r.modelos.length} modelos disponibles.`, modelos: r.modelos } : r;
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export async function guardarModeloIA(p: Proveedor, modelo: string): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    if (!esProveedor(p) || !/^[\w.\-]{3,80}$/.test(modelo)) return { ok: false, error: "Modelo no válido." };
    await guardarModelo(p, modelo, sesion.uid);
    refresh();
    return { ok: true, mensaje: `Modelo: ${modelo}` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Sube un documento de referencia (PDF o foto) a la memoria de la IA */
export async function subirDocumentoIA(fd: FormData): Promise<Resultado> {
  try {
    const sesion = await sesionAccion(ROLES_PANEL);
    const archivo = fd.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elige un archivo." };
    if (!TIPOS.includes(archivo.type)) return { ok: false, error: "Solo PDF o fotos (JPG, PNG, WEBP)." };
    if (archivo.size > MAX_ARCHIVO) return { ok: false, error: "El archivo pesa más de 4 MB." };
    const actuales = check(await db().from("ia_documentos").select("tamano")) as { tamano: number }[];
    if (actuales.reduce((a, d) => a + d.tamano, 0) + archivo.size > 12 * 1024 * 1024) {
      return { ok: false, error: "La memoria de la IA ya tiene 12 MB. Quita algún documento antes de subir otro." };
    }
    const nombre = (String(fd.get("nombre") ?? "").trim() || archivo.name).slice(0, 120);
    check(
      await db()
        .from("ia_documentos")
        .insert({
          nombre,
          tipo: archivo.type,
          tamano: archivo.size,
          datos: Buffer.from(await archivo.arrayBuffer()).toString("base64"),
          subido_por: sesion.uid,
        }),
    );
    refresh();
    return { ok: true, mensaje: `"${nombre}" agregado a la memoria de la IA.` };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export async function borrarDocumentoIA(id: number): Promise<Resultado> {
  try {
    await sesionAccion(ROLES_PANEL);
    check(await db().from("ia_documentos").delete().eq("id", id));
    refresh();
    return { ok: true, mensaje: "Documento quitado de la memoria." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

export async function borrarEquivalenciaIA(id: number): Promise<Resultado> {
  try {
    await sesionAccion(ROLES_PANEL);
    check(await db().from("ia_equivalencias").delete().eq("id", id));
    refresh();
    return { ok: true, mensaje: "Equivalencia olvidada." };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

// =====================================================================
//  Entregas → "Llenar con IA" (ADMIN y LOGÍSTICA)
// =====================================================================

/** Una línea de la boleta ya relacionada con el catálogo */
export type LineaLeida = {
  /** Cómo sale en la boleta (para aprender la equivalencia) */
  texto: string;
  /** Producto del sistema (null = hay que crearlo) */
  productoId: number | null;
  /** Fila del producto en este colegio (null = el producto no está en este colegio todavía) */
  productoColegioId: number | null;
  nombre: string;
  categoriaId: number | null;
  presentacion: Presentacion;
  cajas: number;
  porCaja: number;
  sueltas: number;
  /** Por caja/paquete (o por unidad si va por unidad) */
  costo: number;
  /** Importe de la línea según la boleta (para cuadrar) */
  importe: number | null;
  confianza: "ALTA" | "MEDIA" | "BAJA";
  nota: string;
  /** La relacionó una equivalencia aprendida (confirmada antes por una persona) */
  aprendida: boolean;
};

export type BoletaLeida = {
  ok: true;
  lineas: LineaLeida[];
  total: number | null;
  documento: string;
  proveedor: string;
  fecha: string | null;
  segundos: number;
};

type RespuestaIA = {
  proveedor: string | null;
  documento: string | null;
  fecha: string | null;
  total: number | null;
  lineas: {
    texto_boleta: string;
    producto_id: number | null;
    nombre_nuevo: string | null;
    categoria_id: number | null;
    presentacion: string;
    paquetes: number;
    unidades_por_paquete: number;
    unidades_sueltas: number;
    costo_por_paquete: number | null;
    costo_por_unidad: number | null;
    importe: number | null;
    confianza: string;
    nota: string | null;
  }[];
};

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    proveedor: { type: "STRING", nullable: true, description: "Nombre comercial del proveedor (ej. MAZZU)" },
    documento: { type: "STRING", nullable: true, description: "Tipo y número del documento (ej. Nota de venta PP02-00110433)" },
    fecha: { type: "STRING", nullable: true, description: "Fecha del documento en formato AAAA-MM-DD" },
    total: { type: "NUMBER", nullable: true, description: "Total a pagar impreso en el documento, en soles" },
    lineas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          texto_boleta: { type: "STRING", description: "Descripción del producto tal como está escrita en la boleta" },
          producto_id: { type: "INTEGER", nullable: true, description: "id del catálogo si es ese producto; null si no existe" },
          nombre_nuevo: { type: "STRING", nullable: true, description: "Solo si producto_id es null: nombre corto en MAYÚSCULAS para crearlo" },
          categoria_id: { type: "INTEGER", nullable: true, description: "Solo si producto_id es null: id de la categoría más adecuada" },
          presentacion: { type: "STRING", enum: ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "OTRO"] },
          paquetes: { type: "INTEGER", description: "Cuántas cajas/paquetes/bolsas/displays se compraron (0 si va por unidad)" },
          unidades_por_paquete: { type: "INTEGER", description: "Unidades que trae cada caja/paquete (1 si va por unidad)" },
          unidades_sueltas: { type: "INTEGER", description: "Unidades sueltas adicionales (o todas, si va por unidad)" },
          costo_por_paquete: { type: "NUMBER", nullable: true, description: "Precio de cada caja/paquete en soles" },
          costo_por_unidad: { type: "NUMBER", nullable: true, description: "Precio de cada unidad, si se compró por unidad" },
          importe: { type: "NUMBER", nullable: true, description: "Importe total de la línea impreso en la boleta" },
          confianza: { type: "STRING", enum: ["ALTA", "MEDIA", "BAJA"] },
          nota: { type: "STRING", nullable: true, description: "Duda corta para que la persona revise (vacío si no hay)" },
        },
        required: [
          "texto_boleta",
          "producto_id",
          "presentacion",
          "paquetes",
          "unidades_por_paquete",
          "unidades_sueltas",
          "importe",
          "confianza",
        ],
      },
    },
  },
  required: ["lineas", "total"],
};

const SISTEMA = `Eres el asistente de logística del Restaurante Las Flores, que administra cafetines de colegios en Perú.
Te dan la foto o PDF de una boleta, factura o nota de venta de una compra (golosinas, galletas, bebidas, etc.) y debes pasarla a datos para registrar la entrega.

Reglas:
1. Una línea por cada producto comprado. No inventes productos. Ignora líneas de subtotal, IGV, descuento global, redondeo o vuelto.
2. Relaciona cada línea con el CATÁLOGO por su significado (marca + producto), no por letras exactas: las boletas usan abreviaturas ("GALL" = galleta, "CHOC" = chocolate, "BEB" = bebida, "CJA"/"CJ" = caja, "PQT"/"PAQ" = paquete, "BLS" = bolsa, "DSP"/"DISP" = display, "UND"/"UNID" = unidad).
3. Las EQUIVALENCIAS CONFIRMADAS fueron revisadas por una persona: si una línea coincide, usa ese producto sin dudar.
4. Si el producto no está en el catálogo, producto_id = null, propone nombre_nuevo corto en MAYÚSCULAS (marca y producto, sin gramaje salvo que distinga) y la categoria_id más adecuada.
5. Cantidades: paquetes × unidades_por_paquete + unidades_sueltas = total de unidades. Si se compró por unidad: presentacion UNIDAD, paquetes 0, unidades_por_paquete 1 y todo en unidades_sueltas.
   Si la boleta no dice cuántas unidades trae cada paquete, usa lo que dice el catálogo para ese producto o las marcas escritas a mano; si no sabes, pon tu mejor estimación con confianza BAJA y explícalo en nota.
6. Costos en soles: costo_por_paquete = precio de cada caja/paquete; costo_por_unidad si va por unidad. importe = total de la línea impreso. Debe cumplirse paquetes × costo_por_paquete ≈ importe; si no cuadra, revisa de nuevo y si persiste, explícalo en nota.
7. total = el TOTAL A PAGAR impreso del documento (no lo calcules tú). Si no se ve, null.
8. confianza: ALTA si lo leíste claro y el producto es seguro; MEDIA si dudas del producto o de una cifra; BAJA si es una estimación.
9. Usa los DOCUMENTOS DE REFERENCIA como apoyo para reconocer productos, presentaciones y precios (no son la boleta a registrar).

Cómo trabaja logística en Las Flores (tenlo siempre en cuenta):
- Sobre la boleta escriben a mano: lo marcado en NARANJA es la cantidad de paquetes/cajas/bolsas comprados, y lo marcado en AZUL son las unidades que trae cada uno ("c/u"). Esas marcas mandan sobre lo impreso.
- El costo a registrar es el precio por paquete/caja que figura en la boleta (no el precio por unidad), salvo que se compre por unidad.
- Una "CJA" de CHICOLAC o de FRUGOS DEL VALLE son 4 paquetes de 6 unidades: regístrala como 4 paquetes de 6 por cada caja, con el costo de la caja dividido entre 4.
- "Bebida Gloria Durazno" de caja de 24 es FRUGOS KIDS TRIANGULO.
- Los nombres de productos van en MAYÚSCULAS, con el nombre comercial con el que se vende en el cafetín.`;

/** Lee la boleta (fotos/PDF) y la relaciona con el catálogo del colegio. No guarda nada. */
export async function leerBoleta(fd: FormData): Promise<BoletaLeida | { ok: false; error: string }> {
  const inicio = Date.now();
  try {
    const sesionUid = (await sesionAccion(["LOGISTICA"])).uid;
    const colegioId = Number(fd.get("colegioId"));
    if (!Number.isInteger(colegioId) || colegioId <= 0) return { ok: false, error: "Elige el colegio." };
    const archivos = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);
    if (archivos.length === 0) return { ok: false, error: "Sube la foto o el PDF de la boleta." };
    if (archivos.some((a) => !TIPOS.includes(a.type))) return { ok: false, error: "Solo fotos (JPG, PNG, WEBP) o PDF." };
    if (archivos.reduce((a, f) => a + f.size, 0) > MAX_ARCHIVO) return { ok: false, error: "Los archivos pesan más de 4 MB juntos. Sube menos páginas." };

    const conf = await leerConfiguracion();
    const { clave } = claveDe(conf, "GEMINI");
    if (!clave) return { ok: false, error: "La IA no está conectada. Hay que pegar la clave en Administración → API." };

    const [stock, categorias, equivalencias, documentos] = await Promise.all([
      obtenerStock(),
      obtenerCategorias(),
      db().from("ia_equivalencias").select("texto, producto_id").then(check) as Promise<{ texto: string; producto_id: number }[]>,
      db().from("ia_documentos").select("nombre, tipo, datos").order("id").then(check) as Promise<{ nombre: string; tipo: string; datos: string }[]>,
    ]);

    // Catálogo: cada producto una vez; con su presentación en este colegio (o en otro, si aquí no está)
    const productos = new Map<number, { nombre: string; categoria: string | null; aqui: (typeof stock)[number] | undefined; otro: (typeof stock)[number] | undefined }>();
    for (const s of stock) {
      const p = productos.get(s.producto_id) ?? { nombre: s.producto, categoria: s.categoria, aqui: undefined, otro: undefined };
      if (s.colegio_id === colegioId) p.aqui = s;
      else p.otro ??= s;
      productos.set(s.producto_id, p);
    }
    const desc = (s: (typeof stock)[number]) =>
      s.presentacion === "UNIDAD" ? `por unidad, costo S/ ${s.costo_presentacion}` : `${s.presentacion} de ${s.unidades_por_presentacion}, costo S/ ${s.costo_presentacion}`;
    const catalogo = [...productos.entries()]
      .map(([id, p]) => `${id} | ${p.nombre} | ${p.categoria ?? "-"} | ${p.aqui ? desc(p.aqui) : `(aún no está en este colegio) ${desc(p.otro!)}`}`)
      .join("\n");
    const nombreProducto = new Map([...productos.entries()].map(([id, p]) => [id, p.nombre]));
    const equivTexto = equivalencias
      .filter((e) => nombreProducto.has(e.producto_id))
      .map((e) => `"${e.texto}" → ${e.producto_id} (${nombreProducto.get(e.producto_id)})`)
      .join("\n");

    const partes: ({ texto: string } | { archivo: Archivo })[] = [
      { texto: `CATEGORÍAS (id | nombre):\n${categorias.map((c) => `${c.id} | ${c.nombre}`).join("\n")}` },
      { texto: `CATÁLOGO (id | nombre | categoría | cómo se compra):\n${catalogo}` },
      { texto: `EQUIVALENCIAS CONFIRMADAS (texto de boleta → id):\n${equivTexto || "(todavía ninguna)"}` },
    ];
    for (const d of documentos) {
      partes.push({ texto: `DOCUMENTO DE REFERENCIA (solo apoyo, NO se registra): ${d.nombre}` });
      partes.push({ archivo: { tipo: d.tipo, base64: d.datos } });
    }
    partes.push({ texto: `BOLETA A REGISTRAR (${archivos.length} archivo${archivos.length === 1 ? "" : "s"}, pueden ser páginas del mismo documento o varios documentos):` });
    for (const a of archivos) partes.push({ archivo: { tipo: a.type, base64: Buffer.from(await a.arrayBuffer()).toString("base64") } });

    // Si un modelo está saturado (503), retirado (404), con límite (429) o no responde, se prueba el siguiente
    const elegido = modeloDe(conf, "GEMINI");
    const PLAZO = 100_000;
    let r: Awaited<ReturnType<typeof geminiJSON<RespuestaIA>>> = { ok: false, error: "La IA no respondió." };
    let candidatos = [elegido];
    let retirado = false;
    for (let i = 0; i < candidatos.length && i < 5; i++) {
      const queda = PLAZO - (Date.now() - inicio);
      if (queda < 8000) break;
      const modelo = candidatos[i];
      r = await geminiJSON<RespuestaIA>({ clave, modelo, sistema: SISTEMA, partes, esquema: ESQUEMA, limiteMs: Math.min(45_000, queda) });
      if (r.ok) {
        // Si Google retiró el elegido, queda guardado el que funcionó
        if (retirado && modelo !== elegido) await guardarModelo("GEMINI", modelo, sesionUid);
        break;
      }
      if (![404, 429, 500, 503, 504].includes(r.estado ?? 0)) break;
      if (i === 0) {
        retirado = r.estado === 404;
        const lista = await probarClave("GEMINI", clave);
        candidatos = modelosDeRespaldo(elegido, lista.ok ? lista.modelos : []);
      }
      console.warn(`[IA] ${modelo}: ${r.error} → probando otro modelo`);
      await new Promise((ok) => setTimeout(ok, 1000));
    }
    if (!r.ok) return { ok: false, error: r.error };

    // ---- Revisión en el servidor: lo aprendido manda, y todo se ajusta a cómo está el producto en el sistema ----
    const porTexto = new Map(equivalencias.map((e) => [e.texto, e.producto_id]));
    const catIds = new Set(categorias.map((c) => c.id));
    const num = (v: unknown, def = 0) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def);
    const ent = (v: unknown, def = 0) => Math.round(num(v, def));
    const dinero = (v: number) => Math.round(v * 10000) / 10000;

    const lineas: LineaLeida[] = (r.datos.lineas ?? []).map((l) => {
      const texto = String(l.texto_boleta ?? "").trim().slice(0, 200);
      const aprendido = porTexto.get(normalizar(texto));
      const idIA = typeof l.producto_id === "number" && productos.has(l.producto_id) ? l.producto_id : null;
      const productoId = aprendido && productos.has(aprendido) ? aprendido : idIA;
      const p = productoId ? productos.get(productoId) : undefined;

      // Lo leído de la boleta
      let cajas = ent(l.paquetes);
      let porCaja = Math.max(1, ent(l.unidades_por_paquete, 1));
      let sueltas = ent(l.unidades_sueltas);
      const costoPaquete = num(l.costo_por_paquete, NaN);
      const costoUnidad = num(l.costo_por_unidad, NaN);
      const importe = typeof l.importe === "number" && Number.isFinite(l.importe) ? l.importe : null;
      let presentacion: Presentacion = PRESENTACIONES.includes(l.presentacion as Presentacion) ? (l.presentacion as Presentacion) : "UNIDAD";
      if (cajas === 0) presentacion = p?.aqui?.presentacion ?? (sueltas > 0 ? "UNIDAD" : presentacion);
      // Costo por unidad (sirve para pasarlo a cualquier presentación)
      const unidadesTot = cajas * porCaja + sueltas;
      let costoU = Number.isFinite(costoPaquete) && cajas > 0 ? costoPaquete / porCaja : Number.isFinite(costoUnidad) ? costoUnidad : NaN;
      if (!Number.isFinite(costoU) && importe != null && unidadesTot > 0) costoU = importe / unidadesTot;
      if (!Number.isFinite(costoU)) costoU = p?.aqui ? Number(p.aqui.costo_unitario) : 0;

      // Si en este colegio va por unidad, todo pasa a unidades sueltas
      const pres = p?.aqui?.presentacion ?? presentacion;
      if (pres === "UNIDAD") {
        sueltas = unidadesTot;
        cajas = 0;
        porCaja = 1;
      } else if (cajas === 0 && p?.aqui) {
        porCaja = p.aqui.unidades_por_presentacion;
      }
      const costo = pres === "UNIDAD" ? dinero(costoU) : Number.isFinite(costoPaquete) && cajas > 0 ? costoPaquete : dinero(costoU * porCaja);

      const nombre = p ? p.nombre : mayusculas(String(l.nombre_nuevo || texto)).slice(0, 80);
      return {
        texto,
        productoId,
        productoColegioId: p?.aqui?.id ?? null,
        nombre,
        categoriaId: p ? (p.aqui ?? p.otro)!.categoria_id : typeof l.categoria_id === "number" && catIds.has(l.categoria_id) ? l.categoria_id : null,
        presentacion: pres,
        cajas,
        porCaja,
        sueltas,
        costo: dinero(costo),
        importe,
        confianza: (["ALTA", "MEDIA", "BAJA"].includes(l.confianza) ? l.confianza : "MEDIA") as LineaLeida["confianza"],
        nota: String(l.nota ?? "").trim().slice(0, 240),
        aprendida: !!aprendido && aprendido === productoId,
      };
    });

    return {
      ok: true,
      lineas: lineas.filter((l) => l.cajas * l.porCaja + l.sueltas > 0),
      total: typeof r.datos.total === "number" && Number.isFinite(r.datos.total) ? r.datos.total : null,
      documento: String(r.datos.documento ?? "").trim().slice(0, 120),
      proveedor: String(r.datos.proveedor ?? "").trim().slice(0, 80),
      fecha: typeof r.datos.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.datos.fecha) ? r.datos.fecha : null,
      segundos: Math.round((Date.now() - inicio) / 1000),
    };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/** Producto que la IA propuso y todavía no está en este colegio (o no existe) */
export type PorCrear = {
  clave: string;
  productoId: number | null;
  nombre: string;
  categoriaId: number | null;
  presentacion: Presentacion;
  porCaja: number;
  costo: number;
};

export type ItemCreado = {
  clave: string;
  id: number;
  colegioId: number;
  producto: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  costo: number;
  total: number;
  minimo: number;
};

/**
 * Antes de registrar: crea los productos nuevos y agrega a este colegio los que solo estaban en otro.
 * Lo nuevo queda con precio de venta S/ 0 (administración lo pone en el catálogo).
 */
export async function prepararProductosIA(
  colegioId: number,
  items: PorCrear[],
): Promise<{ ok: true; creados: ItemCreado[]; nuevos: number; agregados: number } | { ok: false; error: string }> {
  try {
    const sesion = await sesionAccion(["LOGISTICA"]);
    if (!Number.isInteger(colegioId) || colegioId <= 0) return { ok: false, error: "Colegio no válido." };
    const creados: ItemCreado[] = [];
    let nuevos = 0;
    let agregados = 0;
    for (const it of items) {
      const nombre = mayusculas(it.nombre);
      if (nombre.length < 2) return { ok: false, error: "Hay un producto nuevo sin nombre." };
      const presentacion = PRESENTACIONES.includes(it.presentacion) ? it.presentacion : "UNIDAD";
      const porCaja = presentacion === "UNIDAD" ? 1 : Math.max(1, Math.round(it.porCaja));
      const costo = Number.isFinite(it.costo) && it.costo >= 0 ? it.costo : 0;

      // ¿Ya existe? (por id, o por nombre si alguien lo creó mientras tanto)
      let productoId = it.productoId;
      if (!productoId) {
        const ya = check(await db().from("productos").select("id").ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&")).limit(1)) as { id: number }[];
        productoId = ya[0]?.id ?? null;
      }
      if (!productoId) {
        const p = check(
          await db()
            .from("productos")
            .insert({ nombre, categoria_id: it.categoriaId, perecible: false, de_cocina: false })
            .select("id")
            .single(),
        ) as { id: number };
        productoId = p.id;
        nuevos++;
      }
      const filas = check(
        await db().from("producto_colegio").select("id, colegio_id, precio_venta, stock_minimo, stock_unidades").eq("producto_id", productoId),
      ) as { id: number; colegio_id: number; precio_venta: number; stock_minimo: number; stock_unidades: number }[];
      let aqui = filas.find((f) => f.colegio_id === colegioId);
      if (!aqui) {
        const otro = filas[0];
        aqui = check(
          await db()
            .from("producto_colegio")
            .insert({
              colegio_id: colegioId,
              producto_id: productoId,
              presentacion,
              unidades_por_presentacion: porCaja,
              costo_presentacion: costo,
              // Si ya se vende en otro colegio, mismo precio de partida; si es nuevo, lo pone administración
              precio_venta: otro?.precio_venta ?? 0,
              stock_minimo: otro?.stock_minimo ?? 0,
              stock_unidades: 0,
              activo: true,
              updated_by: sesion.uid,
            })
            .select("id, colegio_id, precio_venta, stock_minimo, stock_unidades")
            .single(),
        ) as (typeof filas)[number];
        if (it.productoId) agregados++;
      }
      creados.push({
        clave: it.clave,
        id: aqui.id,
        colegioId,
        producto: nombre,
        presentacion,
        unidadesPorPresentacion: porCaja,
        costo,
        total: aqui.stock_unidades ?? 0,
        minimo: aqui.stock_minimo ?? 0,
      });
    }
    return { ok: true, creados, nuevos, agregados };
  } catch (e) {
    const msg = mensajeError(e);
    return { ok: false, error: msg.startsWith("Ya existe") ? "Ya existe un producto con ese nombre. Elígelo de la lista." : msg };
  }
}

/** Después de registrar: guarda cómo sale cada producto en la boleta, para reconocerlo solo la próxima vez */
export async function aprenderEquivalenciasIA(pares: { texto: string; productoColegioId: number }[]): Promise<Resultado> {
  try {
    await sesionAccion(["LOGISTICA"]);
    const validos = pares.map((p) => ({ texto: normalizar(p.texto).slice(0, 200), pc: p.productoColegioId })).filter((p) => p.texto.length >= 2);
    if (validos.length === 0) return { ok: true };
    const filas = check(await db().from("producto_colegio").select("id, producto_id").in("id", validos.map((v) => v.pc))) as {
      id: number;
      producto_id: number;
    }[];
    const productoDe = new Map(filas.map((f) => [f.id, f.producto_id]));
    const textos = [...new Set(validos.map((v) => v.texto))];
    const previas = check(await db().from("ia_equivalencias").select("texto, producto_id, usos").in("texto", textos)) as {
      texto: string;
      producto_id: number;
      usos: number;
    }[];
    const filasNuevas = new Map<string, { texto: string; producto_id: number; usos: number; updated_at: string }>();
    for (const v of validos) {
      const productoId = productoDe.get(v.pc);
      if (!productoId) continue;
      const previa = previas.find((p) => p.texto === v.texto);
      filasNuevas.set(v.texto, {
        texto: v.texto,
        producto_id: productoId,
        // Si una persona la corrigió a otro producto, vuelve a empezar
        usos: previa && previa.producto_id === productoId ? previa.usos + 1 : 1,
        updated_at: new Date().toISOString(),
      });
    }
    if (filasNuevas.size) check(await db().from("ia_equivalencias").upsert([...filasNuevas.values()], { onConflict: "texto" }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}
