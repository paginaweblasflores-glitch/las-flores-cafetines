"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronRight, Package, Pencil, Undo2 } from "lucide-react";
import type { CambioRegistro } from "@/app/actions/personal";
import { Inicial, Modal } from "@/components/ui";
import { descPresentacion, fechaCorta, fechaISOLima, NOMBRE_PRESENTACION, soles } from "@/lib/format";

export type ProductoConteo = {
  id: number;
  productoId: number;
  nombre: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  /** Unidades en total en el cafetín */
  stock: number;
  precio: number;
  /** Producto del día: se cuenta a diario y lo que sobra es merma */
  perecible: boolean;
  /** Última vez que se contó (timestamp) */
  ultimoConteo: string | null;
  /** Avisar cuando quede esto o menos */
  stockMinimo: number;
  categoria: string;
};

export type Edicion = { unidades?: string; merma?: string; motivo?: string; motivoOtro?: string };

export const MOTIVOS_MERMA = ["No se vendió", "Se cayó", "Se rompió o malogró", "Se venció", "Otro"];
const MOTIVO_POR_DEFECTO = MOTIVOS_MERMA[0];

/** Sobrante: si no lo cambian, es todo lo que queda (los productos del día no pasan al día siguiente) */
function valorSobrante(e: Edicion, perecible: boolean) {
  return e.merma ?? (perecible ? (e.unidades ?? "") : "");
}

function leerMerma(e: Edicion, perecible: boolean) {
  const v = valorSobrante(e, perecible);
  const cantidad = v !== "" ? Number(v) : 0;
  const motivo = (e.motivo ?? MOTIVO_POR_DEFECTO) === "Otro" ? (e.motivoOtro ?? "").trim() : (e.motivo ?? MOTIVO_POR_DEFECTO);
  return { cantidad, motivo };
}

/** Lo que resulta de lo escrito en un producto: venta, sobrante, errores y el cambio a guardar */
export function evaluar(p: ProductoConteo, e: Edicion) {
  const valorUnidades = e.unidades ?? "";
  const nuevo = valorUnidades === "" ? null : Number(valorUnidades);
  const invalido = nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0);
  const vendio = nuevo !== null && !invalido ? p.stock - nuevo : 0;
  const merma = leerMerma(e, p.perecible);
  const quedan = nuevo ?? p.stock;
  const hayMerma = p.perecible && merma.cantidad > 0;
  const mermaInvalida =
    p.perecible && merma.cantidad !== 0 && (!Number.isInteger(merma.cantidad) || merma.cantidad < 0 || merma.cantidad > quedan);
  const faltaMotivo = hayMerma && merma.motivo.length === 0;
  const hayCambio = nuevo !== null || hayMerma;
  const error = invalido
    ? "Escribe un número entero (0 o más)."
    : mermaInvalida
      ? `El sobrante no puede ser mayor a lo que queda (${quedan}).`
      : faltaMotivo
        ? "Escribe el motivo del sobrante."
        : null;
  const cambio: CambioRegistro | null =
    hayCambio && !error ? { id: p.id, ...(nuevo !== null ? { unidades: nuevo } : {}), ...(hayMerma ? { merma } : {}) } : null;
  return { nuevo, invalido, vendio, merma, quedan, hayMerma, hayCambio, error, cambio };
}

/**
 * Una fila de la lista: nombre y estado en una línea. Al tocarla se abre la hoja para contar.
 * Lo escrito (sin guardar) se ve en verde; lo ya contado, con su marca.
 */
