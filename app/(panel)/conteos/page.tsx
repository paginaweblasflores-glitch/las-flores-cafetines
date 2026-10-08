import type { Metadata } from "next";
import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { obtenerColegios, obtenerConteos, obtenerStock, obtenerUsuariosMapa } from "@/lib/data";
import { mesActual, rangoMes } from "@/lib/format";

const restarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
import { Encabezado } from "@/components/encabezado";
import { ListaConteos } from "./lista";

export const metadata: Metadata = { title: "Conteos" };

export default async function PaginaConteos({ searchParams }: PageProps<"/conteos">) {
  await requerirSesion(["ADMIN"]);
  const sp = await searchParams;
  const tipo = sp.tipo === "semana" ? "SEMANA" : "DIA";
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : mesActual();
  const { desde, hasta } = rangoMes(mes);
  const t = tipo === "SEMANA" ? "semana" : "dia";

  const colegios = await obtenerColegios(false);
  // Del día / Semanal se elige en el menú lateral; aquí se elige el colegio
  const pedido = Number(sp.colegio);
  const colegioId = colegios.some((c) => c.id === pedido) ? pedido : null;
  const [conteos, usuarios, stock] = await Promise.all([
    // Semanal: la fecha es el lunes; entra toda semana que toque el mes (la del 28 sep cuenta para octubre)
    obtenerConteos({ tipo, desde: tipo === "SEMANA" ? restarDias(desde, 6) : desde, hasta, colegioId }),
    obtenerUsuariosMapa(),
    obtenerStock(),
  ]);
  // Cuántos productos de ese tipo tiene cada colegio (para "16 de 16")
  const totalPorColegio = new Map<number, number>();
  for (const s of stock) {
    if (s.perecible === (tipo === "DIA")) totalPorColegio.set(s.colegio_id, (totalPorColegio.get(s.colegio_id) ?? 0) + 1);
  }

  const pestana = (id: number | null, texto: string) => (
    <Link
      key={id ?? 0}
      href={`/conteos?tipo=${t}&mes=${mes}${id ? `&colegio=${id}` : ""}`}
      className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        id === colegioId ? "bg-panel text-white" : "border border-borde bg-white text-suave hover:text-tinta"
      }`}
    >
      {texto}
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo={tipo === "DIA" ? "Conteos del día" : "Conteos semanales"}
        descripcion={
          tipo === "DIA"
            ? "Lo que contó el personal cada día (productos del día). Haz clic en uno para ver producto por producto."
            : "Lo que contó el personal cada semana (productos semanales). Haz clic en uno para ver producto por producto."
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {colegios.length > 1 && pestana(null, "Todos")}
          {colegios.map((c) => pestana(c.id, c.nombre))}
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tipo" value={t} />
          {colegioId && <input type="hidden" name="colegio" value={colegioId} />}
          <input type="month" name="mes" defaultValue={mes} className="input w-auto py-1.5" />
          <button className="btn-secundario py-1.5">Ver</button>
        </form>
      </div>

      <ListaConteos
        tipo={tipo}
        porColegio={!colegioId}
        titulo={colegioId ? (colegios.find((c) => c.id === colegioId)?.nombre ?? "") : "Todos los colegios"}
        filas={conteos.map((c) => {
          const ultimo = c.items.reduce((a, i) => (i.updated_at > a ? i.updated_at : a), c.updated_at);
          return {
            id: c.id,
            fecha: c.fecha,
            colegioId: c.colegio_id,
            colegio: colegios.find((x) => x.id === c.colegio_id)?.nombre ?? "",
            contados: c.items.length,
            total: totalPorColegio.get(c.colegio_id) ?? c.items.length,
            unidades: c.items.reduce((a, i) => a + i.vendido, 0),
            venta: c.items.reduce((a, i) => a + Number(i.monto), 0),
            sobrante: c.items.reduce((a, i) => a + i.sobrante, 0),
            registro: c.usuario_id ? (usuarios.get(c.usuario_id)?.nombre ?? "") : "",
            ultimo,
          };
        })}
      />
    </div>
  );
}
