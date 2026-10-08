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
            {visibles.length} conteo{visibles.length === 1 ? "" : "s"} · vendido{" "}
            {soles(visibles.reduce((a, f) => a + f.venta, 0))}
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
              <th>Registró</th>
              <th />
            </tr>
          </thead>
        }
        filas={visibles.map((f) => {
          const completo = f.contados >= f.total;
          return (
            <tr key={f.id} onClick={() => router.push(`/conteos/${f.id}`)} className="cursor-pointer">
              <td className="whitespace-nowrap">
                <Link href={`/conteos/${f.id}`} className="font-medium text-verde-700 first-letter:uppercase hover:underline">
                  {nombreConteo(tipo, f.fecha)}
                </Link>
              </td>
              {porColegio && <td>{f.colegio}</td>}
              <td>
                <span className={`chip ${completo ? "bg-verde-50 text-verde-700" : "bg-ambar-50 text-[#8a5a00]"}`}>
                  {f.contados} de {f.total}
                </span>
              </td>
              <td className="text-right tabular-nums">{numero(f.unidades)} unid.</td>
              <td className="text-right font-medium tabular-nums">{soles(f.venta)}</td>
              <td className="text-right tabular-nums">{f.sobrante > 0 ? `${numero(f.sobrante)} unid.` : "—"}</td>
              <td className="text-suave">
                {f.registro || "—"}
                <span className="block text-xs">{horaLima(f.ultimo)}</span>
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
