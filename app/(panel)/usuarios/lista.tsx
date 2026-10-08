"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Eye, EyeOff } from "lucide-react";
import { guardarUsuario } from "@/app/actions/admin";
import { avisar, Modal } from "@/components/ui";
import { BarraPaginacion, usePaginacion } from "@/components/paginacion";
import { fechaHoraLima } from "@/lib/format";
import type { Rol } from "@/lib/types";

type Usuario = {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  colegio_id: number | null;
  activo: boolean;
  ultimo_acceso: string | null;
};

const ROLES: Record<Rol, { texto: string; desc: string; clase: string }> = {
  ADMIN: { texto: "Administración", desc: "Control total del sistema", clase: "bg-panel text-white" },
  LOGISTICA: { texto: "Logística", desc: "Stock, entregas, productos y reportes", clase: "bg-[#e8f0fb] text-[#2b5ea7]" },
  PERSONAL: { texto: "Personal", desc: "Solo registra el stock y precios de su colegio", clase: "bg-verde-50 text-verde-700" },
  COCINA: { texto: "Cocina", desc: "Registra los productos del día que se envían a cada colegio", clase: "bg-ambar-50 text-[#8a5a00]" },
};

export function ListaUsuarios({
  yo,
  colegios,
  usuarios,
}: {
  yo: number;
  colegios: { id: number; nombre: string }[];
  usuarios: Usuario[];
}) {
  const [editando, setEditando] = useState<Usuario | "nuevo" | null>(null);
  const colegio = (id: number | null) => colegios.find((c) => c.id === id)?.nombre ?? "—";
  const pag = usePaginacion(usuarios.length);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button onClick={() => setEditando("nuevo")} className="btn-primario">
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Colegio</th>
              <th>Último ingreso</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pag.cortar(usuarios).map((u) => (
              <tr key={u.id} className={u.activo ? "" : "opacity-50"}>
                <td>
                  <p className="font-medium">{u.usuario}</p>
                  <p className="text-xs text-suave">
                    {u.nombre}
                    {u.id === yo && " · (tú)"}
                  </p>
                </td>
                <td>
                  <span className={`chip ${ROLES[u.rol].clase}`}>{ROLES[u.rol].texto}</span>
                </td>
                <td className="text-suave">{u.rol === "PERSONAL" ? colegio(u.colegio_id) : "Todos"}</td>
                <td className="text-suave">{u.ultimo_acceso ? fechaHoraLima(u.ultimo_acceso) : "Nunca"}</td>
                <td>
                  <span className={`chip ${u.activo ? "bg-verde-50 text-verde-700" : "bg-fondo text-suave"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="text-right">
                  <button onClick={() => setEditando(u)} className="btn-fantasma" title="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <BarraPaginacion p={pag} etiqueta="usuarios" />
      </div>

      {editando && (
        <ModalUsuario
          usuario={editando === "nuevo" ? null : editando}
          esYo={editando !== "nuevo" && editando.id === yo}
          colegios={colegios}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}

function ModalUsuario({
  usuario,
  esYo,
  colegios,
  onCerrar,
}: {
  usuario: Usuario | null;
  esYo: boolean;
  colegios: { id: number; nombre: string }[];
  onCerrar: () => void;
}) {
  const [nombreUsuario, setNombreUsuario] = useState(usuario?.usuario ?? "");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "PERSONAL");
  const [colegioId, setColegioId] = useState(String(usuario?.colegio_id ?? colegios[0]?.id ?? ""));
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [pendiente, iniciar] = useTransition();

  return (
    <Modal abierto onCerrar={onCerrar} titulo={usuario ? "Editar usuario" : "Nuevo usuario"}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Usuario (para ingresar)</span>
            <input value={nombreUsuario} onChange={(e) => setNombreUsuario(e.target.value)} className="input" placeholder="Personal de ..." />
          </label>
          <label>
            <span className="label">Nombre de la persona</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" />
          </label>
        </div>

        <div>
          <span className="label">Rol</span>
          <div className="grid gap-2">
            {(Object.keys(ROLES) as Rol[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${rol === r ? "border-verde bg-verde-50" : "border-borde"} ${esYo && r !== "ADMIN" ? "pointer-events-none opacity-40" : ""}`}
              >
                <input type="radio" name="rol" checked={rol === r} onChange={() => setRol(r)} className="mt-1 accent-verde" />
                <span>
                  <span className="block text-sm font-medium">{ROLES[r].texto}</span>
                  <span className="block text-xs text-suave">{ROLES[r].desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {rol === "PERSONAL" && (
          <label className="block">
            <span className="label">Colegio</span>
            <select value={colegioId} onChange={(e) => setColegioId(e.target.value)} className="input">
              {colegios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="label">{usuario ? "Nueva contraseña (déjala vacía para no cambiarla)" : "Contraseña"}</span>
          <div className="relative">
            <input
              type={ver ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-suave"
              aria-label="Mostrar contraseña"
            >
              {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {usuario && !esYo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="accent-verde" />
            Usuario activo (si lo desactivas ya no podrá entrar)
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
              const r = await guardarUsuario(usuario?.id ?? null, {
                usuario: nombreUsuario,
                nombre,
                rol,
                colegioId: rol === "PERSONAL" ? Number(colegioId) : null,
                activo,
                password,
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
