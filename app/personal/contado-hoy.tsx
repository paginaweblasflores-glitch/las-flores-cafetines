"use client";

import { useState } from "react";
import { CalendarDays, ClipboardCheck, Pencil, Sun } from "lucide-react";
import { corregirConteoHoy } from "@/app/actions/personal";
import { avisar, Inicial, Modal, Vacio } from "@/components/ui";
import { ENVASES, horaLima, litrosTexto, numero, partesPorEnvase, soles } from "@/lib/format";
import { CampoLitros, conSobrante, MOTIVO_BOTADO } from "./conteo";

export type ContadoHoy = {
  /** producto_colegio */
  id: number;
  habia: number;
  quedan: number;
  vendido: number;
  monto: number;
  sobrante: number;
  motivo: string | null;
  /** Lo "preparado en el cafetín" hoy (ya va incluido en "había") */
  preparado: number;
  hora: string;
};

export type ProductoBasico = {
  id: number;
  nombre: string;
  perecible: boolean;
  precio: number;
  presentacion: string;
  unidadesPorPresentacion: number;
  /** Lo manda la cocina (en los que se acumulan se puede devolver una parte) */
  deCocina: boolean;
};

/**
 * "Lo contado hoy": se abre desde "Vendido hoy". Muestra cada producto contado hoy con lo que se vendió
 * y permite corregirlo hasta la medianoche: salen los números que se pusieron, se cambian y se guarda.
 */
export function LoContadoHoy({ contados, productos }: { contados: ContadoHoy[]; productos: ProductoBasico[] }) {
  const [editando, setEditando] = useState<(ContadoHoy & { p: ProductoBasico }) | null>(null);
  const producto = new Map(productos.map((p) => [p.id, p]));
  const lista = contados
    .map((c) => ({
      ...c,
      p: producto.get(c.id) ?? {
        id: c.id,
        nombre: "Producto",
        perecible: true,
        precio: 0,
        presentacion: "UNIDAD",
        unidadesPorPresentacion: 1,
        deCocina: true,
      },
    }))
    .sort((a, b) => b.hora.localeCompare(a.hora));
  const total = lista.reduce((a, c) => a + c.monto, 0);
  const unidades = lista.reduce((a, c) => a + c.vendido, 0);

  if (lista.length === 0) {
    return (
      <div className="card mt-1">
        <Vacio
          icono={<ClipboardCheck className="h-6 w-6" />}
          titulo="Todavía no contaste nada hoy"
          texto="Cuando guardes un conteo, aparece aquí lo que vendiste de cada producto. Si te equivocas, lo corriges desde aquí hasta la medianoche."
        />
      </div>
    );
  }

  return (
    <div className="pt-1">
      <div className="rounded-2xl bg-gradient-to-br from-verde-700 to-verde-oscuro p-4 text-white">
        <p className="text-xs text-verde-100">Vendido hoy según tus conteos</p>
        <p className="text-2xl font-semibold tracking-tight">{soles(total)}</p>
        <p className="text-xs text-verde-100">
          {numero(unidades)} unidades · {lista.length} producto{lista.length === 1 ? "" : "s"} contado{lista.length === 1 ? "" : "s"}
        </p>
      </div>
      <p className="mt-3 mb-2 px-1 text-xs text-suave">¿Contaste algo mal? Toca «Corregir», cambia el número y guarda. Se puede hasta la medianoche.</p>

      <ul className="card divide-y divide-borde overflow-hidden">
        {lista.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3.5 py-3">
            <Inicial nombre={c.p.nombre} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-medium">
                {c.p.nombre}
                {c.p.perecible ? <Sun className="h-3.5 w-3.5 shrink-0 text-suave" /> : <CalendarDays className="h-3.5 w-3.5 shrink-0 text-suave" />}
              </p>
              <p className="text-xs text-suave">
                Había {numero(c.habia)} · quedan {numero(c.quedan)}
                {c.sobrante > 0 ? ` · sobrante ${numero(c.sobrante)}` : ""} · {horaLima(c.hora)}
              </p>
              <p className="text-xs">
                Vendiste <b>{numero(c.vendido)}</b> = <b className="text-verde-700">{soles(c.monto)}</b>
              </p>
            </div>
            <button
              onClick={() => setEditando(c)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-borde bg-white px-2.5 py-2 text-sm font-medium text-tinta active:bg-fondo"
            >
              <Pencil className="h-3.5 w-3.5" /> Corregir
            </button>
          </li>
        ))}
      </ul>

      {editando && <HojaCorregir key={editando.id} c={editando} cerrar={() => setEditando(null)} />}
    </div>
  );
}

