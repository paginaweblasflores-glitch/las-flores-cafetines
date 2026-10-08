/** Mini tendencia para las tarjetas de indicadores (sin ejes; el valor exacto está en la tarjeta) */
export function MiniTendencia({ valores, color }: { valores: number[]; color: string }) {
  if (valores.length < 2) return null;
  const an = 96;
  const al = 32;
  const max = Math.max(...valores, 1);
  const x = (i: number) => 2 + (i / (valores.length - 1)) * (an - 6);
  const y = (v: number) => al - 3 - (v / max) * (al - 8);
  const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ultimo = valores.length - 1;
  return (
    <svg width={an} height={al} viewBox={`0 0 ${an} ${al}`} aria-hidden className="shrink-0">
      <polyline points={puntos} fill="none" stroke="#c9d0cb" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ultimo)} cy={y(valores[ultimo])} r={4} fill={color} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}

/** Barra de progreso (parte de un total) */
export function Medidor({ valor, total, color }: { valor: number; total: number; color: string }) {
  const p = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-verde-100"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={valor}
    >
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}
