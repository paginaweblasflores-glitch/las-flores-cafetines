"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, School, UserRound } from "lucide-react";
import { guardarColegio } from "@/app/actions/admin";
import { avisar, Modal } from "@/components/ui";
import { numero, soles } from "@/lib/format";
import type { Colegio } from "@/lib/types";

type Item = Colegio & { productos: number; unidades: number; valor: number; personal: string[] };

export function ListaColegios({ colegios }: { colegios: Item[] }) {
  const [editando, setEditando] = useState<Item | "nuevo" | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditando("nuevo")} className="btn-primario">
          <Plus className="h-4 w-4" /> Nuevo colegio
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {colegios.map((c) => (
          <div key={c.id} className={`card p-5 ${c.activo ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-verde-50 text-verde">
                  <School className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{c.nombre}</p>
                  <p className="text-xs text-suave">
                    Código {c.codigo}
                    {!c.activo && " · inactivo"}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditando(c)} className="btn-fantasma" title="Editar">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-fondo p-2">
                <dt className="text-[11px] text-suave">Productos</dt>
                <dd className="font-semibold">{numero(c.productos)}</dd>
              </div>
              <div className="rounded-xl bg-fondo p-2">
                <dt className="text-[11px] text-suave">Unidades</dt>
                <dd className="font-semibold">{numero(c.unidades)}</dd>
              </div>
              <div className="rounded-xl bg-fondo p-2">
                <dt className="text-[11px] text-suave">Valor stock</dt>
                <dd className="truncate font-semibold">{soles(c.valor)}</dd>
              </div>
            </dl>
            <p className="mt-4 flex items-center gap-2 text-xs text-suave">
              <UserRound className="h-3.5 w-3.5" />
              {c.personal.length ? c.personal.join(", ") : <span className="text-rojo">Sin usuario de personal</span>}
            </p>
            {c.direccion && <p className="mt-1 text-xs text-suave">{c.direccion}</p>}
          </div>
        ))}
      </div>

      {editando && (
        <ModalColegio
          colegio={editando === "nuevo" ? null : editando}
          otros={colegios.filter((c) => c.productos > 0)}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

function ModalColegio({ colegio, otros, onCerrar }: { colegio: Item | null; otros: Item[]; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(colegio?.codigo ?? "");
  const [nombre, setNombre] = useState(colegio?.nombre ?? "");
  const [direccion, setDireccion] = useState(colegio?.direccion ?? "");
  const [responsable, setResponsable] = useState(colegio?.responsable ?? "");
  const [activo, setActivo] = useState(colegio?.activo ?? true);
  const [copiarDe, setCopiarDe] = useState<string>(colegio ? "" : String(otros[0]?.id ?? ""));
  const [pendiente, iniciar] = useTransition();

  return (
    <Modal abierto onCerrar={onCerrar} titulo={colegio ? "Editar colegio" : "Nuevo colegio"}>
      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="label">Código</span>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="input uppercase" placeholder="BOSCO" />
        </label>
        <label className="col-span-2">
          <span className="label">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Colegio ..." />
        </label>
        <label className="col-span-3">
          <span className="label">Dirección</span>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="input" placeholder="Opcional" />
        </label>
        <label className="col-span-3">
          <span className="label">Responsable del cafetín</span>
          <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className="input" placeholder="Opcional" />
        </label>
        {!colegio && (
          <label className="col-span-3">
            <span className="label">Copiar productos y precios de</span>
            <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="input">
              <option value="">No copiar (empezar vacío)</option>
              {otros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre} ({o.productos} productos)
                </option>
              ))}
            </select>
          </label>
        )}
        {colegio && (
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-verde" />
            Colegio activo
          </label>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCerrar} className="btn-secundario">Cancelar</button>
        <button
          disabled={pendiente}
          className="btn-primario"
          onClick={() =>
            iniciar(async () => {
              const r = await guardarColegio(colegio?.id ?? null, {
                codigo,
                nombre,
                direccion,
                responsable,
                activo,
                copiarDe: copiarDe ? Number(copiarDe) : null,
              });
              if (r.ok) {
                avisar(r.mensaje ?? "Guardado");
                onCerrar();
              } else avisar(r.error, "error");
            })
          }
        >
          {pendiente ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
