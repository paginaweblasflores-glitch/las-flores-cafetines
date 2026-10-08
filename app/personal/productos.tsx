"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Pencil, Search, Sun } from "lucide-react";
import { cambiarMinimo } from "@/app/actions/personal";
import { avisar, Modal } from "@/components/ui";
import { descPresentacion, fechaCorta, fechaISOLima, normalizar, numero, soles } from "@/lib/format";

export type MiProducto = {
  id: number;
  nombre: string;
  categoria: string;
  presentacion: string;
  unidadesPorPresentacion: number;
  stock: number;
  precio: number;
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

  const seAcaba = (p: MiProducto) => !p.perecible && p.stock <= p.stockMinimo;
  const q = normalizar(busqueda);
  const lista = productos
    .filter((p) => !q || normalizar(p.nombre).includes(q))
    .filter((p) =>
      filtro === "semanales" ? !p.perecible : filtro === "dia" ? p.perecible : filtro === "acaban" ? seAcaba(p) : true,
    )
    .sort((a, b) => Number(a.perecible) - Number(b.perecible) || a.nombre.localeCompare(b.nombre));

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

      <ul className="mt-3 space-y-2">
        {lista.map((p) => {
          const acaba = seAcaba(p);
          return (
            <li key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{p.nombre}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-suave">
                    {p.perecible ? <Sun className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                    {p.categoria} ·{" "}
                    {p.perecible ? "del día (lo manda cocina)" : p.unidadesPorPresentacion > 1 ? `viene en ${descPresentacion(p.presentacion, p.unidadesPorPresentacion)}` : "por unidad"}
                  </p>
                </div>
                <span
                  className={`chip shrink-0 ${
                    p.stock === 0 && !p.perecible ? "bg-rojo-50 text-rojo" : acaba ? "bg-ambar-50 text-[#8a5a00]" : "bg-fondo text-tinta"
                  }`}
                >
                  Hay {numero(p.stock)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-xl bg-fondo px-3 py-2">
                  <p className="text-[11px] text-suave">Precio</p>
                  <p className="font-medium">{soles(p.precio)}</p>
                </div>
                <div className="rounded-xl bg-fondo px-3 py-2">
                  <p className="text-[11px] text-suave">Último conteo</p>
                  <p className="font-medium">{p.ultimoConteo ? fechaCorta(fechaISOLima(p.ultimoConteo)).slice(0, 5) : "—"}</p>
                </div>
                {p.perecible ? (
                  <div className="rounded-xl bg-fondo px-3 py-2">
                    <p className="text-[11px] text-suave">Mínimo</p>
                    <p className="text-xs text-suave">No aplica</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditando(p)}
                    className={`rounded-xl px-3 py-2 text-left ${acaba ? "bg-ambar-50" : "bg-fondo"}`}
                    aria-label={`Cambiar mínimo de ${p.nombre}`}
                  >
                    <p className="flex items-center justify-between text-[11px] text-suave">
                      Mínimo <Pencil className="h-3 w-3" />
                    </p>
                    <p className="font-medium">{numero(p.stockMinimo)}</p>
                  </button>
                )}
              </div>
              {acaba && (
                <p className="mt-2 text-xs text-[#8a5a00]">
                  {p.stock === 0 ? "Agotado." : "Está en su mínimo o menos."} Pídelo en Reposición.
                </p>
              )}
            </li>
          );
        })}
        {lista.length === 0 && <p className="py-10 text-center text-sm text-suave">No hay productos con ese filtro.</p>}
      </ul>

      {editando && <ModalMinimo p={editando} cerrar={() => setEditando(null)} />}
    </div>
  );
}

/** Cambiar el mínimo: cuándo avisar que el producto se está acabando */
function ModalMinimo({ p, cerrar }: { p: MiProducto; cerrar: () => void }) {
  const [valor, setValor] = useState(String(p.stockMinimo));
  const [guardando, setGuardando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => campo.current?.select(), 50);
    return () => clearTimeout(t);
  }, []);
  const n = valor.trim() === "" ? NaN : Number(valor);
  const valido = Number.isInteger(n) && n >= 0;

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

  return (
    <Modal abierto onCerrar={cerrar} titulo="Stock mínimo" subtitulo={`${p.nombre} · hay ${numero(p.stock)}`}>
      <label className="block">
        <span className="label">Avisar cuando queden (unidades)</span>
        <input
          ref={campo}
          type="number"
          inputMode="numeric"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && guardar()}
          enterKeyHint="done"
          className="input h-14 text-center text-2xl font-semibold"
          autoFocus
        />
      </label>
      <p className="mt-2 text-xs text-suave">
        Cuando queden {valido ? numero(n) : "…"} o menos, aparecerá en &quot;Se está acabando&quot; para pedirlo.
        {p.unidadesPorPresentacion > 1 && ` Viene en ${descPresentacion(p.presentacion, p.unidadesPorPresentacion)}.`}
      </p>
      {!valido && <p className="mt-2 text-sm text-rojo">Escribe un número entero (0 o más).</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={cerrar} disabled={guardando} className="btn-secundario h-12">
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando || !valido} className="btn-primario h-12">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
