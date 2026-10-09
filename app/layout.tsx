import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SeleccionarNumeros } from "@/components/seleccionar-numeros";
import { RegistrarAplicativo } from "@/components/aplicativo";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Dominio para los links completos (imagen al compartir). En Vercel lo da la plataforma.
const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(dominio),
  title: {
    default: "Las Flores · Cafetines",
    template: "%s · Las Flores",
  },
  description: "Control de inventario y ventas de los cafetines del Restaurante Las Flores",
  // Vista previa al compartir el link (WhatsApp, Facebook…)
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "Las Flores",
    title: "Sistema de Cafetines · Las Flores",
    description: "Control de stock, ventas y reposiciones en tiempo real para el Restaurante Turístico Las Flores.",
    images: [
      {
        url: "/compartir.jpg",
        width: 1200,
        height: 1200,
        type: "image/jpeg",
        alt: "Sistema de Cafetines del Restaurante Turístico Las Flores en laptop, tablet y celular",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0f1a14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SeleccionarNumeros />
        <RegistrarAplicativo />
        {children}
      </body>
    </html>
  );
}
