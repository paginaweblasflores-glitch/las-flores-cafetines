"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronRight, Package, Pencil, Undo2 } from "lucide-react";
import type { CambioRegistro } from "@/app/actions/personal";
import { Inicial, Modal } from "@/components/ui";
import {
  descPresentacion,
  enEnvases,
  ENVASES,
  esEnvase,
  fechaCorta,
  fechaISOLima,
  litrosTexto,
  NOMBRE_PRESENTACION,
  partesPorEnvase,
  soles,
} from "@/lib/format";

export type ProductoConteo = {
  id: number;
  productoId: number;
  nombre: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  /** Unidades en total en el cafetín */
  stock: number;
  precio: number;
  /** En descuento: el precio de siempre (null = precio normal) */
  precioNormal: number | null;
  /** Acompañante (salsas): no se cuenta ni se vende; sí se pide en Reposición */
  acompanante: boolean;
  /** Cuándo entró en el inventario de arranque (null = falta) */
  arranqueAt?: string | null;
  /** Producto del día: se cuenta a diario y lo que sobra es merma */
  perecible: boolean;
  /** Del día que manda la cocina (false = lo prepara el mismo personal: al contar dice cuánto preparó) */
  deCocina: boolean;
  /** Última vez que se contó (timestamp) */
  ultimoConteo: string | null;
  /** Avisar cuando quede esto o menos */
  stockMinimo: number;
  categoria: string;
};

export type Edicion = { preparado?: string; unidades?: string; merma?: string; motivo?: string; motivoOtro?: string };

/** Del día que prepara el mismo personal: antes de contar dice cuánto preparó */
export const preparaElPersonal = (p: ProductoConteo) => p.perecible && !p.deCocina;

export const MOTIVO_DEVUELTO = "Devuelto a cocina";
export const MOTIVOS_MERMA = ["No se vendió", MOTIVO_DEVUELTO, "Se cayó", "Se rompió o malogró", "Se venció", "Otro"];
const MOTIVO_POR_DEFECTO = MOTIVOS_MERMA[0];

/** Lo que manda la cocina y se acumula: al contar se puede devolver una parte a la cocina (no pasa al día siguiente) */
export const devuelveACocina = (p: Pick<ProductoConteo, "perecible" | "deCocina">) => !p.perecible && p.deCocina;
/** Tiene campo de sobrante: los del día (lo que sobra se retira) y lo de cocina que se acumula (lo devuelto) */
export const conSobrante = (p: Pick<ProductoConteo, "perecible" | "deCocina">) => p.perecible || devuelveACocina(p);

/** Sobrante: si no lo cambian, es todo lo que queda (los productos del día no pasan al día siguiente) */
function valorSobrante(e: Edicion, perecible: boolean) {
  return e.merma ?? (perecible ? (e.unidades ?? "") : "");
}

function leerMerma(e: Edicion, p: Pick<ProductoConteo, "perecible" | "deCocina">) {
  const v = valorSobrante(e, p.perecible);
  const cantidad = v !== "" ? Number(v) : 0;
  // Lo que se acumula y se devuelve: el motivo siempre es "Devuelto a cocina"
  if (devuelveACocina(p)) return { cantidad, motivo: MOTIVO_DEVUELTO };
  const motivo = (e.motivo ?? MOTIVO_POR_DEFECTO) === "Otro" ? (e.motivoOtro ?? "").trim() : (e.motivo ?? MOTIVO_POR_DEFECTO);
  return { cantidad, motivo };
}

