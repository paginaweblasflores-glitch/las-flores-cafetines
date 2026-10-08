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

export const NOMBRE_PRESENTACION: Record<string, string> = {
  UNIDAD: "Unidad",
  CAJA: "Caja",
  PAQUETE: "Paquete",
  BOLSA: "Bolsa",
  OTRO: "Otro",
};

/** "caja de 24", "paquete de 6" o "unidad" */
export function descPresentacion(p: string, unidades: number) {
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
  POR_APROBAR: { texto: "Por aprobar", clase: "bg-ambar-50 text-[#8a5a00]" },
  APROBADA: { texto: "Aprobada", clase: "bg-verde-50 text-verde-700" },
  EN_COMPRA: { texto: "En compra", clase: "bg-[#e8f0fb] text-[#2b5ea7]" },
  COMPRADA: { texto: "Comprada", clase: "bg-verde-50 text-verde-700" },
  RECHAZADA: { texto: "No aprobada", clase: "bg-rojo-50 text-rojo" },
  ANULADA: { texto: "Anulada", clase: "bg-fondo text-suave" },
};

/** Nombre de un conteo: "jueves 8 de octubre" o "Semana del lunes 5 de octubre" */
export function nombreConteo(tipo: "DIA" | "SEMANA", fecha: string) {
  return tipo === "SEMANA" ? `Semana del ${fechaLarga(fecha)}` : fechaLarga(fecha);
}
