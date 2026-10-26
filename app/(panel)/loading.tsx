/** Mientras carga: la forma de la página en gris (así no parece vacía ni salta al aparecer) */
export default function Cargando() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse" aria-busy="true" aria-label="Cargando">
      {/* Encabezado: título y descripción */}
      <div className="mb-6">
        <div className="h-7 w-56 rounded-md bg-[#e2e7e4]" />
        <div className="mt-2 h-4 w-96 max-w-full rounded-md bg-[#e9ede9]" />
      </div>
      {/* Tabla: barra de filtros y filas */}
      <div className="card overflow-hidden">
        <div className="flex gap-3 border-b border-borde p-4">
          <div className="h-9 flex-1 rounded-lg bg-[#eef1ef]" />
          <div className="hidden h-9 w-40 rounded-lg bg-[#eef1ef] sm:block" />
          <div className="hidden h-9 w-28 rounded-lg bg-[#eef1ef] sm:block" />
        </div>
        <div className="h-9 border-b border-borde bg-[#f6f8f7]" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-borde px-4 py-3 last:border-b-0">
            <div className="h-8 w-8 rounded-lg bg-[#eef1ef]" />
            <div className="h-4 flex-1 rounded-md bg-[#eef1ef]" style={{ maxWidth: `${55 - (i % 3) * 10}%` }} />
            <div className="ml-auto h-4 w-20 rounded-md bg-[#eef1ef]" />
            <div className="h-5 w-16 rounded-md bg-[#eef1ef]" />
          </div>
        ))}
      </div>
    </div>
  );
}
