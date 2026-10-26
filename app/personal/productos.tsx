"use client";

import { useState } from "react";
import { ChevronRight, Package, Pencil, Search, Sun, TriangleAlert } from "lucide-react";
import { ModalPrecio } from "./modal-precio";
import { cambiarMinimo } from "@/app/actions/personal";
import { avisar, Inicial, Modal } from "@/components/ui";
import { buscarPorNombre, descPresentacion, fechaCorta, fechaISOLima, numero, soles } from "@/lib/format";

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
  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isInteger(n) && n >= 0;
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

  return (
    <Modal abierto onCerrar={cerrar} titulo={p.nombre} subtitulo={p.categoria}>
      <div className="grid grid-cols-2 gap-2">
        {datos.map((d) =>
          d.t === "Precio" ? (
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
    </Modal>
  );
}
