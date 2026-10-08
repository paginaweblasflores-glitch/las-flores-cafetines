export default function Cargando() {
  return (
    <div className="mx-auto max-w-[1400px] animate-pulse">
      <div className="mb-6 h-8 w-64 rounded-lg bg-borde" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="mt-6 h-80 rounded-2xl bg-white" />
    </div>
  );
}
