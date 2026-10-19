"use client";

import { useRef, useState, useTransition } from "react";
import { Brain, CheckCircle2, FileText, ImageIcon, KeyRound, Link2, Plug, Sparkles, Trash2, Upload, X } from "lucide-react";
import {
  borrarDocumentoIA,
  borrarEquivalenciaIA,
  guardarClaveIA,
  guardarModeloIA,
  probarIA,
  quitarClaveIA,
  subirDocumentoIA,
} from "@/app/actions/ia";
import { avisar } from "@/components/ui";
import { MAX_SUBIDA, pesoTexto, prepararArchivo } from "@/lib/comprimir";
import type { Proveedor } from "@/lib/ia";

type InfoProveedor = {
  id: Proveedor;
  nombre: string;
  variable: string;
  leeFotos: boolean;
  clave: string | null;
  origen: "PANEL" | "ENTORNO" | null;
  modelo: string;
};

const DONDE_CLAVE: Record<Proveedor, { url: string; texto: string }> = {
  GEMINI: { url: "https://aistudio.google.com/apikey", texto: "Google AI Studio → Get API key" },
  DEEPSEEK: { url: "https://platform.deepseek.com/api_keys", texto: "DeepSeek Platform → API keys" },
};

export function ConfiguracionIA({
  proveedores,
  documentos,
  equivalencias,
}: {
  proveedores: InfoProveedor[];
  documentos: { id: number; nombre: string; tipo: string; tamano: number; created_at: string }[];
  equivalencias: { id: number; texto: string; usos: number; producto: string }[];
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {proveedores.map((p) => (
          <TarjetaProveedor key={p.id} p={p} />
        ))}
      </div>
      <Documentos documentos={documentos} />
      <Equivalencias lista={equivalencias} />
    </div>
  );
}

