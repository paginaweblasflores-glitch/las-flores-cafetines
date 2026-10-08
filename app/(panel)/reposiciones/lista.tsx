"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, ClipboardList } from "lucide-react";
import { TablaPaginada } from "@/components/paginacion";
import { Vacio } from "@/components/ui";
import { ESTADO_REPOSICION, fechaCorta, fechaISOLima, horaLima } from "@/lib/format";
import type { Rol } from "@/lib/types";

export type FilaReposicion = {
  id: number;
  codigo: string;
  fecha: string;
  colegioId: number;
  colegio: string;
  pedidoPor: string;
  estado: string;
  productos: number;
  aprobados: number;
  fueraCatalogo: number;
};

type Filtro = "POR_APROBAR" | "APROBADA" | "EN_COMPRA" | "COMPRADA" | "RECHAZADA" | "TODAS";

const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "POR_APROBAR", texto: "Por aprobar" },
  { id: "APROBADA", texto: "Aprobadas" },
  { id: "EN_COMPRA", texto: "En compra" },
  { id: "COMPRADA", texto: "Compradas" },
  { id: "RECHAZADA", texto: "No aprobadas" },
  { id: "TODAS", texto: "Todas" },
];

export function ListaReposiciones({
  rol,
  colegios,
  filas,
}: {
  rol: Rol;
  colegios: { id: number; nombre: string }[];
  filas: FilaReposicion[];
}) {
  const router = useRouter();
  const cuenta = (f: Filtro) => (f === "TODAS" ? filas.length : filas.filter((r) => r.estado === f).length);
  // Logística empieza en lo que le toca hacer; administración ve todas
  const inicial: Filtro =
    rol !== "LOGISTICA" ? "TODAS" : (["POR_APROBAR", "APROBADA", "EN_COMPRA"] as Filtro[]).find((f) => cuenta(f) > 0) ?? "TODAS";
  const [filtro, setFiltro] = useState<Filtro>(inicial);
  const [colegioId, setColegioId] = useState(0);

  const visibles = filas.filter(
    (r) => (filtro === "TODAS" || r.estado === filtro) && (!colegioId || r.colegioId === colegioId),
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-borde px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {FILTROS.map((f) => {
            const n = cuenta(f.id);
            const sel = filtro === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={sel}
                onClick={() => setFiltro(f.id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm transition-colors ${
                  sel ? "bg-panel font-medium text-white" : "text-suave hover:bg-fondo"
                }`}
              >
                {f.texto}
                <span className={`rounded-full px-1.5 text-xs ${sel ? "bg-white/20" : "bg-fondo"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        {colegios.length > 1 && (
          <select value={colegioId} onChange={(e) => setColegioId(Number(e.target.value))} className="input w-full lg:w-56">
            <option value={0}>Todos los colegios</option>
            {colegios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      <TablaPaginada
        etiqueta="reposiciones"
        vacio={
          <div className="p-6">
            <Vacio
              icono={<ClipboardList className="h-6 w-6" />}
              titulo="No hay reposiciones aquí"
              texto="Cuando el personal envíe una lista de pedido aparecerá en esta tabla."
            />
          </div>
        }
        cabecera={
          <thead>
            <tr>
              <th>Código</th>
              <th>Fecha y hora</th>
              <th>Colegio</th>
              <th>Pedido por</th>
              <th className="text-right">Productos</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
        }
        filas={visibles.map((r) => {
          const est = ESTADO_REPOSICION[r.estado];
          const revisada = r.estado === "APROBADA" || r.estado === "EN_COMPRA" || r.estado === "COMPRADA";
          return (
            <tr key={r.id} onClick={() => router.push(`/reposiciones/${r.id}`)} className="cursor-pointer">
              <td>
                <Link href={`/reposiciones/${r.id}`} className="font-semibold text-verde-700 hover:underline">
                  {r.codigo}
                </Link>
              </td>
              <td className="whitespace-nowrap">
                {fechaCorta(fechaISOLima(r.fecha))} <span className="text-suave">{horaLima(r.fecha)}</span>
              </td>
              <td>{r.colegio}</td>
              <td className="text-suave">{r.pedidoPor || "—"}</td>
              <td className="text-right tabular-nums">
                {revisada && r.aprobados !== r.productos ? `${r.aprobados} de ${r.productos}` : r.productos}
                {r.fueraCatalogo > 0 && (
                  <span className="block text-xs text-suave">{r.fueraCatalogo} fuera de catálogo</span>
                )}
              </td>
              <td>
                <span className={`chip ${est?.clase ?? ""}`}>{est?.texto ?? r.estado}</span>
              </td>
              <td className="w-8 text-suave">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          );
        })}
      />
    </div>
  );
}
