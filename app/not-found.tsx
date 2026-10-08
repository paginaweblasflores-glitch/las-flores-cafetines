import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <p className="text-5xl font-semibold text-verde">404</p>
        <p className="mt-2 text-suave">Esta página no existe.</p>
        <Link href="/" className="btn-primario mt-6">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
