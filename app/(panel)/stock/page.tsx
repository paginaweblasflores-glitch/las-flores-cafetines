import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { obtenerCategorias, obtenerColegios, obtenerStock } from "@/lib/data";
import { Encabezado } from "@/components/encabezado";
import { Vacio } from "@/components/ui";
import { TablaStock } from "./tabla";

export const metadata: Metadata = { title: "Stock por cafetín" };

export default async function PaginaStock({ searchParams }: PageProps<"/stock">) {
  const sesion = await requerirSesion(ROLES_PANEL);
  const sp = await searchParams;
  const colegios = await obtenerColegios();
  const pedido = Number(sp.colegio);
  const colegio = colegios.find((c) => c.id === pedido) ?? colegios[0];

  if (!colegio) {
    return <Vacio titulo="No hay colegios activos" texto="Crea un colegio en el menú Colegios." />;
  }

  const [stock, categorias] = await Promise.all([
    obtenerStock({ colegioId: colegio.id, incluirInactivos: true }),
    obtenerCategorias(),
  ]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo="Stock por cafetín"
        descripcion="Lo que hay en cada cafetín según los conteos y entregas (en unidades), con costos y precios."
        acciones={
          <a href={`/api/exportar?tipo=stock&colegio=${colegio.id}`} className="btn-secundario">
            <Download className="h-4 w-4" /> Exportar a Excel
          </a>
        }
      />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {colegios.map((c) => (
          <Link
            key={c.id}
            href={`/stock?colegio=${c.id}`}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              c.id === colegio.id ? "bg-panel text-white" : "border border-borde bg-white text-suave hover:text-tinta"
            }`}
          >
            {c.nombre}
          </Link>
        ))}
      </div>

      <TablaStock
        key={colegio.id}
        // Para logística ni siquiera se envían la ganancia y el margen al navegador
        filas={sesion.rol === "ADMIN" ? stock : stock.map((f) => ({ ...f, ganancia_unitaria: 0, margen_pct: null }))}
        categorias={categorias}
        verGanancia={sesion.rol === "ADMIN"}
      />
    </div>
  );
}
