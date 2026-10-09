import type { Metadata } from "next";
import Image from "next/image";
import { check, db } from "@/lib/supabase";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Ingresar" };

// Página guardada en caché (responde al instante, también a WhatsApp al armar la vista previa del link).
// La lista de usuarios se renueva cada minuto y al guardar un usuario (revalidatePath en actions/admin.ts).
export const revalidate = 60;

async function usuariosActivos() {
  try {
    const filas = check(await db().from("usuarios").select("usuario, rol").eq("activo", true).order("id")) as {
      usuario: string;
      rol: string;
    }[];
    return filas.map((f) => f.usuario);
  } catch {
    // Sin conexión a la base: el formulario permite escribir el usuario a mano
    return [];
  }
}

export default async function PaginaLogin() {
  const usuarios = await usuariosActivos();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-panel px-4 py-4">
      {/* Decoración de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full border-[48px] border-verde/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-24 h-80 w-80 rounded-full border-[40px] border-verde/10"
      />

      <div className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-white/10 shadow-2xl shadow-black/50">
        {/* Cabecera */}
        <div className="relative overflow-hidden bg-gradient-to-br from-panel-3 via-panel-2 to-verde-oscuro px-8 pt-6 pb-5 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full border-[18px] border-verde/15"
          />
          <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white p-1.5 shadow-lg shadow-black/30 ring-1 ring-white/20">
            <Image
              src="/logo.png"
              alt="Restaurante Turístico Las Flores"
              width={128}
              height={128}
              priority
              className="h-full w-full"
            />
          </span>
          <h1 className="relative mt-3 text-2xl font-semibold tracking-tight text-white">Control de Cafetines</h1>
          <p className="relative mt-1 text-sm text-panel-text">Selecciona tu usuario e ingresa tu contraseña.</p>
        </div>

        {/* Formulario */}
        <div className="bg-fondo px-7 pt-6 pb-5">
          <FormularioLogin usuarios={usuarios} />
          <p className="mt-5 text-center text-xs text-suave">Restaurante Turístico Las Flores · Desde 1980</p>
        </div>
      </div>
    </main>
  );
}
