/** Dominio de los correos internos de Supabase Auth (nadie los usa ni los verifica) */
export const DOMINIO_CORREO = "lasflores.co";

/**
 * Correo interno de un usuario: "Administradora" → administradora@lasflores.co,
 * "Personal de Bosco" → bosco@lasflores.co. En el login se sigue usando el nombre de usuario.
 */
export function correoDeUsuario(usuario: string) {
  const base = usuario
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^personal de\s+/, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${base || "usuario"}@${DOMINIO_CORREO}`;
}
