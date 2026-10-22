import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { check, db } from "./supabase";

/**
 * IA para leer boletas de compra (Entregas → "Llenar con IA").
 * La clave se pega en Administración → API: se guarda CIFRADA en la base (así funciona en Vercel
 * sin tocar nada más) y, en la PC de desarrollo, también en .env. Si no hay clave en la base,
 * se usa la variable de entorno (GEMINI_API_KEY / DEEPSEEK_API_KEY) puesta en Vercel.
 */

export type Proveedor = "GEMINI" | "DEEPSEEK";

export const PROVEEDORES: Record<Proveedor, { nombre: string; variable: string; modeloPorDefecto: string; leeFotos: boolean }> = {
  GEMINI: { nombre: "Google Gemini", variable: "GEMINI_API_KEY", modeloPorDefecto: "gemini-3.8-flash", leeFotos: true },
  // La API de DeepSeek (por ahora) solo trabaja con texto: no puede leer la foto de la boleta
  DEEPSEEK: { nombre: "DeepSeek", variable: "DEEPSEEK_API_KEY", modeloPorDefecto: "deepseek-chat", leeFotos: false },
};

const CLAVE = (p: Proveedor) => `ia.${p.toLowerCase()}.clave`;
const MODELO = (p: Proveedor) => `ia.${p.toLowerCase()}.modelo`;

// ---------- Cifrado (la clave de la IA nunca queda en texto plano en la base) ----------
function llaveCifrado() {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  return createHash("sha256").update(`las-flores-ia:${base}`).digest();
}
function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llaveCifrado(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}
function descifrar(valor: string): string | null {
  try {
    const [iv, tag, datos] = valor.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", llaveCifrado(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
  } catch {
    // Si cambió la service_role key ya no se puede leer: se pide pegarla de nuevo
    return null;
  }
}

// ---------- Configuración ----------
export async function leerConfiguracion(): Promise<Map<string, string>> {
  const filas = check(await db().from("configuracion").select("clave, valor").like("clave", "ia.%")) as { clave: string; valor: string }[];
  return new Map(filas.map((f) => [f.clave, f.valor]));
}

export async function guardarConfiguracion(clave: string, valor: string | null, usuarioId: number) {
  if (valor === null) check(await db().from("configuracion").delete().eq("clave", clave));
  else check(await db().from("configuracion").upsert({ clave, valor, updated_at: new Date().toISOString(), updated_by: usuarioId }));
}

/** Clave a usar: la del panel (base) o, si no hay, la variable de entorno de Vercel */
export function claveDe(conf: Map<string, string>, p: Proveedor): { clave: string | null; origen: "PANEL" | "ENTORNO" | null } {
  const guardada = conf.get(CLAVE(p));
  const delPanel = guardada ? descifrar(guardada) : null;
  if (delPanel) return { clave: delPanel, origen: "PANEL" };
  const env = process.env[PROVEEDORES[p].variable]?.trim();
  if (env && !env.startsWith("PEGA_AQUI")) return { clave: env, origen: "ENTORNO" };
  return { clave: null, origen: null };
}

export const modeloDe = (conf: Map<string, string>, p: Proveedor) => conf.get(MODELO(p)) || PROVEEDORES[p].modeloPorDefecto;

/**
 * El "flash" estable más nuevo de la lista (gemini-3.8-flash antes que gemini-3.7-flash…).
 * Google retira los modelos viejos para usuarios nuevos: así siempre se usa uno vigente.
 */
export function mejorModeloGemini(modelos: string[]): string | null {
  // 3.10 es más nuevo que 3.8: se compara mayor y menor por separado
  const version = (m: string) => {
    const x = /^gemini-(\d+)(?:\.(\d+))?-flash$/.exec(m);
    return x ? Number(x[1]) * 1000 + Number(x[2] ?? 0) : -1;
  };
  const estables = modelos.filter((m) => version(m) >= 0).sort((a, b) => version(b) - version(a));
  return estables[0] ?? modelos.find((m) => m === "gemini-flash-latest") ?? null;
}

/**
 * Orden en que se prueban los modelos si uno está saturado: el elegido, los dos flash estables
 * más nuevos, el "lite" más nuevo, el alias "latest" y la versión preview.
 */
export function modelosDeRespaldo(elegido: string, modelos: string[]): string[] {
  const version = (m: string, re: RegExp) => {
    const x = re.exec(m);
    return x ? Number(x[1]) * 1000 + Number(x[2] ?? 0) : -1;
  };
  const ordenar = (re: RegExp) =>
    modelos.filter((m) => version(m, re) >= 0).sort((a, b) => version(b, re) - version(a, re));
  const flash = ordenar(/^gemini-(\d+)(?:\.(\d+))?-flash$/);
  const lite = ordenar(/^gemini-(\d+)(?:\.(\d+))?-flash-lite$/);
  const extra = ["gemini-flash-latest", "gemini-3-flash-preview"].filter((m) => modelos.includes(m));
  // El "lite" va antes del preview: cuando hay mucha demanda suele responder (el preview a veces se cuelga)
  return [...new Set([elegido, ...flash.slice(0, 2), ...lite.slice(0, 1), ...extra])];
}

