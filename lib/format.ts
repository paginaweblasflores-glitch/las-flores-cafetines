const ZONA = "America/Lima";

const fmtSoles = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtNum = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });

export const soles = (n: number | null | undefined) => fmtSoles.format(Number(n ?? 0));
export const numero = (n: number | null | undefined) => fmtNum.format(Number(n ?? 0));
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${fmtNum.format(Number(n))}%`);

/** Fecha de hoy en Perú, formato YYYY-MM-DD */
export function hoyISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

/** Mes actual en Perú, formato YYYY-MM */
export function mesActual() {
  return hoyISO().slice(0, 7);
}

export function rangoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(dias).padStart(2, "0")}`,
    dias,
  };
}

export function mesAnterior(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function mesSiguiente(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** "martes 7 de octubre" a partir de YYYY-MM-DD */
export function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

/** "07/10/2026" */
export function fechaCorta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function diaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Fecha YYYY-MM-DD (hora de Perú) de un timestamp */
export function fechaISOLima(ts: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(ts));
}

/** Lunes de la semana de una fecha YYYY-MM-DD */
export function lunesDeSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const dia = (fecha.getUTCDay() + 6) % 7; // lunes = 0
  fecha.setUTCDate(fecha.getUTCDate() - dia);
  return fecha.toISOString().slice(0, 10);
}

/** Node y el navegador usan espacios distintos en "a. m."; se igualan para que coincidan al hidratar */
const espacios = (s: string) => s.replace(/\s/g, " ");

export function horaLima(ts: string) {
  return espacios(new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts)));
}

export function fechaHoraLima(ts: string) {
  return espacios(new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts)));
}

/** Quita tildes, espacios dobles y mayúsculas (para comparar usuarios y búsquedas) */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombres en MAYÚSCULAS y sin espacios de más (productos, categorías…): "pan con  pollo" → "PAN CON POLLO" */
export function mayusculas(s: string) {
  return s.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-PE");
}

/**
 * Qué tan bien coincide un nombre con lo buscado (sin importar mayúsculas ni tildes):
 * 0 = empieza igual · 1 = cada palabra buscada empieza una palabra del nombre · 2 = lo contiene · -1 = no coincide.
 * Si se escriben varias palabras ("pan pollo"), tienen que estar todas.
 */
export function coincidencia(nombre: string, buscado: string) {
  const n = normalizar(nombre);
  const q = normalizar(buscado);
  if (!q) return 0;
  const palabrasQ = q.split(" ");
  if (!palabrasQ.every((p) => n.includes(p))) return -1;
  if (n.startsWith(q)) return 0;
  const palabrasN = n.split(" ");
  if (palabrasQ.every((p) => palabrasN.some((w) => w.startsWith(p)))) return 1;
  return 2;
}

/**
 * Filtra por nombre y ordena por coincidencia: primero lo que EMPIEZA con lo escrito, luego lo que tiene una
 * palabra que empieza así, al final lo que solo lo contiene. Dentro de cada grupo se respeta el orden anterior.
 */
export function buscarPorNombre<T>(lista: T[], buscado: string, nombre: (x: T) => string): T[] {
  if (!normalizar(buscado)) return lista;
  return lista
    .map((x, i) => ({ x, i, p: coincidencia(nombre(x), buscado) }))
    .filter((r) => r.p >= 0)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((r) => r.x);
}

export const NOMBRE_PRESENTACION: Record<string, string> = {
  UNIDAD: "Unidad",
  CAJA: "Caja",
  PAQUETE: "Paquete",
  BOLSA: "Bolsa",
  OTRO: "Otro",
  /** Viene en balde y se vende por vaso (unidades_por_presentacion = vasos por balde) */
  BALDE: "Balde",
  /** Viene en taper y se vende por porción (unidades_por_presentacion = porciones por taper) */
  TAPER: "Taper",
  /** Bebida que la cocina manda en litros y se vende por vaso (unidades_por_presentacion = ml por vaso) */
  LITRO: "Litros",
};

/** Lo que entra en un vaso de S/ 1 (vaso de 7 oz, servido sin llenar al ras): 200 ml → 5 vasos por litro. Se ajusta en el catálogo. */
export const ML_POR_VASO = 200;

/**
 * Envases de cocina que se venden por partes: el balde (bebidas) por vaso y el taper (salsas) por porción.
 * La cocina envía envases, se guardan como partes y al contar se toca cuánto queda del envase.
 */
export const ENVASES: Record<string, { envase: string; envases: string; parte: string; partes: string; cuantas: string }> = {
  BALDE: { envase: "balde", envases: "baldes", parte: "vaso", partes: "vasos", cuantas: "Cuántos vasos" },
  TAPER: { envase: "taper", envases: "tapers", parte: "porción", partes: "porciones", cuantas: "Cuántas porciones" },
  LITRO: { envase: "litro", envases: "litros", parte: "vaso", partes: "vasos", cuantas: "Cuántos vasos" },
};

/**
 * Cuántas partes (vasos/porciones) hay en un envase. En balde y taper es el número guardado;
 * en litros lo guardado son los ml por vaso: 1000 / 200 ml = 5 vasos por litro.
 */
export function partesPorEnvase(presentacion: string, unidadesPorPresentacion: number) {
  if (presentacion !== "LITRO") return unidadesPorPresentacion;
  return unidadesPorPresentacion > 0 ? 1000 / unidadesPorPresentacion : 0;
}

