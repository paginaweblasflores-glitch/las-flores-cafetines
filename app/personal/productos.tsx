"use client";

import { useState } from "react";
import { ChevronRight, Package, PackageX, Pencil, Search, Sun, TriangleAlert } from "lucide-react";
import { ModalPrecio } from "./modal-precio";
import { ajustarCantidad, cambiarMinimo, retirarProducto } from "@/app/actions/personal";
import { CampoLitros } from "./conteo";
import { avisar, Inicial, Modal } from "@/components/ui";
import { buscarPorNombre, descPresentacion, fechaCorta, fechaISOLima, litrosTexto, numero, partesPorEnvase, soles } from "@/lib/format";

export type MiProducto = {
  id: number;
  nombre: string;
  categoria: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  stock: number;
  precio: number;
  /** En descuento: el precio de siempre */
  precioNormal?: number | null;
  perecible: boolean;
  ultimoConteo: string | null;
  stockMinimo: number;
};

type Filtro = "todos" | "semanales" | "dia" | "acaban";

/** Lo que tiene el cafetín, con detalles; el personal puede ajustar el mínimo de los semanales */
export function MisProductos({ productos }: { productos: MiProducto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState<MiProducto | null>(null);
  const [precioDe, setPrecioDe] = useState<MiProducto | null>(null);

  const seAcaba = (p: MiProducto) => !p.perecible && p.stock <= p.stockMinimo;
  const lista = buscarPorNombre(
    productos
      .filter((p) =>
        filtro === "semanales" ? !p.perecible : filtro === "dia" ? p.perecible : filtro === "acaban" ? seAcaba(p) : true,
      )
      .sort((a, b) => Number(a.perecible) - Number(b.perecible) || a.nombre.localeCompare(b.nombre)),
    busqueda,
    (p) => p.nombre,
  );

  const chips: { id: Filtro; texto: string; n: number }[] = [
    { id: "todos", texto: "Todos", n: productos.length },
    { id: "semanales", texto: "Semanales", n: productos.filter((p) => !p.perecible).length },
    { id: "dia", texto: "Del día", n: productos.filter((p) => p.perecible).length },
    { id: "acaban", texto: "Se acaban", n: productos.filter(seAcaba).length },
  ];

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="input py-3 pl-10 text-base"
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setFiltro(c.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium ${
              filtro === c.id ? "bg-panel text-white" : "border border-borde bg-white text-suave"
            }`}
          >
            {c.texto}
            <span className={`rounded-full px-1.5 text-xs ${filtro === c.id ? "bg-white/20" : "bg-fondo"}`}>{c.n}</span>
          </button>
        ))}
      </div>

      {/* Una fila por producto: nombre, precio y cuánto hay. Al tocarla, su detalle */}
      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-suave">No hay productos con ese filtro.</p>
      ) : (
        <ul className="card mt-3 divide-y divide-borde overflow-hidden">
          {lista.map((p) => {
            const acaba = seAcaba(p);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => setEditando(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-fondo">
                  <Inicial nombre={p.nombre} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-suave">
                      {p.perecible ? <Sun className="h-3 w-3 shrink-0" /> : <Package className="h-3 w-3 shrink-0" />}
                      {soles(p.precio)} · {p.perecible ? "del día" : `mínimo ${numero(p.stockMinimo)}`}
                    </span>
                  </span>
                  <span
                    className={`chip shrink-0 ${
                      p.stock === 0 && !p.perecible ? "chip-critico" : acaba ? "chip-atencion" : "bg-fondo text-tinta"
                    }`}
                  >
                    Hay {numero(p.stock)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editando && (
        <ModalMinimo
          key={editando.id}
          p={editando}
          cerrar={() => setEditando(null)}
          cambiarPrecio={() => {
            setPrecioDe(editando);
            setEditando(null);
          }}
        />
      )}
      {precioDe && <ModalPrecio key={precioDe.id} p={precioDe} cerrar={() => setPrecioDe(null)} />}
    </div>
  );
}

/** Detalle del producto; en los semanales se ajusta el mínimo (cuándo avisar que se está acabando) */
function ModalMinimo({ p, cerrar, cambiarPrecio }: { p: MiProducto; cerrar: () => void; cambiarPrecio: () => void }) {
  const [valor, setValor] = useState(String(p.stockMinimo));
  const [guardando, setGuardando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isInteger(n) && n >= 0;

  async function retirar() {
    setGuardando(true);
    const r = await retirarProducto(p.id);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(`${p.nombre}: retirado de tu cafetín`);
    cerrar();
  }
  const acaba = !p.perecible && p.stock <= p.stockMinimo;

  async function guardar() {
    if (!valido || guardando) return;
    if (n === p.stockMinimo) return cerrar();
    setGuardando(true);
    const r = await cambiarMinimo(p.id, n);
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(`${p.nombre}: mínimo ${n}`);
    cerrar();
  }

  const datos = [
    { t: "Hay", v: `${numero(p.stock)} unid.` },
    { t: "Precio", v: p.precioNormal != null ? `${soles(p.precio)} (normal ${soles(p.precioNormal)})` : soles(p.precio) },
    { t: "Último conteo", v: p.ultimoConteo ? fechaCorta(fechaISOLima(p.ultimoConteo)) : "—" },
    {
      t: "Cómo viene",
      v: p.perecible ? "Del día (cocina)" : p.unidadesPorPresentacion > 1 ? descPresentacion(p.presentacion, p.unidadesPorPresentacion) : "Por unidad",
    },
  ];


  // Ajustar la cantidad (no es venta): ventana propia
  if (ajustando) return <HojaAjuste p={p} volver={() => setAjustando(false)} cerrar={cerrar} />;

  // Confirmación sola (sin el resto de la ficha)
  if (retirando) {
    return (
      <Modal abierto onCerrar={() => !guardando && setRetirando(false)} titulo={`¿Retirar ${p.nombre}?`}>
        <p className="text-sm text-suave">Ya no aparecerá en tu lista.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => setRetirando(false)} disabled={guardando} className="btn-secundario h-12">
            Cancelar
          </button>
          <button onClick={retirar} disabled={guardando} className="btn-peligro h-12">
            {guardando ? "Retirando..." : "Sí, retirar"}
          </button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal abierto onCerrar={cerrar} titulo={p.nombre} subtitulo={p.categoria}>
      <div className="grid grid-cols-2 gap-2">
        {datos.map((d) =>
          d.t === "Hay" ? (
            <button
              key={d.t}
              type="button"
              onClick={() => setAjustando(true)}
              className="rounded-xl border border-borde bg-fondo px-3 py-2.5 text-left transition-colors hover:border-campo"
            >
              <p className="flex items-center justify-between text-[11px] text-suave">
                {d.t}
                <span className="flex items-center gap-1 font-medium text-tinta">
                  <Pencil className="h-3 w-3" /> ajustar
                </span>
              </p>
              <p className="font-semibold">{d.v}</p>
            </button>
          ) : d.t === "Precio" ? (
            // El precio se cambia aquí mismo (abre la ventana de cambiar precio)
            <button
              key={d.t}
              type="button"
              onClick={cambiarPrecio}
              className="rounded-xl border border-verde/40 bg-verde-50/60 px-3 py-2.5 text-left transition-colors hover:bg-verde-50"
            >
              <p className="flex items-center justify-between text-[11px] text-suave">
                {d.t}
                <span className="flex items-center gap-1 font-medium text-verde-700">
                  <Pencil className="h-3 w-3" /> cambiar
                </span>
              </p>
              <p className="font-semibold">{d.v}</p>
            </button>
          ) : (
            <div key={d.t} className="rounded-xl bg-fondo px-3 py-2.5">
              <p className="text-[11px] text-suave">{d.t}</p>
              <p className="font-semibold">{d.v}</p>
            </div>
          ),
        )}
      </div>

      {acaba && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {p.stock === 0 ? "Agotado." : "Está en su mínimo o menos."} Pídelo en Reposición.
        </p>
      )}

      {p.perecible ? (
        <p className="mt-4 text-xs text-suave">Los productos del día no tienen mínimo: los manda cocina cada día.</p>
      ) : (
        <>
          <label className="mt-4 block">
            <span className="label">Avisar cuando queden (mínimo)</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              enterKeyHint="done"
              className="input h-14 text-center text-2xl font-semibold"
            />
          </label>
          <p className="mt-1.5 text-xs text-suave">
            Cuando queden {valido ? numero(n) : "…"} o menos, aparece en &quot;Se está acabando&quot; para pedirlo.
          </p>
          {!valido && <p className="mt-2 text-sm text-rojo">Escribe un número entero (0 o más).</p>}
        </>
      )}

      <div className={`mt-5 grid gap-2 ${p.perecible ? "" : "grid-cols-2"}`}>
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          {p.perecible ? "Cerrar" : "Cancelar"}
        </button>
        {!p.perecible && (
          <button onClick={guardar} disabled={guardando || !valido} className="btn-primario h-12">
            {guardando ? "Guardando..." : "Guardar mínimo"}
          </button>
        )}
      </div>

      {/* Retirar de este cafetín: discreto, abajo (al tocarlo, la ventana pasa a pedir confirmación) */}
      <button
        type="button"
        onClick={() => setRetirando(true)}
        className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-suave hover:text-rojo"
      >
        <PackageX className="h-4 w-4" /> Ya no lo vendo: retirar de mi cafetín
      </button>
    </Modal>
  );
}

const MOTIVOS_MENOS = ["Se dañó o venció", "Se perdió / faltante", "Error en un conteo anterior", "Otro"];
const MOTIVOS_MAS = ["Llegó de más sin registrar", "Devolución", "Error en un conteo anterior", "Otro"];

/**
 * "Ajustar cantidad": el sistema dice X y en el cafetín hay otra cantidad. No es venta.
 * El motivo es obligatorio y queda en el historial que ve administración.
 */
function HojaAjuste({ p, volver, cerrar }: { p: MiProducto; volver: () => void; cerrar: () => void }) {
  const [hay, setHay] = useState("");
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enLitros = p.presentacion === "LITRO" && p.unidadesPorPresentacion > 0;
  const litros = (v: number) => litrosTexto(v / partesPorEnvase("LITRO", p.unidadesPorPresentacion));
  const parte = enLitros ? "vasos" : "unid.";

  const n = hay.trim() === "" ? NaN : Number(hay);
  const valido = Number.isInteger(n) && n >= 0 && n !== p.stock;
  const dif = valido ? n - p.stock : 0;
  const motivos = dif < 0 ? MOTIVOS_MENOS : MOTIVOS_MAS;
  const textoMotivo = motivo === "Otro" ? otro.trim() : motivo;
  const listo = valido && motivos.includes(motivo) && textoMotivo.length >= 3;

  async function guardar() {
    if (!listo || guardando) return;
    setGuardando(true);
    const r = await ajustarCantidad(p.id, n, textoMotivo, motivo === "Se dañó o venció");
    setGuardando(false);
    if (!r.ok) return avisar(r.error, "error");
    avisar(`${p.nombre}: ahora hay ${numero(n)} (${dif > 0 ? "+" : ""}${numero(dif)} · ${textoMotivo})`);
    cerrar();
  }

  return (
    <Modal
      abierto
      onCerrar={() => !guardando && volver()}
      titulo={`Ajustar ${p.nombre}`}
      subtitulo={`El sistema dice ${enLitros ? `${litros(p.stock)} L (${numero(p.stock)} vasos)` : `${numero(p.stock)} unid.`}`}
    >
      {enLitros ? (
        <CampoLitros etiqueta="¿Cuántos litros hay de verdad?" mlPorVaso={p.unidadesPorPresentacion} vasos={hay} cambiar={setHay} autoFocus />
      ) : (
        <label className="block">
          <span className="label">¿Cuántas hay de verdad?</span>
          <input
            inputMode="numeric"
            value={hay}
            onChange={(e) => setHay(e.target.value.replace(/\D/g, ""))}
            placeholder={String(p.stock)}
            className="input h-16 text-center text-3xl font-semibold placeholder:text-suave/40"
            autoFocus
          />
          {p.unidadesPorPresentacion > 1 && !p.perecible && (
            <span className="mt-1 block text-xs text-suave">En unidades: suma también las de paquetes o cajas cerradas.</span>
          )}
        </label>
      )}

      {valido && (
        <>
          <p className="label mt-4">¿Por qué {dif < 0 ? "hay menos" : "hay más"}?</p>
          <div className="flex flex-wrap gap-2">
            {motivos.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className={`rounded-full px-3 py-2 text-sm font-medium ${motivo === m ? "bg-panel text-white" : "border border-borde bg-white text-tinta"}`}
              >
                {m}
              </button>
            ))}
          </div>
          {motivo === "Otro" && (
            <input value={otro} onChange={(e) => setOtro(e.target.value)} className="input mt-2" placeholder="Escribe el motivo" aria-label="Otro motivo" />
          )}
          <p className="mt-3 rounded-xl bg-ambar-50 px-3 py-2 text-sm text-[#8a5a00]">
            Quedarán <b>{enLitros ? `${litros(n)} L` : numero(n)}</b> · {dif > 0 ? "+" : ""}
            {numero(dif)} {parte}
            {textoMotivo ? ` por ${textoMotivo}` : ""}. No es venta: lo vendido de hoy no cambia.
          </p>
        </>
      )}
      {hay !== "" && Number(hay) === p.stock && <p className="mt-3 text-sm text-suave">Es lo mismo que dice el sistema: no hay nada que ajustar.</p>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={volver} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={!listo || guardando} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
