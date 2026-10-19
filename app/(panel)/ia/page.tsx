import type { Metadata } from "next";
import { requerirSesion, ROLES_PANEL } from "@/lib/auth";
import { claveDe, CONF_INSTRUCCIONES, leerConfiguracion, modeloDe, ocultar, PROVEEDORES, type Proveedor } from "@/lib/ia";
import { check, db } from "@/lib/supabase";
import { Encabezado } from "@/components/encabezado";
import { ConfiguracionIA } from "./configuracion";

export const metadata: Metadata = { title: "API" };

export default async function PaginaIA() {
  // Administración y logística (Fernanda) pueden conectar o cambiar la clave
  await requerirSesion(ROLES_PANEL);
  const [conf, documentos, equivalencias] = await Promise.all([
    leerConfiguracion(),
    db().from("ia_documentos").select("id, nombre, tipo, tamano, created_at").order("id").then(check),
    db().from("ia_equivalencias").select("id, texto, usos, updated_at, productos(nombre)").order("updated_at", { ascending: false }).then(check),
  ]);

  const proveedores = (Object.keys(PROVEEDORES) as Proveedor[]).map((p) => {
    const { clave, origen } = claveDe(conf, p);
    return {
      id: p,
      nombre: PROVEEDORES[p].nombre,
      variable: PROVEEDORES[p].variable,
      leeFotos: PROVEEDORES[p].leeFotos,
      // Al navegador solo va la clave tapada
      clave: clave ? ocultar(clave) : null,
      origen,
      modelo: modeloDe(conf, p),
    };
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <Encabezado
        titulo="API"
        descripcion='Conecta la IA para que logística llene las entregas leyendo la foto de la boleta (Entregas → "Llenar con IA").'
      />
      <ConfiguracionIA
        proveedores={proveedores}
        instrucciones={conf.get(CONF_INSTRUCCIONES) ?? ""}
        documentos={documentos as { id: number; nombre: string; tipo: string; tamano: number; created_at: string }[]}
        equivalencias={(equivalencias as unknown as { id: number; texto: string; usos: number; updated_at: string; productos: { nombre: string } | null }[]).map(
          (e) => ({ id: e.id, texto: e.texto, usos: e.usos, producto: e.productos?.nombre ?? "—" }),
        )}
      />
    </div>
  );
}