export async function guardarClave(p: Proveedor, clave: string | null, usuarioId: number) {
  await guardarConfiguracion(CLAVE(p), clave ? cifrar(clave) : null, usuarioId);
}
export async function guardarModelo(p: Proveedor, modelo: string, usuarioId: number) {
  await guardarConfiguracion(MODELO(p), modelo, usuarioId);
}

/** "AIzaSy••••••••3kQw": para mostrar sin revelar la clave */
export const ocultar = (clave: string) => (clave.length <= 10 ? "••••••" : `${clave.slice(0, 6)}••••••••${clave.slice(-4)}`);

/**
 * En la PC de desarrollo también se escribe en .env (pedido: "que se guarde en .env").
 * En Vercel los archivos no se pueden modificar: ahí vale lo guardado en la base o la variable de Vercel.
 */
export async function escribirEnEnv(variable: string, valor: string | null) {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const fs = await import("node:fs/promises");
    const ruta = `${process.cwd()}/.env`;
    const actual = await fs.readFile(ruta, "utf8").catch(() => "");
    const lineas = actual.split(/\r?\n/).filter((l) => !l.startsWith(`${variable}=`));
    while (lineas.length && lineas.at(-1) === "") lineas.pop();
    if (valor) lineas.push(`${variable}=${valor}`);
    await fs.writeFile(ruta, lineas.join("\n") + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

// ---------- Probar la conexión (y listar modelos) ----------
export async function probarClave(p: Proveedor, clave: string): Promise<{ ok: true; modelos: string[] } | { ok: false; error: string }> {
  try {
    if (p === "GEMINI") {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": clave },
        cache: "no-store",
      });
      if (!r.ok) return { ok: false, error: await errorDe(r) };
      const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      const modelos = (j.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) && !/embedding|tts|image|audio|live/.test(m.name))
        .map((m) => m.name.replace(/^models\//, ""))
        .sort();
      return { ok: true, modelos };
    }
    const r = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${clave}` }, cache: "no-store" });
    if (!r.ok) return { ok: false, error: await errorDe(r) };
    const j = (await r.json()) as { data?: { id: string }[] };
    return { ok: true, modelos: (j.data ?? []).map((m) => m.id) };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servicio de IA. Revisa el internet." };
  }
}

async function errorDe(r: Response) {
  const texto = await r.text().catch(() => "");
  if (r.status === 400 && /API_KEY_INVALID|API key not valid/i.test(texto)) return "La clave no es válida. Cópiala de nuevo.";
  if (r.status === 401 || r.status === 403) return "La clave no es válida o no tiene permiso.";
  if (r.status === 429) return "Se pasó el límite de uso de la IA por ahora. Espera un minuto y vuelve a intentar.";
  if (r.status === 404) return "Ese modelo no existe o no está disponible para tu clave. Elige otro en Administración → API.";
  if (r.status === 503) return "Google Gemini está saturado en este momento (mucha demanda). Intenta de nuevo en 1 o 2 minutos.";
  if (r.status >= 500) return "El servicio de IA no responde en este momento. Intenta en un rato.";
  let msg = "";
  try {
    msg = (JSON.parse(texto) as { error?: { message?: string } }).error?.message ?? "";
  } catch {}
  return `Error de la IA (${r.status})${msg ? `: ${msg}` : ""}`;
}

// ---------- Leer la boleta con Gemini ----------
export type Archivo = { tipo: string; base64: string; nombre?: string };

/** Llama a Gemini con fotos/PDF y pide la respuesta en JSON con el esquema dado */
export async function geminiJSON<T>(o: {
  clave: string;
  modelo: string;
  sistema: string;
  partes: ({ texto: string } | { archivo: Archivo })[];
  esquema: object;
  /** Si no responde en este tiempo, se corta (para probar con otro modelo) */
  limiteMs?: number;
}): Promise<{ ok: true; datos: T } | { ok: false; error: string; estado?: number }> {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": o.clave },
      cache: "no-store",
      signal: AbortSignal.timeout(o.limiteMs ?? 60000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.sistema }] },
        contents: [
          {
            role: "user",
            parts: o.partes.map((p) => ("texto" in p ? { text: p.texto } : { inlineData: { mimeType: p.archivo.tipo, data: p.archivo.base64 } })),
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: o.esquema },
      }),
    });
    if (!r.ok) return { ok: false, error: await errorDe(r), estado: r.status };
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    const texto = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!texto) {
      return { ok: false, error: j.promptFeedback?.blockReason ? "La IA no quiso leer el archivo." : "La IA no devolvió nada. Prueba con una foto más clara." };
    }
    return { ok: true, datos: JSON.parse(texto) as T };
  } catch (e) {
    if (e instanceof SyntaxError) return { ok: false, error: "La IA respondió algo incompleto. Vuelve a intentar." };
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: "La IA tardó demasiado en responder. Vuelve a intentar.", estado: 504 };
    }
    return { ok: false, error: "No se pudo conectar con la IA. Revisa el internet." };
  }
}

/** Para comparar textos de la boleta: mayúsculas, sin tildes, sin signos, espacios simples */
export const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