/** Lo que resulta de lo escrito en un producto: venta, sobrante, errores y el cambio a guardar */
export function evaluar(p: ProductoConteo, e: Edicion) {
  // Lo que preparó hoy el personal (solo en los del día que no manda la cocina)
  const valorPreparado = preparaElPersonal(p) ? (e.preparado ?? "") : "";
  const preparado = valorPreparado === "" ? 0 : Number(valorPreparado);
  const preparadoInvalido = valorPreparado !== "" && (!Number.isInteger(preparado) || preparado < 0);
  const habia = p.stock + (preparadoInvalido ? 0 : preparado);
  const valorUnidades = e.unidades ?? "";
  const nuevo = valorUnidades === "" ? null : Number(valorUnidades);
  const invalido = nuevo !== null && (!Number.isInteger(nuevo) || nuevo < 0);
  const vendio = nuevo !== null && !invalido ? habia - nuevo : 0;
  const merma = leerMerma(e, p);
  const quedan = nuevo ?? habia;
  const hayMerma = conSobrante(p) && merma.cantidad > 0;
  const mermaInvalida =
    conSobrante(p) && merma.cantidad !== 0 && (!Number.isInteger(merma.cantidad) || merma.cantidad < 0 || merma.cantidad > quedan);
  const faltaMotivo = hayMerma && merma.motivo.length === 0;
  const hayCambio = nuevo !== null || hayMerma || preparado > 0;
  const error = preparadoInvalido
    ? "Lo preparado debe ser un número entero."
    : preparado > 0 && nuevo === null
      ? "Escribe también cuántos quedan."
      : invalido
        ? "Escribe un número entero (0 o más)."
        : mermaInvalida
          ? `El sobrante no puede ser mayor a lo que queda (${quedan}).`
          : faltaMotivo
            ? "Escribe el motivo del sobrante."
            : null;
  const cambio: CambioRegistro | null =
    hayCambio && !error
      ? {
          id: p.id,
          ...(preparado > 0 ? { preparado } : {}),
          ...(nuevo !== null ? { unidades: nuevo } : {}),
          ...(hayMerma ? { merma } : {}),
        }
      : null;
  return { nuevo, invalido, vendio, merma, quedan, hayMerma, hayCambio, error, cambio, habia, preparado };
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
        {r.hayMerma ? (p.perecible ? ` · sobran ${r.merma.cantidad}` : ` · devuelves ${r.merma.cantidad}`) : ""}
      </span>
    );
  else if (contado)
    detalle = (
      <span>
        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 align-[-3px] text-verde-700" />
        <span className="text-verde-700">Contado hoy</span> · quedan {p.stock}
      </span>
    );
  else
    detalle = (
      <span>
        {preparaElPersonal(p)
          ? "Lo preparas tú"
          : `Hay ${p.stock}${esEnvase(p.presentacion) ? ` ${ENVASES[p.presentacion].partes}` : ""}`}{" "}
        · {soles(p.precio)}
        {p.precioNormal != null ? " (descuento)" : ""}
        {!p.perecible && p.ultimoConteo ? ` · contado el ${fechaCorta(fechaISOLima(p.ultimoConteo))}` : ""}
      </span>
    );

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
          (p.stock > 0 || preparaElPersonal(p)) && p.perecible ? (
            <span className="chip shrink-0 chip-atencion">Contar</span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
          )
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
          Había <b className="text-tinta">{p.stock}</b>
          {esEnvase(p.presentacion) ? ` ${ENVASES[p.presentacion].partes}` : ""} · {soles(p.precio)}
          {p.precioNormal != null && <span className="chip chip-info ml-1.5 align-middle">descuento</span>}
          <button
            type="button"
            onClick={cambiarPrecio}
            className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-verde-700 underline"
          >
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

      {preparaElPersonal(p) && (
        <label className="mb-3 block">
          <span className="label">¿Cuántos preparaste hoy?</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={e.preparado ?? ""}
            placeholder="0"
            onChange={(ev) => editar("preparado", ev.target.value.replace(/\D/g, ""))}
            className="input h-14 text-center text-2xl font-semibold placeholder:text-suave/40"
            aria-label={`Preparados hoy de ${p.nombre}`}
          />
          {r.preparado > 0 && (
            <span className="mt-1 block text-xs text-suave">
              Con lo que había ({p.stock}) suman <b className="text-tinta">{r.habia}</b>.
            </span>
          )}
        </label>
      )}

      {/* Balde o taper: se toca cuánto queda en el envase (el sistema lo pasa a vasos o porciones) */}
      {esEnvase(p.presentacion) && p.presentacion !== "LITRO" && p.unidadesPorPresentacion > 0 && (
        <div className="mb-3">
          <p className="label">
            ¿Cuánto queda en el {ENVASES[p.presentacion].envase}? ({p.unidadesPorPresentacion} {ENVASES[p.presentacion].partes}{" "}
            lleno)
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              ["Vacío", 0],
              ["¼", 0.25],
              ["½", 0.5],
              ["¾", 0.75],
              ["Lleno", 1],
            ].map(([t, f]) => {
              const vasos = Math.round((f as number) * p.unidadesPorPresentacion);
              const sel = e.unidades === String(vasos);
              return (
                <button
                  key={t as string}
                  type="button"
                  onClick={() => editar("unidades", String(vasos))}
                  className={`rounded-xl py-2.5 text-sm font-semibold ${sel ? "bg-panel text-white" : "border border-borde bg-white text-tinta"}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-suave">O escribe abajo cuántos {ENVASES[p.presentacion].partes} quedan.</p>
        </div>
      )}

      {/* Litros: quedan y sobrante se escriben en litros (el sistema lo pasa a vasos) */}
      {p.presentacion === "LITRO" && p.unidadesPorPresentacion > 0 ? (
        <div className={`grid gap-3 ${conSobrante(p) ? "grid-cols-2" : "grid-cols-1"}`}>
          <CampoLitros
            etiqueta="¿Cuántos litros quedan?"
            mlPorVaso={p.unidadesPorPresentacion}
            vasos={e.unidades ?? ""}
            cambiar={(v) => editar("unidades", v)}
            autoFocus
          />
          {conSobrante(p) && (
            <CampoLitros
              etiqueta={p.perecible ? "Sobrante (litros)" : "Devuelve a cocina (litros)"}
              mlPorVaso={p.unidadesPorPresentacion}
              vasos={valorSobrante(e, p.perecible)}
              cambiar={(v) => editar("merma", v)}
            />
          )}
          <p className={`text-xs text-suave ${conSobrante(p) ? "col-span-2" : ""}`}>
            1 litro = {Math.round(partesPorEnvase("LITRO", p.unidadesPorPresentacion) * 100) / 100} vasos ({p.unidadesPorPresentacion} ml
            cada uno). El sistema lo pasa a vasos.
          </p>
        </div>
      ) : (
      <div className={`grid gap-3 ${conSobrante(p) ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="block">
          <span className="label">
            {esEnvase(p.presentacion) ? `¿${ENVASES[p.presentacion].cuantas} quedan?` : "¿Cuántas quedan?"}
          </span>
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
        {conSobrante(p) && (
          <label className="block">
            <span className="label">{p.perecible ? "Sobrante (no se vende)" : "Devuelve a cocina"}</span>
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
      )}

      {!p.perecible && p.unidadesPorPresentacion > 1 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-suave">
          <Package className="h-3.5 w-3.5 shrink-0" />
          Viene en {descPresentacion(p.presentacion, p.unidadesPorPresentacion)}: suma también las de{" "}
          {NOMBRE_PRESENTACION[p.presentacion]?.toLowerCase()}s cerrad{p.presentacion === "PAQUETE" ? "os" : "as"}.
        </p>
      )}

      {devuelveACocina(p) && (
        <p className="mt-2 text-xs text-suave">
          Lo que no devuelvas pasa al día siguiente y se suma con lo que mande la cocina. Si no devuelves nada, déjalo vacío.
        </p>
      )}

      {/* Motivo del sobrante: botones grandes, sin listas desplegables */}
      {r.hayMerma && p.perecible && (
        <div className="mt-3">
          <p className="label">¿Por qué sobró?</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_MERMA.filter((m) => m !== MOTIVO_DEVUELTO || p.deCocina).map((m) => (
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
          Es más de lo que había ({r.habia}). Si te equivocaste antes, se corrige; si no, queda como ajuste para que logística lo
          revise.
        </p>
      ) : r.nuevo === 0 && r.habia > 0 ? (
        <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          ¿Se acabó todo? Vendiste {r.habia} = <b>{soles(r.habia * p.precio)}</b>. Revisa que sea correcto.
        </p>
      ) : r.hayCambio ? (
        <p className="mt-3 rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
          {r.vendio > 0 ? (
            <>
              Vendiste <b>{r.vendio}</b>
              {esEnvase(p.presentacion)
                ? ` ${ENVASES[p.presentacion].partes} (${enEnvases(r.vendio, p.unidadesPorPresentacion, p.presentacion)})`
                : ""}{" "}
              = <b>{soles(r.vendio * p.precio)}</b>
            </>
          ) : (
            "Sin ventas desde el último conteo"
          )}
          {r.hayMerma && (
            <>
              {" "}
              · <b>{r.merma.cantidad}</b> {p.perecible ? `de sobrante (${r.merma.motivo || "sin motivo"})` : "devueltos a cocina"}
            </>
          )}
        </p>
      ) : null}

      <div className="mt-5 flex gap-2">
        {r.hayCambio && (
          <button
            type="button"
            onClick={descartar}
            className="btn-secundario h-12 px-3"
            aria-label="Borrar lo escrito"
            title="Borrar lo escrito"
          >
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

/**
 * Campo en litros (con decimales) que guarda vasos. Si los vasos cambian desde afuera
 * (por ejemplo, el sobrante sigue a lo que queda), el número en litros se actualiza.
 */
export function CampoLitros({
  etiqueta,
  mlPorVaso,
  vasos,
  cambiar,
  autoFocus,
}: {
  etiqueta: string;
  mlPorVaso: number;
  vasos: string;
  cambiar: (vasos: string) => void;
  autoFocus?: boolean;
}) {
  const porLitro = partesPorEnvase("LITRO", mlPorVaso);
  const aLitros = (v: string) => (v === "" ? "" : litrosTexto(Number(v) / porLitro));
  const [texto, setTexto] = useState(aLitros(vasos));
  const [vistos, setVistos] = useState(vasos);
  // Cambio desde afuera: se muestra en litros
  if (vasos !== vistos) {
    setVistos(vasos);
    setTexto(aLitros(vasos));
  }
  const enVasos = texto === "" ? null : Math.round(Number(texto) * porLitro);
  return (
    <label className="block">
      <span className="label">{etiqueta}</span>
      <input
        inputMode="decimal"
        value={texto}
        placeholder="0"
        autoFocus={autoFocus}
        onFocus={(ev) => ev.target.select()}
        onChange={(ev) => {
          const limpio = ev.target.value.replace(",", ".").replace(/[^\d.]/g, "");
          const [ent, ...dec] = limpio.split(".");
          const valor = dec.length ? `${ent}.${dec.join("").slice(0, 2)}` : ent;
          const v = valor === "" ? "" : String(Math.round(Number(valor) * porLitro));
          setTexto(valor);
          setVistos(v);
          cambiar(v);
        }}
        className="input h-16 text-center text-3xl font-semibold placeholder:text-suave/40"
        aria-label={etiqueta}
      />
      <span className="mt-1 block text-center text-xs text-suave">{enVasos === null ? "\u00a0" : `= ${enVasos} vasos`}</span>
    </label>
  );
}
