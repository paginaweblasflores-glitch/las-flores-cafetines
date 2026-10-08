"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type XAxisTickContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { soles } from "@/lib/format";

// Colores del gráfico (validados con el script de dataviz: daltonismo y contraste)
export const GRIS_CONTEXTO = "#b9c1bc";
const GRILLA = "#eef1ef";
const TEXTO_EJE = "#6b7770";
const ejeX = { tickLine: false, axisLine: { stroke: "#dfe4e0" }, tick: { fontSize: 11, fill: TEXTO_EJE } } as const;
const ejeY = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: TEXTO_EJE }, width: 56 } as const;
const solesCorto = (v: number) => `S/ ${v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v)}`;

type Serie = { clave: string; nombre: string; color: string };

/** Tarjeta de tooltip común: el texto va en tinta, el color solo en la marca */
function CajaTooltip({
  titulo,
  filas,
  total,
}: {
  titulo: string;
  filas: { nombre: string; color: string; valor: number; linea?: boolean }[];
  total?: number;
}) {
  return (
    <div className="min-w-44 rounded-xl border border-borde bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-tinta">{titulo}</p>
      {filas.map((f) => (
        <p key={f.nombre} className="flex items-center justify-between gap-4 py-0.5 text-suave">
          <span className="flex items-center gap-2">
            {f.linea ? (
              <span className="h-0.5 w-3 rounded-full" style={{ background: f.color }} />
            ) : (
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: f.color }} />
            )}
            {f.nombre}
          </span>
          <span className="font-medium text-tinta tabular-nums">{soles(f.valor)}</span>
        </p>
      ))}
      {total !== undefined && filas.length > 1 && (
        <p className="mt-1 flex justify-between border-t border-borde pt-1.5 font-medium text-tinta">
          <span>Total</span>
          <span className="tabular-nums">{soles(total)}</span>
        </p>
      )}
    </div>
  );
}

export function Leyenda({ series, linea = false }: { series: { nombre: string; color: string }[]; linea?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-suave">
      {series.map((s) => (
        <li key={s.nombre} className="flex items-center gap-1.5">
          {linea ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          )}
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* ¿Qué días vendemos más? → columnas por día (apiladas por colegio)    */
/* ------------------------------------------------------------------ */
export function GraficoDiario({
  datos,
  series,
  diaHoy,
}: {
  datos: ({ dia: number } & Record<string, number>)[];
  series: Serie[];
  diaHoy: number;
}) {
  const ultima = series.length - 1;
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRILLA} vertical={false} />
          <XAxis
            dataKey="dia"
            {...ejeX}
            interval={0}
            tick={({ x, y, payload }: XAxisTickContentProps) => {
              const dia = Number(payload.value);
              const esHoy = dia === diaHoy;
              // Se muestran los días impares y hoy (siempre)
              if (!esHoy && dia % 2 === 0) return <g />;
              return (
                <text
                  x={Number(x)}
                  y={Number(y) + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={esHoy ? 700 : 400}
                  fill={esHoy ? "#17201b" : TEXTO_EJE}
                >
                  {esHoy ? `Hoy ${dia}` : dia}
                </text>
              );
            }}
          />
          <YAxis {...ejeY} tickFormatter={solesCorto} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "#f1f4f2" }}
            content={({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
              if (!active || !payload?.length) return null;
              const filas = series.map((s) => ({
                nombre: s.nombre,
                color: s.color,
                valor: Number(payload.find((p) => p.dataKey === s.clave)?.value ?? 0),
              }));
              return (
                <CajaTooltip
                  titulo={`Día ${label}${Number(label) === diaHoy ? " (hoy)" : ""}`}
                  filas={filas}
                  total={filas.reduce((a, f) => a + f.valor, 0)}
                />
              );
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.clave}
              dataKey={s.clave}
              stackId="ventas"
              fill={s.color}
              maxBarSize={24}
              stroke="#ffffff"
              strokeWidth={1}
              radius={i === ultima ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ¿Vamos mejor que el mes pasado? → líneas del acumulado               */
/* ------------------------------------------------------------------ */
export function GraficoAcumulado({
  datos,
  mes,
  mesPrevio,
  color,
}: {
  datos: { dia: number; actual: number | null; anterior: number | null }[];
  mes: string;
  mesPrevio: string;
  color: string;
}) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRILLA} vertical={false} />
          <XAxis dataKey="dia" {...ejeX} interval={4} />
          <YAxis {...ejeY} tickFormatter={solesCorto} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "#c9d0cb", strokeWidth: 1 }}
            content={({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
              if (!active || !payload?.length) return null;
              const val = (k: string) => payload.find((p) => p.dataKey === k)?.value;
              const filas = [
                { nombre: mes, color, valor: val("actual"), linea: true },
                { nombre: mesPrevio, color: GRIS_CONTEXTO, valor: val("anterior"), linea: true },
              ].filter((f) => f.valor != null) as { nombre: string; color: string; valor: number; linea: boolean }[];
              return <CajaTooltip titulo={`Acumulado al día ${label}`} filas={filas} />;
            }}
          />
          <Line
            type="linear"
            dataKey="anterior"
            stroke={GRIS_CONTEXTO}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: GRIS_CONTEXTO, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="actual"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 5, fill: color, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