/** Los números que se pusieron, listos para cambiar; al guardar queda corregido */
export function HojaCorregir({ c, cerrar }: { c: ContadoHoy & { p: ProductoBasico }; cerrar: () => void }) {
  const [quedan, setQuedan] = useState(String(c.quedan));
  const [sobrante, setSobrante] = useState(String(c.sobrante));
  const [preparado, setPreparado] = useState(String(c.preparado));
  const [guardando, setGuardando] = useState(false);
  const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const soloDigitos = (v: string) => v.replace(/\D/g, "");
  const parte = ENVASES[c.p.presentacion]?.partes ?? "unidades";
  // Bebidas en litros: se corrige en litros (el sistema lo pasa a vasos)
  const enLitros = c.p.presentacion === "LITRO" && c.p.unidadesPorPresentacion > 0;
  const litros = (vasos: number) => litrosTexto(vasos / partesPorEnvase("LITRO", c.p.unidadesPorPresentacion));

  // "Había" sin lo preparado, más lo preparado que se escriba ahora
  const habia = c.habia - c.preparado + n(preparado);
  const vendio = habia - n(quedan);
  const error =
    n(quedan) > habia
      ? `Quedan más de lo que había (${numero(habia)}). Revisa el número.`
      : n(sobrante) > n(quedan)
        ? "El sobrante no puede ser mayor a lo que queda."
        : null;

  async function guardar() {
    if (error || guardando) return;
    setGuardando(true);
    const r = await corregirConteoHoy(c.id, {
      quedan: n(quedan),
      sobrante: conSobrante(c.p) ? n(sobrante) : 0,
      motivo: c.p.perecible ? c.motivo : (c.motivo ?? MOTIVO_BOTADO),
      preparado: n(preparado),
    });
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    if (r.errores.length) return avisar(r.errores[0].error, "error");
    avisar(`${c.p.nombre} corregido: vendiste ${numero(vendio)} = ${soles(vendio * c.p.precio)}`);
    cerrar();
  }

  const campo = "input h-14 text-center text-2xl font-semibold";
  return (
    <Modal abierto onCerrar={() => !guardando && cerrar()} titulo={`Corregir ${c.p.nombre}`}
      subtitulo={
        enLitros
          ? `Había ${litros(habia)} litros (${numero(habia)} vasos) · ${soles(c.p.precio)} el vaso`
          : `Había ${numero(habia)} ${parte} · ${soles(c.p.precio)}`
      }
    >
      <div className="grid gap-3">
        {c.preparado > 0 && (
          <label className="block">
            <span className="label">¿Cuántos preparaste hoy?</span>
            <input inputMode="numeric" value={preparado} onChange={(e) => setPreparado(soloDigitos(e.target.value))} onFocus={(e) => e.target.select()} className={campo} />
          </label>
        )}
        {enLitros ? (
          <div className={`grid gap-3 ${conSobrante(c.p) ? "grid-cols-2" : "grid-cols-1"}`}>
            <CampoLitros etiqueta="¿Cuántos litros quedan?" mlPorVaso={c.p.unidadesPorPresentacion} vasos={quedan} cambiar={setQuedan} autoFocus />
            {conSobrante(c.p) && (
              <CampoLitros etiqueta={c.p.perecible ? "Sobrante (litros)" : "Sale del stock (litros)"} mlPorVaso={c.p.unidadesPorPresentacion} vasos={sobrante} cambiar={setSobrante} />
            )}
          </div>
        ) : (
        <div className={`grid gap-3 ${conSobrante(c.p) ? "grid-cols-2" : "grid-cols-1"}`}>
          <label className="block">
            <span className="label">¿Cuántos {parte} quedan?</span>
            <input
              inputMode="numeric"
              value={quedan}
              onChange={(e) => setQuedan(soloDigitos(e.target.value))}
              onFocus={(e) => e.target.select()}
              className={campo}
              autoFocus
            />
          </label>
          {conSobrante(c.p) && (
            <label className="block">
              <span className="label">{c.p.perecible ? "Sobrante (no se vende)" : "Sale del stock"}</span>
              <input inputMode="numeric" value={sobrante} onChange={(e) => setSobrante(soloDigitos(e.target.value))} onFocus={(e) => e.target.select()} className={campo} />
            </label>
          )}
        </div>
        )}

        {error ? (
          <p className="rounded-xl bg-rojo-50 px-3 py-2 text-sm text-rojo">{error}</p>
        ) : (
          <p className="rounded-xl bg-verde-50 px-3 py-2 text-sm text-verde-700">
            Vendiste <b>{numero(vendio)}</b>
            {enLitros ? ` vasos (${litros(vendio)} L)` : ""} = <b>{soles(vendio * c.p.precio)}</b>
            {c.vendido !== vendio && <span className="text-suave"> (antes {numero(c.vendido)})</span>}
          </p>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || !!error} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
