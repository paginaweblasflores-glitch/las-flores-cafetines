"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, CircleUserRound, Eye, EyeOff, Lock, LogIn } from "lucide-react";
import { iniciarSesion, type EstadoLogin } from "@/app/actions/auth";

export function FormularioLogin({ usuarios }: { usuarios: string[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  const [ver, setVer] = useState(false);
  // El usuario elegido se queda aunque falle la contraseña (solo la contraseña se limpia)
  const [usuario, setUsuario] = useState("");
  const clave = useRef<HTMLInputElement>(null);
  // Tras un error: contraseña vacía y el cursor en ella
  useEffect(() => {
    if (!estado.error || !clave.current) return;
    clave.current.value = "";
    clave.current.focus();
  }, [estado]);
  const conLista = usuarios.length > 0;

  return (
    <form
      // Con onSubmit (y no action=) React no reinicia el formulario: así no se pierde el usuario elegido
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => accion(datos));
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="usuario" className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-suave uppercase">
          <CircleUserRound className="h-3.5 w-3.5" />
          Usuario
        </label>
        {conLista ? (
          <div className="relative">
            <select
              id="usuario"
              name="usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              className="input h-12 cursor-pointer appearance-none pr-10 text-[15px] invalid:text-suave/70"
            >
              <option value="" disabled>
                Selecciona tu usuario...
              </option>
              {usuarios.map((u) => (
                <option key={u} value={u} className="text-tinta">
                  {u}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-suave" />
          </div>
        ) : (
          <input
            id="usuario"
            name="usuario"
            className="input h-12 text-[15px]"
            placeholder="Escribe tu usuario"
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />
        )}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-suave uppercase">
          <Lock className="h-3.5 w-3.5" />
          Contraseña
        </label>
        <div className="relative">
          <input
            ref={clave}
            id="password"
            name="password"
            type={ver ? "text" : "password"}
            className="input h-12 pr-12 text-[15px]"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-suave hover:bg-fondo"
            aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {estado.error && (
        <p role="alert" className="rounded-xl bg-rojo-50 px-3.5 py-2.5 text-sm text-rojo">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="btn-primario h-12 w-full rounded-2xl text-base font-semibold shadow-lg shadow-verde/25"
      >
        <LogIn className="h-[18px] w-[18px]" />
        {pendiente ? "Ingresando..." : "Iniciar sesión"}
      </button>
    </form>
  );
}
