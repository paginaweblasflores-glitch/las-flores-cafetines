import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SeleccionarNumeros } from "@/components/seleccionar-numeros";

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
};

export const viewport: Viewport = {
  themeColor: "#0f1a14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SeleccionarNumeros />
        {children}
      </body>
    </html>
  );
}
