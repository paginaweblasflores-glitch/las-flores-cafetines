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

export const metadata: Metadata = {
  title: {
    default: "Las Flores · Cafetines",
    template: "%s · Las Flores",
  },
  description: "Control de inventario y ventas de los cafetines del Restaurante Las Flores",
  // Vista previa al compartir el link (WhatsApp, Facebook…): la imagen es app/opengraph-image.jpg.
  // En Vercel, Next.js arma la URL completa de la imagen con el dominio de producción.
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "Las Flores",
    title: "Sistema de Cafetines · Las Flores",
    description: "Control de stock, ventas y reposiciones en tiempo real para el Restaurante Turístico Las Flores.",
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
