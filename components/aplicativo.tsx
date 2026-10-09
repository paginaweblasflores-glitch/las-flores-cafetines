"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, MoreVertical, Smartphone } from "lucide-react";
import { Modal } from "@/components/ui";

/** Evento de Chrome (Android) que permite instalar el aplicativo con un botón propio */
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Chrome avisa una sola vez al cargar la página: se guarda aquí para usarlo después en Usuarios
let evento: EventoInstalar | null = null;
let instalado = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** En el layout raíz: registra el service worker y guarda el aviso de instalación */
export function RegistrarAplicativo() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const alPoder = (e: Event) => {
      e.preventDefault(); // sin el cartel automático: se instala desde Usuarios
      evento = e as EventoInstalar;
      avisar();
    };
    const alInstalar = () => {
      evento = null;
      instalado = true;
      avisar();
    };
    window.addEventListener("beforeinstallprompt", alPoder);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoder);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);
  return null;
}

type Estado = "cargando" | "dentro" | "instalado" | "listo" | "manual";

function useEstado(): Estado {
  return useSyncExternalStore(
    suscribir,
    () => {
      if (window.matchMedia("(display-mode: standalone)").matches) return "dentro";
      if (instalado) return "instalado";
      return evento ? "listo" : "manual";
    },
    () => "cargando",
  );
}

/** Botón "Descargar aplicativo" (módulo Usuarios) */
export function DescargarAplicativo() {
  const estado = useEstado();
  const [ayuda, setAyuda] = useState(false);

  async function instalar() {
    if (!evento) return setAyuda(true);
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    evento = null; // Chrome no deja usar el mismo aviso dos veces
    if (outcome === "accepted") instalado = true;
    avisar();
  }

  if (estado === "dentro") return null; // ya se está usando el aplicativo

  return (
    <>
      <button onClick={estado === "instalado" ? () => setAyuda(true) : instalar} className="btn-secundario">
        {estado === "instalado" ? <CheckCircle2 className="h-4 w-4 text-verde-600" /> : <Download className="h-4 w-4" />}
        {estado === "instalado" ? "Aplicativo instalado" : "Descargar aplicativo"}
      </button>
      <Modal abierto={ayuda} titulo="Instalar el aplicativo" onCerrar={() => setAyuda(false)}>
        <div className="space-y-4 text-sm">
          {estado === "instalado" ? (
            <p className="flex items-start gap-2 rounded-xl bg-verde-50 p-3 text-verde-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Listo: el ícono <b>Las Flores</b> ya está en la pantalla del celular.
            </p>
          ) : (
            <>
              <p className="text-suave">Este navegador no permite instalar con el botón. Hazlo desde su menú:</p>
              <ol className="space-y-2">
                <li className="flex gap-2">
                  <span className="font-semibold">1.</span>
                  <span>
                    Abre el sistema en <b>Google Chrome</b> y toca el menú <MoreVertical className="inline h-4 w-4" /> (arriba a la derecha).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold">2.</span>
                  <span>
                    Toca <b>Instalar aplicación</b> (o <b>Agregar a la pantalla principal</b>) y confirma.
                  </span>
                </li>
              </ol>
            </>
          )}
          <div className="rounded-xl border border-borde p-3">
            <p className="flex items-center gap-2 font-semibold">
              <Smartphone className="h-4 w-4" /> Antes de entregar el celular
            </p>
            <p className="mt-1 text-suave">
              Cierra tu sesión: el aplicativo comparte la sesión con Chrome. Luego la persona abre <b>Las Flores</b> y
              entra con su propio usuario.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
