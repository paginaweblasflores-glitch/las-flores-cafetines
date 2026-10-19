"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { leerBoleta, type BoletaLeida } from "@/app/actions/ia";
import { MAX_SUBIDA, pesoTexto, prepararArchivo } from "@/lib/comprimir";

const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * "Llenar con IA": se activa, se sube la foto/PDF de la boleta y la IA llena la entrega.
 * No registra nada: la persona revisa la lista y toca "Registrar entrega".
 */
export function PanelIA({
  conectada,
  esAdmin,
  colegioId,
  colegioNombre,
  onLeida,
}: {
  conectada: boolean;
  esAdmin: boolean;
  colegioId: number;
  colegioNombre: string;
  onLeida: (b: BoletaLeida) => void;
}) {
  const [activo, setActivo] = useState(false);
  const [archivos, setArchivos] = useState<{ f: File; url: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [leyendo, iniciar] = useTransition();
  const [segundos, setSegundos] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const camara = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const peso = archivos.reduce((a, x) => a + x.f.size, 0);

  // Contador mientras lee (para que se sepa que está trabajando)
  useEffect(() => {
    if (!leyendo) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [leyendo]);

  // Liberar las vistas previas al salir de la página
  const vigentes = useRef(archivos);
  useEffect(() => {
    vigentes.current = archivos;
  }, [archivos]);
  useEffect(() => () => vigentes.current.forEach((a) => a.url && URL.revokeObjectURL(a.url)), []);

  async function agregar(lista: FileList | File[] | null) {
    if (!lista || !lista.length) return;
    setError(null);
    setPreparando(true);
    const nuevos: { f: File; url: string | null }[] = [];
    for (const original of Array.from(lista)) {
      const f = await prepararArchivo(original);
      if (!TIPOS.includes(f.type)) {
        setError(`"${original.name}" no es una foto o PDF que se pueda leer.`);
        continue;
      }
      nuevos.push({ f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
    }
    setArchivos((a) => [...a, ...nuevos]);
    setPreparando(false);
    if (entrada.current) entrada.current.value = "";
    if (camara.current) camara.current.value = "";
  }

  function leer() {
    if (!archivos.length) return setError("Sube la foto o el PDF de la boleta.");
    if (peso > MAX_SUBIDA) return setError(`Los archivos pesan ${pesoTexto(peso)}. El máximo es 4 MB: quita alguno.`);
    setError(null);
    setResumen(null);
    setSegundos(0);
    const fd = new FormData();
    fd.set("colegioId", String(colegioId));
    archivos.forEach((a) => fd.append("archivos", a.f));
    iniciar(async () => {
      const r = await leerBoleta(fd);
      if (!r.ok) return setError(r.error);
      if (r.lineas.length === 0) return setError("No encontré productos en la boleta. Prueba con una foto más clara y derecha.");
      onLeida(r);
      const nuevos = r.lineas.filter((l) => !l.productoId).length;
      const agregar = r.lineas.filter((l) => l.productoId && !l.productoColegioId).length;
      const revisar = r.lineas.filter((l) => l.confianza !== "ALTA").length;
      setResumen(
        [
          `Leí ${r.lineas.length} producto${r.lineas.length === 1 ? "" : "s"} en ${r.segundos} s`,
          nuevos ? `${nuevos} nuevo${nuevos === 1 ? "" : "s"}` : "",
          agregar ? `${agregar} se agrega${agregar === 1 ? "" : "n"} a ${colegioNombre}` : "",
          revisar ? `${revisar} para revisar` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      archivos.forEach((a) => a.url && URL.revokeObjectURL(a.url));
      setArchivos([]);
    });
  }

  return (
    <div className={`card p-5 ${activo ? "ring-2 ring-[#7c5cd6]/40" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${activo ? "bg-[#7c5cd6] text-white" : "bg-[#f1ebfa] text-[#6a3fb0]"}`}>
            <Sparkles className="h-4 w-4" />
          </span>
          Llenar con IA
        </h2>
        {/* Interruptor */}
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-label="Llenar con IA"
          disabled={!conectada}
          onClick={() => setActivo((v) => !v)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${activo ? "bg-[#7c5cd6]" : "bg-campo/60"}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${activo ? "translate-x-5" : ""}`} />
        </button>
      </div>

      {!conectada ? (
        <p className="mt-3 text-sm text-suave">
          La IA todavía no está conectada.{" "}
          {esAdmin ? (
            <Link href="/ia" className="font-medium text-verde-700 underline">
              Conectarla en Administración → API
            </Link>
          ) : (
            "Pide a administración que la conecte."
          )}
        </p>
      ) : !activo ? (
        <p className="mt-3 text-sm text-suave">Sube la foto de la boleta y la IA llena la entrega por ti. Tú solo revisas y tocas «Registrar entrega».</p>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-xs text-suave">
            Se llena para <b className="text-tinta">{colegioNombre}</b>. Puedes subir varias fotos (páginas) de la boleta.
          </p>

          {/* Zona para soltar / elegir archivos */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              agregar(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
              arrastrando ? "border-[#7c5cd6] bg-[#f1ebfa]" : "border-campo/50"
            }`}
          >
            <Upload className="mx-auto mb-1.5 h-6 w-6 text-suave" />
            <p className="text-sm">Arrastra aquí la foto o el PDF</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => entrada.current?.click()} disabled={leyendo || preparando} className="btn-secundario py-1.5 text-sm">
                <FileText className="h-4 w-4" /> Elegir archivo
              </button>
              <button type="button" onClick={() => camara.current?.click()} disabled={leyendo || preparando} className="btn-secundario py-1.5 text-sm lg:hidden">
                <Camera className="h-4 w-4" /> Tomar foto
              </button>
            </div>
            <input
              ref={entrada}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => agregar(e.target.files)}
            />
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => agregar(e.target.files)} />
          </div>

          {(archivos.length > 0 || preparando) && (
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {archivos.map((a, i) => (
                <li key={i} className="relative overflow-hidden rounded-lg border border-borde bg-fondo">
                  {a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={`Página ${i + 1}`} className="h-20 w-full object-cover" />
                  ) : (
                    <span className="grid h-20 place-items-center text-rojo">
                      <FileText className="h-6 w-6" />
                    </span>
                  )}
                  <span className="block truncate px-1.5 py-0.5 text-[10px] text-suave">{pesoTexto(a.f.size)}</span>
                  {!leyendo && (
                    <button
                      type="button"
                      onClick={() => {
                        if (a.url) URL.revokeObjectURL(a.url);
                        setArchivos((l) => l.filter((_, j) => j !== i));
                      }}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                      aria-label="Quitar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
              {preparando && (
                <li className="grid h-[100px] place-items-center rounded-lg border border-borde text-suave">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </li>
              )}
            </ul>
          )}

          {error && <p className="mt-3 rounded-xl bg-rojo-50 px-3 py-2 text-sm text-rojo">{error}</p>}

          <button
            type="button"
            onClick={leer}
            disabled={leyendo || preparando || archivos.length === 0}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#7c5cd6] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6a4bc4] disabled:opacity-50"
          >
            {leyendo ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la boleta… {segundos} s
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Leer boleta y llenar
              </>
            )}
          </button>
          {leyendo && <p className="mt-2 text-center text-xs text-suave">Suele tardar entre 10 y 30 segundos.</p>}

          {resumen && (
            <div className="mt-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
              <p className="font-medium">{resumen}.</p>
              <p className="mt-0.5 text-xs">Revisa la lista (lo marcado en ámbar o «Nuevo») y toca «Registrar entrega».</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
