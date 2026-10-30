"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { TablaPaginada } from "@/components/paginacion";
import { Vacio } from "@/components/ui";
import { horaLima, nombreConteo, numero, soles } from "@/lib/format";

export type FilaConteo = {
  id: number;
  fecha: string;
  colegioId: number;
  colegio: string;
  contados: number;
  total: number;
  unidades: number;
  venta: number;
  sobrante: number;
  registro: string;
  ultimo: string;
  /** Caja del día que anotó el personal (null = no la registró) */
  caja: { fisico: number; sistema: number; motivo: string | null } | null;
};

export function ListaConteos({
  tipo,
  porColegio,
  titulo,
  filas,
}: {
  tipo: "DIA" | "SEMANA";
  /** Mostrar la columna Colegio (cuando se ven todos) */
  porColegio: boolean;
  /** El colegio que se está viendo, o "Todos los colegios" */
  titulo: string;
  filas: FilaConteo[];
}) {
  const router = useRouter();
  const visibles = filas;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-borde px-5 py-4">
        <div>
          <h2 className="font-medium">{titulo}</h2>
          <p className="text-xs text-suave">
            {visibles.filter((f) => f.id > 0).length} conteo{visibles.filter((f) => f.id > 0).length === 1 ? "" : "s"} · vendido{" "}
            {soles(visibles.reduce((a, f) => a + f.venta, 0))}
            {visibles.some((f) => f.id <= 0) && ` · ${visibles.filter((f) => f.id <= 0).length} día(s) con caja sin conteo`}
          </p>
        </div>
      </div>
      <TablaPaginada
        etiqueta="conteos"
        vacio={
          <div className="p-6">
            <Vacio
              icono={<ClipboardCheck className="h-6 w-6" />}
              titulo="Sin conteos en este mes"
              texto="Cuando el personal guarde su conteo aparecerá aquí con su fecha."
            />
          </div>
        }
        cabecera={
          <thead>
            <tr>
              <th>{tipo === "DIA" ? "Fecha" : "Semana"}</th>
              {porColegio && <th>Colegio</th>}
              <th>Contados</th>
              <th className="text-right">Vendido</th>
              <th className="text-right">Venta</th>
              <th className="text-right">Sobrante</th>
              <th>Caja</th>
              <th>Registró</th>
              <th />
            </tr>
          </thead>
        }
        filas={visibles.map((f) => {
          return (
            <tr
              key={`${f.id}-${f.fecha}`}
              onClick={f.id > 0 ? () => router.push(`/conteos/${f.id}`) : undefined}
              className={f.id > 0 ? "cursor-pointer" : ""}
            >
              <td className="whitespace-nowrap">
                {f.id > 0 ? (
                  <Link href={`/conteos/${f.id}`} className="font-medium text-verde-700 first-letter:uppercase hover:underline">
                    {nombreConteo(tipo, f.fecha)}
                  </Link>
                ) : (
                  <span className="font-medium first-letter:uppercase">{nombreConteo(tipo, f.fecha)}</span>
                )}
              </td>
              {porColegio && <td>{f.colegio}</td>}
              <td>
                {f.id > 0 ? (
                  <span className="chip chip-neutro">
                    {f.contados} producto{f.contados === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="chip chip-atencion">No contó</span>
                )}
              </td>
              <td className="text-right tabular-nums">{numero(f.unidades)} unid.</td>
              <td className="text-right font-medium tabular-nums">{soles(f.venta)}</td>
              <td className="text-right tabular-nums">{f.sobrante > 0 ? `${numero(f.sobrante)} unid.` : "—"}</td>
              <td>
                {!f.caja ? (
                  <span className="text-xs text-suave">Sin registrar</span>
                ) : f.id <= 0 || f.caja.sistema === 0 ? (
                  <span className="text-sm">
                    <b className="tabular-nums">{soles(f.caja.fisico)}</b> en efectivo
                    {f.caja.motivo && <span className="block max-w-[220px] text-xs text-[#8a5a00]">{f.caja.motivo}</span>}
                  </span>
                ) : Math.round((f.caja.fisico - f.caja.sistema) * 100) === 0 ? (
                  <span className="chip chip-exito">{soles(f.caja.fisico)} · cuadra</span>
                ) : (
                  <span className="chip chip-atencion" title={f.caja.motivo ?? ""}>
                    {soles(f.caja.fisico)} · {f.caja.fisico > f.caja.sistema ? "+" : "−"}
                    {soles(Math.abs(f.caja.fisico - f.caja.sistema))}
                  </span>
                )}
              </td>
              <td className="text-suave">
                {f.registro || "—"}
                <span className="block text-xs">{horaLima(f.ultimo)}</span>
              </td>
              <td className="w-8 text-suave">{f.id > 0 && <ChevronRight className="h-4 w-4" />}</td>
            </tr>
          );
        })}
      />
    </div>
  );
}