function TarjetaProveedor({ p }: { p: InfoProveedor }) {
  const [clave, setClave] = useState("");
  const [modelos, setModelos] = useState<string[]>([]);
  const [pendiente, iniciar] = useTransition();
  const conectada = !!p.clave;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarClaveIA(p.id, clave);
      if (r.ok) {
        setClave("");
        avisar(r.mensaje ?? "Guardado");
      } else avisar(r.error, "error");
    });
  const probar = () =>
    iniciar(async () => {
      const r = await probarIA(p.id);
      if (r.ok) {
        setModelos(r.modelos);
        avisar(r.mensaje);
      } else avisar(r.error, "error");
    });
  const quitar = () => {
    if (!confirm(`¿Quitar la clave de ${p.nombre}? La IA dejará de funcionar hasta que pegues otra.`)) return;
    iniciar(async () => {
      const r = await quitarClaveIA(p.id);
      if (r.ok) avisar(r.mensaje ?? "Listo");
      else avisar(r.error, "error");
    });
  };
  const cambiarModelo = (m: string) =>
    iniciar(async () => {
      const r = await guardarModeloIA(p.id, m);
      if (r.ok) avisar(r.mensaje ?? "Guardado");
      else avisar(r.error, "error");
    });

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-medium">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-verde-50 text-verde">
            {p.id === "GEMINI" ? <Sparkles className="h-4 w-4" /> : <Brain className="h-4 w-4" />}
          </span>
          {p.nombre}
        </h2>
        {conectada ? (
          <span className="chip bg-verde-50 text-verde-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conectada
          </span>
        ) : (
          <span className="chip bg-fondo text-suave">Sin conectar</span>
        )}
      </div>

      {p.leeFotos ? (
        <p className="mb-3 text-sm text-suave">Lee las fotos y PDF de las boletas. Es la que usa &quot;Llenar con IA&quot; en Entregas.</p>
      ) : (
        <p className="mb-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          Por ahora la API de DeepSeek solo trabaja con texto: no puede leer la foto de la boleta. Puedes dejar la clave guardada para cuando se use.
        </p>
      )}

      {conectada && (
        <div className="mb-3 rounded-xl border border-borde px-3 py-2 text-sm">
          <p className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-suave" />
            <span className="font-mono">{p.clave}</span>
          </p>
          <p className="mt-0.5 text-xs text-suave">
            {p.origen === "PANEL" ? "Guardada en el sistema (funciona aquí y en Vercel)." : `Tomada de la variable ${p.variable} de Vercel / .env.`}
          </p>
        </div>
      )}

      <label className="block">
        <span className="label">{conectada ? "Cambiar clave (API key)" : "Pega tu clave (API key)"}</span>
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && clave.trim() && guardar()}
            className="input font-mono"
            placeholder={p.id === "GEMINI" ? "AIza..." : "sk-..."}
          />
          <button onClick={guardar} disabled={pendiente || !clave.trim()} className="btn-primario shrink-0">
            <Plug className="h-4 w-4" /> {pendiente ? "Probando..." : "Conectar"}
          </button>
        </div>
      </label>
      <p className="mt-1.5 text-xs text-suave">
        Se prueba antes de guardar y se guarda cifrada. Dónde sacarla:{" "}
        <a href={DONDE_CLAVE[p.id].url} target="_blank" rel="noreferrer" className="text-verde-700 underline">
          {DONDE_CLAVE[p.id].texto}
        </a>
      </p>

      {conectada && (
        <>
          <label className="mt-4 block">
            <span className="label">Modelo</span>
            <div className="flex gap-2">
              <select value={p.modelo} onChange={(e) => cambiarModelo(e.target.value)} disabled={pendiente} className="input">
                {[...new Set([p.modelo, ...modelos])].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button onClick={probar} disabled={pendiente} className="btn-secundario shrink-0">
                <Link2 className="h-4 w-4" /> Probar
              </button>
            </div>
          </label>
          <p className="mt-1.5 text-xs text-suave">
            {modelos.length ? "Elige el modelo. Los «flash» son rápidos y baratos: ideales para boletas." : "Toca «Probar» para ver todos los modelos de tu clave."}
          </p>
          {p.origen === "PANEL" && (
            <button onClick={quitar} disabled={pendiente} className="mt-4 text-sm text-rojo hover:underline">
              Quitar clave
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Documentos({ documentos }: { documentos: { id: number; nombre: string; tipo: string; tamano: number }[] }) {
  const [pendiente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const total = documentos.reduce((a, d) => a + d.tamano, 0);

  async function subir(lista: FileList | null) {
    if (!lista?.length) return;
    for (const original of Array.from(lista)) {
      const f = await prepararArchivo(original);
      if (f.size > MAX_SUBIDA) {
        avisar(`"${original.name}" pesa ${pesoTexto(f.size)}. El máximo es 4 MB.`, "error");
        continue;
      }
      const fd = new FormData();
      fd.set("archivo", f);
      fd.set("nombre", original.name.replace(/\.\w+$/, ""));
      await new Promise<void>((listo) =>
        iniciar(async () => {
          const r = await subirDocumentoIA(fd);
          if (r.ok) avisar(r.mensaje ?? "Subido");
          else avisar(r.error, "error");
          listo();
        }),
      );
    }
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 text-suave" /> Memoria: documentos de referencia
          </h2>
          <p className="text-sm text-suave">
            Hojas de referencia, listas de precios, boletas de ejemplo… La IA las mira en cada lectura como apoyo (no se registran). Máximo 12 MB en total.
          </p>
        </div>
        <button onClick={() => entrada.current?.click()} disabled={pendiente} className="btn-secundario shrink-0">
          <Upload className="h-4 w-4" /> {pendiente ? "Subiendo..." : "Subir PDF o foto"}
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => subir(e.target.files)}
        />
      </div>
      {documentos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-campo/50 px-4 py-6 text-center text-sm text-suave">Todavía no hay documentos.</p>
      ) : (
        <ul className="divide-y divide-borde rounded-xl border border-borde">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {d.tipo === "application/pdf" ? <FileText className="h-4 w-4 shrink-0 text-rojo" /> : <ImageIcon className="h-4 w-4 shrink-0 text-[#2b5ea7]" />}
              <span className="min-w-0 flex-1 truncate font-medium">{d.nombre}</span>
              <span className="text-xs text-suave">{pesoTexto(d.tamano)}</span>
              <button
                onClick={() =>
                  confirm(`¿Quitar "${d.nombre}" de la memoria de la IA?`) &&
                  iniciar(async () => {
                    const r = await borrarDocumentoIA(d.id);
                    if (r.ok) avisar(r.mensaje ?? "Listo");
                    else avisar(r.error, "error");
                  })
                }
                className="rounded-lg p-1.5 text-suave hover:bg-rojo-50 hover:text-rojo"
                aria-label={`Quitar ${d.nombre}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          <li className="px-3 py-2 text-right text-xs text-suave">Total {pesoTexto(total)} de 12 MB</li>
        </ul>
      )}
    </div>
  );
}

function Equivalencias({ lista }: { lista: { id: number; texto: string; usos: number; producto: string }[] }) {
  const [pendiente, iniciar] = useTransition();
  const [filtro, setFiltro] = useState("");
  const f = filtro.trim().toUpperCase();
  const visibles = f ? lista.filter((e) => e.texto.includes(f) || e.producto.includes(f)) : lista;
  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-medium">
        <Brain className="h-4 w-4 text-suave" /> Lo que aprendió ({lista.length})
      </h2>
      <p className="mb-3 text-sm text-suave">
        Cada vez que se registra una entrega llenada con IA, se guarda cómo aparece cada producto en la boleta. Si alguien lo corrigió, la próxima vez lo reconoce
        solo. Si una equivalencia está mal, quítala.
      </p>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-campo/50 px-4 py-6 text-center text-sm text-suave">Todavía no aprendió nada. Se llena solo con el uso.</p>
      ) : (
        <>
          {lista.length > 8 && (
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} className="input mb-3" placeholder="Buscar..." />
          )}
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-borde">
            <table className="tabla">
              <thead>
                <tr>
                  <th>En la boleta dice</th>
                  <th>Es el producto</th>
                  <th className="text-right">Veces</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono text-xs">{e.texto}</td>
                    <td className="font-medium">{e.producto}</td>
                    <td className="text-right tabular-nums">{e.usos}</td>
                    <td className="w-10">
                      <button
                        onClick={() =>
                          iniciar(async () => {
                            const r = await borrarEquivalenciaIA(e.id);
                            if (r.ok) avisar(r.mensaje ?? "Listo");
                            else avisar(r.error, "error");
                          })
                        }
                        disabled={pendiente}
                        className="rounded-lg p-1.5 text-suave hover:bg-rojo-50 hover:text-rojo"
                        aria-label="Olvidar"
                        title="Olvidar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
