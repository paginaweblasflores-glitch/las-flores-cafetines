import type { MetadataRoute } from "next";

/** Datos del aplicativo instalable (Android: "Descargar aplicativo" en Usuarios) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Las Flores · Cafetines",
    short_name: "Cafetines",
    description: "Control de inventario y ventas de los cafetines del Restaurante Las Flores",
    lang: "es",
    // "/" lleva a cada uno a su pantalla según su rol (o al login)
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f1a14",
    icons: [
      { src: "/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
