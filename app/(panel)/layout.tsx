import { requerirSesion, ROLES_PANEL, NOMBRE_ROL } from "@/lib/auth";
import { colegioSeleccionado, contarReposicionesPendientes, obtenerColegios } from "@/lib/data";
import { Avisos } from "@/components/ui";
import { BarraLateral } from "./barra-lateral";
import { BarraSuperior } from "./barra-superior";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion(ROLES_PANEL);
  const [colegios, colegioId, reposiciones] = await Promise.all([
    obtenerColegios(),
    colegioSeleccionado(),
    contarReposicionesPendientes(sesion.rol),
  ]);

  return (
    <div className="min-h-screen bg-fondo">
      <Avisos />
      <div className="flex min-h-screen">
        <BarraLateral rol={sesion.rol} avisos={{ "/reposiciones": reposiciones }} />
        <div className="flex min-w-0 flex-1 flex-col">
          <BarraSuperior
            nombre={sesion.nombre}
            usuario={sesion.usuario}
            nombreRol={NOMBRE_ROL[sesion.rol]}
            colegios={colegios.map((c) => ({ id: c.id, nombre: c.nombre }))}
            colegioId={colegioId}
          />
          <main className="flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-9 lg:pt-8 print:p-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