export function FilaConteo({
  p,
  e,
  contado,
  errorServidor,
  abrir,
}: {
  p: ProductoConteo;
  e: Edicion;
  contado: boolean;
  errorServidor: string | null;
  abrir: () => void;
}) {
  const r = evaluar(p, e);
  const error = r.error ?? errorServidor;
  const escrito = r.hayCambio && !error;

  let detalle: React.ReactNode;
  if (error) detalle = <span className="text-rojo">Revisa: {error}</span>;
  else if (escrito)
    detalle = (
      <span className="text-verde-700">
        Quedan {r.quedan}
        {r.vendio > 0 ? ` · vendiste ${r.vendio} (${soles(r.vendio * p.precio)})` : r.vendio < 0 ? " · más de lo que había" : ""}
        {r.hayMerma ? ` · sobran ${r.merma.cantidad}` : ""}
      </span>
    );
  else if (contado)
    detalle = (
      <span>
        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-3px] text-verde-700" />
        <span className="text-verde-700">{p.perecible ? "Contado hoy" : "Contado"}</span> · quedan {p.stock}
      </span>
    );
  else detalle = <span>Hay {p.stock} · {soles(p.precio)}</span>;

  return (
    <li>
      <button
        type="button"
        onClick={abrir}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fondo ${
          error ? "bg-rojo-50/60" : escrito ? "bg-verde-50/60" : ""
        }`}
      >
        <Inicial nombre={p.nombre} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.nombre}</span>
          <span className="block truncate text-xs text-suave">{detalle}</span>
        </span>
        {escrito ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-verde text-white">
            <Check className="h-4 w-4" />
          </span>
        ) : !contado && !error ? (
          <span className="chip shrink-0 bg-ambar-50 text-[#8a5a00]">Contar</span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
        )}
      </button>
    </li>
  );
}

/**
 * Hoja que sale desde abajo para contar un producto.
 * "Siguiente" pasa al próximo sin cerrar; el teclado "Siguiente/Ir" hace lo mismo.
 */
export function HojaConteo({
  p,
  e,
  contado,
  vendidoHoy,
  errorServidor,
  posicion,
  hayOtro,
  editar,
  descartar,
  cambiarPrecio,
  siguiente,
  cerrar,
}: {
  p: ProductoConteo;
  e: Edicion;
  contado: boolean;
  vendidoHoy: number;
  errorServidor: string | null;
  /** "3 de 12" */
  posicion: string;
  /** Hay otro producto por contar después de este */
  hayOtro: boolean;
  editar: (campo: keyof Edicion, valor: string) => void;
  descartar: () => void;
  cambiarPrecio: () => void;
  siguiente: () => void;
  cerrar: () => void;
}) {
  const r = evaluar(p, e);
  const error = r.error ?? errorServidor;
  const campo = useRef<HTMLInputElement>(null);
  // Al abrir (o pasar al siguiente) el cursor queda listo para escribir
  useEffect(() => {
    const t = setTimeout(() => campo.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [p.id]);

  const motivo = e.motivo ?? MOTIVO_POR_DEFECTO;

  return (
    <Modal
      abierto
      onCerrar={cerrar}
      titulo={p.nombre}
      subtitulo={
        <span>
          Había <b className="text-tinta">{p.stock}</b> · {soles(p.precio)}
          <button type="button" onClick={cambiarPrecio} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-verde-700 underline">
            <Pencil className="h-3 w-3" /> precio
          </button>
          <span className="ml-2 text-xs">· {posicion}</span>
        </span>
      }
    >
      {contado && !r.hayCambio && (
        <p className="mb-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
          Ya está {p.perecible ? "contado hoy" : "contado esta semana"}. Si te equivocaste, escribe lo que hay ahora y se corrige.
        </p>
      )}
      {!p.perecible && p.ultimoConteo && !contado && (
        <p className="mb-2 text-xs text-suave">Último conteo: {fechaCorta(fechaISOLima(p.ultimoConteo))}</p>
      )}
      {vendidoHoy !== 0 && <p className="mb-2 text-xs text-verde-700">Vendido hoy: {vendidoHoy}</p>}

      <div className={`grid gap-3 ${p.perecible ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="block">
          <span className="label">¿Cuántas quedan?</span>
          <input
            ref={campo}
            type="number"
            inputMode="numeric"
            min="0"
            value={e.unidades ?? ""}
            placeholder="0"
            onChange={(ev) => editar("unidades", ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key !== "Enter") return;
              ev.preventDefault();
              if (hayOtro) siguiente();
              else cerrar();
            }}
            enterKeyHint={hayOtro ? "next" : "done"}
            className="input h-16 text-center text-3xl font-semibold placeholder:text-suave/40"
            aria-label={`Quedan de ${p.nombre}`}
          />
        </label>
        {p.perecible && (
          <label className="block">
            <span className="label">Sobrante (no se vende)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={valorSobrante(e, p.perecible)}
              placeholder="0"
              onChange={(ev) => editar("merma", ev.target.value)}
              className={`input h-16 text-center text-3xl font-semibold placeholder:text-suave/40 ${r.hayMerma ? "border-ambar" : ""}`}
              aria-label={`Sobrante de ${p.nombre}`}
            />
          </label>
        )}
      </div>

      {!p.perecible && p.unidadesPorPresentacion > 1 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-suave">
          <Package className="h-3.5 w-3.5 shrink-0" />
          Viene en {descPresentacion(p.presentacion, p.unidadesPorPresentacion)}: suma también las de{" "}
          {NOMBRE_PRESENTACION[p.presentacion]?.toLowerCase()}s cerrad{p.presentacion === "PAQUETE" ? "os" : "as"}.
        </p>
      )}

      {/* Motivo del sobrante: botones grandes, sin listas desplegables */}
      {r.hayMerma && (
        <div className="mt-3">
          <p className="label">¿Por qué sobró?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_MERMA.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => editar("motivo", m)}
                className={`rounded-full px-3 py-2 text-sm font-medium ${
                  motivo === m ? "bg-panel text-white" : "border border-borde bg-white text-tinta"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {motivo === "Otro" && (
            <input
              value={e.motivoOtro ?? ""}
              onChange={(ev) => editar("motivoOtro", ev.target.value)}
              className="input mt-2"
              placeholder="Escribe el motivo"
              aria-label="Otro motivo"
            />
          )}
        </div>
      )}

      {/* Resultado antes de guardar */}
      {error ? (
        <p className="mt-3 rounded-xl bg-rojo-50 px-3 py-2 text-sm text-rojo">{error}</p>
      ) : r.nuevo !== null && r.vendio < 0 ? (
        <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          Es más de lo que había ({p.stock}). Si te equivocaste antes, se corrige; si no, queda como ajuste para que logística lo
          revise.
        </p>
      ) : r.nuevo === 0 && p.stock > 0 ? (
        <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          ¿Se acabó todo? Vendiste {p.stock} = <b>{soles(p.stock * p.precio)}</b>. Revisa que sea correcto.
        </p>
      ) : r.hayCambio ? (
        <p className="mt-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
          {r.vendio > 0 ? (
            <>
              Vendiste <b>{r.vendio}</b> = <b>{soles(r.vendio * p.precio)}</b>
            </>
          ) : (
            "Sin ventas desde el último conteo"
          )}
          {r.hayMerma && (
            <>
              {" "}
              · <b>{r.merma.cantidad}</b> de sobrante ({r.merma.motivo || "sin motivo"})
            </>
          )}
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        {r.hayCambio && (
          <button type="button" onClick={descartar} className="btn-secundario h-12 px-3" aria-label="Borrar lo escrito" title="Borrar lo escrito">
            <Undo2 className="h-4 w-4" />
          </button>
        )}
        {hayOtro ? (
          <>
            <button type="button" onClick={cerrar} className="btn-secundario h-12 flex-1">
              Listo
            </button>
            <button type="button" onClick={siguiente} className="btn-primario h-12 flex-[1.4] text-base">
              Siguiente <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button type="button" onClick={cerrar} className="btn-primario h-12 flex-1 text-base">
            <Check className="h-4 w-4" /> Listo
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-suave">Se guarda todo junto con &quot;Guardar conteo&quot;.</p>
    </Modal>
  );
}
