import { NextResponse, type NextRequest } from "next/server";
import { supabaseSesion } from "@/lib/supabase-sesion";

/** Cierra la sesión (vencida, o de un usuario desactivado) y lleva al login */
export async function GET(request: NextRequest) {
  await (await supabaseSesion()).auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