/** Litros con un decimal como mucho: "12.5" */
export const litrosTexto = (l: number) => String(Math.round(l * 10) / 10);

/** Productos que vienen en un envase (balde, taper) y se venden por partes (vaso, porción) */
export const esEnvase = (presentacion: string) => presentacion in ENVASES;

/** Qué envases corresponden a cada categoría de lo que manda la cocina: bebidas → litros (o balde), salsas → taper */
export function envasesDeCategoria(nombreCategoria: string | null | undefined): ("LITRO" | "BALDE" | "TAPER")[] {
  const n = normalizar(nombreCategoria ?? "");
  if (n.startsWith("bebida")) return ["LITRO", "BALDE"];
  if (n.startsWith("salsa")) return ["TAPER"];
  return [];
}

/** "1 balde", "1½ tapers", "¾ de balde", "12.5 litros" (cuánto es en envases una cantidad de vasos o porciones) */
export function enEnvases(partes: number, unidadesPorPresentacion: number, presentacion: string) {
  const e = ENVASES[presentacion] ?? ENVASES.BALDE;
  const porEnvase = partesPorEnvase(presentacion, unidadesPorPresentacion);
  if (porEnvase <= 0) return "";
  const b = partes / porEnvase;
  // En litros: "12.5 litros" (sin fracciones de balde)
  if (presentacion === "LITRO") return `${litrosTexto(b)} ${litrosTexto(b) === "1" ? e.envase : e.envases}`;
  const entero = Math.floor(b + 1e-9);
  const resto = b - entero;
  const fracciones: [number, string][] = [[0, ""], [0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1, ""]];
  const [f, txt] = fracciones.reduce((m, x) => (Math.abs(x[0] - resto) < Math.abs(m[0] - resto) ? x : m));
  const total = entero + (f === 1 ? 1 : 0);
  const exacto = Math.abs(f - resto) < 0.06;
  const aprox = exacto ? "" : "≈ ";
  if (total === 0 && txt) return `${aprox}${txt} de ${e.envase}`;
  if (total === 0) return `${aprox}0 ${e.envases}`;
  return `${aprox}${total}${f !== 1 ? txt : ""} ${total === 1 && !txt ? e.envase : e.envases}`;
}

/**
 * En qué se escribe el stock (mínimo, inicial) de un producto: en la presentación de compra
 * (bolsas, cajas, paquetes) o en unidades. Lo de cocina (balde, taper, litros) y lo suelto va en unidades.
 * Siempre se guarda en unidades: bolsas × unidades por bolsa.
 */
export function stockEnCompra(presentacion: string, unidadesPorPresentacion: number) {
  const enCompra = ["CAJA", "PAQUETE", "BOLSA", "OTRO"].includes(presentacion) && unidadesPorPresentacion > 1;
  const nombre = (NOMBRE_PRESENTACION[presentacion] ?? "Caja").toLowerCase();
  return enCompra
    ? { factor: unidadesPorPresentacion, singular: nombre, plural: nombre === "otro" ? "otros" : `${nombre}s` }
    : { factor: 1, singular: "unidad", plural: "unidades" };
}

/** "caja de 24", "paquete de 6" o "unidad" */
export function descPresentacion(p: string, unidades: number) {
  if (p === "LITRO") return `en litros (vaso de ${unidades} ml)`;
  if (ENVASES[p]) return `${ENVASES[p].envase} de ${unidades} ${ENVASES[p].partes}`;
  if (p === "UNIDAD" || unidades <= 1) return "por unidad";
  return `${NOMBRE_PRESENTACION[p]?.toLowerCase() ?? p} de ${unidades}`;
}

/** Unidades para pedir reposición: [singular, plural] */
export const UNIDADES_REPOSICION: Record<string, [string, string]> = {
  UNIDAD: ["unidad", "unidades"],
  PAQUETE: ["paquete", "paquetes"],
  CAJA: ["caja", "cajas"],
  BOLSA: ["bolsa", "bolsas"],
  DOCENA: ["docena", "docenas"],
  KILO: ["kilo", "kilos"],
};

/** "6 paquetes", "1 caja" */
export function cantidadConUnidad(n: number, unidad: string) {
  const [uno, varios] = UNIDADES_REPOSICION[unidad] ?? [unidad.toLowerCase(), unidad.toLowerCase()];
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Cómo se ve cada estado de una reposición */
export const ESTADO_REPOSICION: Record<string, { texto: string; clase: string }> = {
  POR_APROBAR: { texto: "Por aprobar", clase: "chip-atencion" },
  APROBADA: { texto: "Aprobada", clase: "chip-exito" },
  EN_COMPRA: { texto: "En compra", clase: "chip-info" },
  COMPRADA: { texto: "Comprada", clase: "chip-exito" },
  RECHAZADA: { texto: "No aprobada", clase: "chip-critico" },
  ANULADA: { texto: "Anulada", clase: "chip-neutro" },
};

/** Nombre de un conteo: "jueves 8 de octubre" o "Semana del lunes 5 de octubre" */
export function nombreConteo(tipo: "DIA" | "SEMANA", fecha: string) {
  return tipo === "SEMANA" ? `Semana del ${fechaLarga(fecha)}` : fechaLarga(fecha);
}
