"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Ban, CheckCheck, CheckCircle2, Clock, Printer, Receipt, RotateCcw, Save, ShoppingCart, Trash2 } from "lucide-react";
import { iniciarCompra, marcarComprado, registrarCostos, revisarReposicion } from "@/app/actions/reposiciones";
import { avisar, Modal } from "@/components/ui";
import { cantidadConUnidad, ESTADO_REPOSICION, fechaCorta, fechaHoraLima, numero, soles, UNIDADES_REPOSICION } from "@/lib/format";
import type { Rol } from "@/lib/types";

type Item = {
  id: number;
  nombre: string;
  enCatalogo: boolean;
  cantidad: number;
  unidad: string;
  quitado: boolean;
  cantidadAprobada: number | null;
  /** Unidades que hay en el cafetín (solo productos del catálogo) */
  stock: number | null;
  /** Fuera de catálogo: lo que pagó logística */
  costo: number | null;
  costoFecha: string | null;
};

type Datos = {
  id: number;
  codigo: string;
  estado: string;
  colegio: string;
  nota: string | null;
  fecha: string;
  pedidoPor: string;
  revisadoPor: string;
  revisadoAt: string | null;
  motivoRechazo: string | null;
  compraPor: string;
  compraAt: string | null;
  compradoPor: string;
  compradoAt: string | null;
  items: Item[];
};

export function DetalleReposicion({ rol, r }: { rol: Rol; r: Datos }) {
  // Logística revisa, compra y cierra; administración solo la ve
  const esLogistica = rol === "LOGISTICA";
  const revisando = esLogistica && r.estado === "POR_APROBAR";
  // Lo que logística deja en la lista mientras revisa (cantidad como texto para editar)
  const [quitados, setQuitados] = useState<Record<number, boolean>>({});
  const [cantidades, setCantidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(r.items.map((i) => [i.id, String(i.cantidad)])),
  );
  const [ocupado, setOcupado] = useState(false);
  const [noAprobar, setNoAprobar] = useState(false);
  const [motivo, setMotivo] = useState("");

  const final = (i: Item) => (revisando ? Number(cantidades[i.id]) : (i.cantidadAprobada ?? i.cantidad));
  const fuera = (i: Item) => (revisando ? !!quitados[i.id] : i.quitado);
  const incluidos = r.items.filter((i) => !fuera(i));
  const cantidadMala = revisando && incluidos.some((i) => !Number.isInteger(final(i)) || final(i) <= 0);
  const est = ESTADO_REPOSICION[r.estado];

  async function aprobar() {
    setOcupado(true);
    const res = await revisarReposicion(
      r.id,
      true,
      incluidos.map((i) => ({ id: i.id, cantidad: final(i) })),
      "",
    );
    setOcupado(false);
    if (res.ok) avisar(res.mensaje ?? "Aprobada");
    else avisar(res.error, "error");
  }

  async function rechazar() {
    setOcupado(true);
    const res = await revisarReposicion(r.id, false, [], motivo);
    setOcupado(false);
    if (res.ok) {
      setNoAprobar(false);
      avisar(res.mensaje ?? "No aprobada");
    } else avisar(res.error, "error");
  }

  async function comprar() {
    setOcupado(true);
    const res = await iniciarCompra(r.id);
    setOcupado(false);
    if (res.ok) avisar(res.mensaje ?? "Compra iniciada");
    else avisar(res.error, "error");
  }

  async function terminar() {
    setOcupado(true);
    const res = await marcarComprado(r.id);
    setOcupado(false);
    if (res.ok) avisar(res.mensaje ?? "Comprada");
    else avisar(res.error, "error");
  }
  // Para terminar, todo lo de fuera del catálogo debe tener su costo anotado
  const sinCosto = r.items.filter((i) => !i.enCatalogo && !i.quitado && i.costo == null).length;

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* ================= Pantalla ================= */}
      <div className="print:hidden">
        <Link href="/reposiciones" className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-tinta">
          <ArrowLeft className="h-4 w-4" /> Reposiciones
        </Link>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{r.codigo}</h1>
              <span className={`chip ${est?.clase ?? ""}`}>{est?.texto ?? r.estado}</span>
            </div>
            <p className="mt-1 text-sm text-suave">
              {r.colegio} · pedido por {r.pedidoPor || "—"} · {fechaHoraLima(r.fecha)}
            </p>
          </div>
          <button onClick={() => window.print()} className="btn-secundario">
            <Printer className="h-4 w-4" /> Imprimir lista
          </button>
        </div>

        {/* Qué toca hacer ahora */}
        <Estado
          r={r}
          esLogistica={esLogistica}
          incluidos={incluidos.length}
          ocupado={ocupado}
          comprar={comprar}
          terminar={terminar}
          sinCosto={sinCosto}
        />

        {(r.estado === "APROBADA" || r.estado === "EN_COMPRA" || r.estado === "COMPRADA") && (
          <CostosFueraCatalogo
            reposicionId={r.id}
            items={r.items.filter((i) => !i.enCatalogo && !i.quitado)}
            editable={esLogistica && r.estado !== "COMPRADA"}
          />
        )}

        {r.nota && (
          <div className="card mb-4 px-5 py-3 text-sm">
            <span className="text-suave">Nota del personal: </span>
            {r.nota}
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <h2 className="font-medium">
              Productos ({incluidos.length}
              {incluidos.length !== r.items.length ? ` de ${r.items.length}` : ""})
            </h2>
            {revisando && <p className="text-xs text-suave">Quita lo que no corresponde o ajusta la cantidad.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Producto</th>
                  <th className="text-right">En el cafetín</th>
                  <th>Pidió</th>
                  <th>{revisando ? "Aprobar" : "Aprobado"}</th>
                  {revisando && <th />}
                </tr>
              </thead>
              <tbody>
                {r.items.map((i, n) => {
                  const q = fuera(i);
                  return (
                    <tr key={i.id} className={q ? "text-suave" : ""}>
                      <td className="text-suave tabular-nums">{n + 1}</td>
                      <td>
                        <span className={q ? "line-through" : "font-medium"}>{i.nombre}</span>
                        {!i.enCatalogo && <span className="chip ml-2 bg-fondo text-suave">Fuera de catálogo</span>}
                      </td>
                      <td className="text-right tabular-nums">
                        {i.stock != null ? `${numero(i.stock)} unid.` : <span className="text-suave">—</span>}
                      </td>
                      <td className="whitespace-nowrap">{cantidadConUnidad(i.cantidad, i.unidad)}</td>
                      <td className="whitespace-nowrap">
                        {revisando && !q ? (
                          <span className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              value={cantidades[i.id]}
                              onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: e.target.value }))}
                              className="input h-9 w-20 py-1 text-center"
                              aria-label={`Cantidad aprobada de ${i.nombre}`}
                            />
                            <span className="text-suave">{UNIDADES_REPOSICION[i.unidad]?.[Number(cantidades[i.id]) === 1 ? 0 : 1] ?? i.unidad}</span>
                          </span>
                        ) : q ? (
                          <span className="chip bg-rojo-50 text-rojo">Quitado</span>
                        ) : r.estado === "POR_APROBAR" ? (
                          <span className="text-suave">Por revisar</span>
                        ) : r.estado === "APROBADA" || r.estado === "EN_COMPRA" || r.estado === "COMPRADA" ? (
                          <b className={i.cantidadAprobada != null ? "text-[#2b5ea7]" : ""}>
                            {cantidadConUnidad(final(i), i.unidad)}
                          </b>
                        ) : (
                          <span className="text-suave">—</span>
                        )}
                      </td>
                      {revisando && (
                        <td className="w-10 text-right">
                          <button
                            onClick={() => setQuitados((s) => ({ ...s, [i.id]: !s[i.id] }))}
                            className={`rounded-lg p-1.5 ${q ? "text-verde-700 hover:bg-verde-50" : "text-rojo hover:bg-rojo-50"}`}
                            title={q ? "Volver a la lista" : "Quitar de la lista"}
                            aria-label={q ? `Volver a agregar ${i.nombre}` : `Quitar ${i.nombre}`}
                          >
                            {q ? <RotateCcw className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {revisando && (
            <div className="flex flex-col-reverse gap-2 border-t border-borde px-5 py-4 sm:flex-row sm:justify-end">
              <button onClick={() => setNoAprobar(true)} disabled={ocupado} className="btn-secundario text-rojo">
                <Ban className="h-4 w-4" /> No aprobar
              </button>
              <button onClick={aprobar} disabled={ocupado || incluidos.length === 0 || cantidadMala} className="btn-primario">
                <CheckCircle2 className="h-4 w-4" />
                {ocupado
                  ? "Guardando..."
                  : cantidadMala
                    ? "Revisa las cantidades"
                    : `Aprobar ${incluidos.length} producto${incluidos.length === 1 ? "" : "s"}`}
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal
        abierto={noAprobar}
        onCerrar={() => setNoAprobar(false)}
        titulo={`No aprobar ${r.codigo}`}
        subtitulo="El personal la verá como no aprobada, con el motivo."
      >
        <label className="block">
          <span className="label">Motivo (opcional)</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej.: todavía hay stock suficiente"
            className="input"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setNoAprobar(false)} className="btn-secundario">
            Cancelar
          </button>
          <button onClick={rechazar} disabled={ocupado} className="btn-peligro">
            {ocupado ? "Guardando..." : "No aprobar"}
          </button>
        </div>
      </Modal>

      {/* ================= Hoja para imprimir ================= */}
      <HojaImpresion r={r} items={incluidos} final={final} />
    </div>
  );
}

/** Aviso de en qué va la reposición y la acción que le toca a logística */
function Estado({
  r,
  esLogistica,
  incluidos,
  ocupado,
  comprar,
  terminar,
  sinCosto,
}: {
  r: Datos;
  esLogistica: boolean;
  incluidos: number;
  ocupado: boolean;
  comprar: () => void;
  terminar: () => void;
  sinCosto: number;
}) {
  const caja = "card mb-4 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between";
  if (r.estado === "POR_APROBAR") {
    return esLogistica ? null : (
      <div className={`${caja} border-ambar/40 bg-ambar-50`}>
        <p className="flex items-center gap-2 text-sm text-[#8a5a00]">
          <Clock className="h-4 w-4" /> Esperando que logística la revise.
        </p>
      </div>
    );
  }
  if (r.estado === "APROBADA") {
    return (
      <div className={`${caja} border-verde/40 bg-verde-50`}>
        <p className="text-sm text-verde-700">
          <b>Aprobada</b> por {r.revisadoPor || "logística"} · {r.revisadoAt ? fechaHoraLima(r.revisadoAt) : ""} ·{" "}
          {incluidos} producto{incluidos === 1 ? "" : "s"} por comprar
          {esLogistica && <span className="block text-xs opacity-80">Imprime la lista y empieza la compra.</span>}
        </p>
        {esLogistica && (
          <button onClick={comprar} disabled={ocupado} className="btn-primario shrink-0">
            <ShoppingCart className="h-4 w-4" /> {ocupado ? "Guardando..." : "Iniciar compra"}
          </button>
        )}
      </div>
    );
  }
  if (r.estado === "EN_COMPRA") {
    return (
      <div className={`${caja} border-[#2b5ea7]/30 bg-[#e8f0fb]`}>
        <p className="flex items-center gap-2 text-sm text-[#2b5ea7]">
          <ShoppingCart className="h-4 w-4 shrink-0" />
          <span>
            <b>En compra</b> · {r.compraPor || "logística"} · desde {r.compraAt ? fechaHoraLima(r.compraAt) : ""}
            {esLogistica && (
              <span className="block text-xs opacity-80">
                {sinCosto
                  ? `Anota abajo el costo de ${sinCosto} producto${sinCosto === 1 ? "" : "s"} fuera del catálogo y luego marca "Comprado".`
                  : 'Cuando tengas todo, marca "Comprado".'}
              </span>
            )}
          </span>
        </p>
        {esLogistica && (
          <button onClick={terminar} disabled={ocupado || sinCosto > 0} className="btn-primario shrink-0">
            <CheckCheck className="h-4 w-4" /> {ocupado ? "Guardando..." : sinCosto ? "Faltan costos" : "Comprado"}
          </button>
        )}
      </div>
    );
  }
  if (r.estado === "COMPRADA") {
    return (
      <div className={`${caja} border-verde/40 bg-verde-50`}>
        <p className="flex items-center gap-2 text-sm text-verde-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            <b>Comprada</b> por {r.compradoPor || "logística"} · {r.compradoAt ? fechaHoraLima(r.compradoAt) : ""}
            <span className="block text-xs opacity-80">
              Lo del catálogo entra al stock cuando se registra la entrega y el colegio la recibe.
            </span>
          </span>
        </p>
      </div>
    );
  }
  if (r.estado === "RECHAZADA") {
    return (
      <div className={`${caja} border-rojo/30 bg-rojo-50`}>
        <p className="text-sm text-rojo">
          <b>No aprobada</b> por {r.revisadoPor || "logística"} · {r.revisadoAt ? fechaHoraLima(r.revisadoAt) : ""}
          {r.motivoRechazo ? ` · ${r.motivoRechazo}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className={`${caja} bg-fondo`}>
      <p className="text-sm text-suave">El personal anuló esta reposición antes de que se revisara.</p>
    </div>
  );
}

/** Lista limpia para imprimir y llevar a la compra */
function HojaImpresion({ r, items, final }: { r: Datos; items: Item[]; final: (i: Item) => number }) {
  const est = ESTADO_REPOSICION[r.estado];
  return (
    <div className="hidden text-black print:block">
      <div className="flex items-center justify-between border-b-2 border-black pb-3">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Las Flores" width={56} height={56} className="h-14 w-14" />
          <div>
            <p className="text-lg font-bold">Restaurante Las Flores</p>
            <p className="text-sm">Lista de reposición</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{r.codigo}</p>
          <p className="text-sm">{est?.texto ?? r.estado}</p>
        </div>
      </div>

      <table className="mt-3 w-full text-sm">
        <tbody>
          <tr>
            <td className="py-0.5 pr-4 font-semibold">Colegio</td>
            <td>{r.colegio}</td>
            <td className="py-0.5 pr-4 font-semibold">Pedido por</td>
            <td>
              {r.pedidoPor || "—"} · {fechaHoraLima(r.fecha)}
            </td>
          </tr>
          {r.revisadoAt && (
            <tr>
              <td className="py-0.5 pr-4 font-semibold">Revisado por</td>
              <td>{r.revisadoPor || "—"}</td>
              <td className="py-0.5 pr-4 font-semibold">Fecha</td>
              <td>{fechaHoraLima(r.revisadoAt)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="w-8 py-2" />
            <th className="w-8 py-2">#</th>
            <th className="py-2">Producto</th>
            <th className="py-2 text-right">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={i.id} className="border-b border-gray-300">
              <td className="py-2">
                <span className="inline-block h-4 w-4 border border-black" />
              </td>
              <td className="py-2">{n + 1}</td>
              <td className="py-2">
                {i.nombre}
                {!i.enCatalogo && <span className="text-xs text-gray-600"> (fuera de catálogo)</span>}
              </td>
              <td className="py-2 text-right font-semibold">{cantidadConUnidad(final(i), i.unidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {r.nota && (
        <p className="mt-4 text-sm">
          <b>Nota:</b> {r.nota}
        </p>
      )}
      <p className="mt-8 text-xs text-gray-600">
        {items.length} producto{items.length === 1 ? "" : "s"} · Impreso desde el sistema Las Flores
      </p>
    </div>
  );
}

/** Logística anota cuánto pagó por lo que no es del catálogo (se descuenta de la ganancia del mes) */
function CostosFueraCatalogo({ reposicionId, items, editable }: { reposicionId: number; items: Item[]; editable: boolean }) {
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.costo == null ? "" : String(i.costo)])),
  );
  const [ocupado, setOcupado] = useState(false);
  if (items.length === 0) return null;

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const cambios = items.filter((i) => num(valores[i.id]) !== i.costo);
  const invalido = items.some((i) => {
    const n = num(valores[i.id]);
    return n !== null && (!Number.isFinite(n) || n < 0);
  });
  const total = items.reduce((a, i) => a + (num(valores[i.id]) ?? 0), 0);
  const faltan = items.filter((i) => num(valores[i.id]) === null).length;

  async function guardar() {
    setOcupado(true);
    const res = await registrarCostos(
      reposicionId,
      cambios.map((i) => ({ id: i.id, costo: num(valores[i.id]) })),
    );
    setOcupado(false);
    if (res.ok) avisar(res.mensaje ?? "Guardado");
    else avisar(res.error, "error");
  }

  return (
    <div className="card mb-4 overflow-hidden print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Receipt className="h-4 w-4 text-suave" /> Costo de lo comprado fuera del catálogo
          </h2>
          <p className="text-xs text-suave">
            No entra al stock. Anota lo que pagaste (total de cada producto); se descuenta de la ganancia del mes.
          </p>
        </div>
        <p className="text-sm">
          Total <b className="tabular-nums">{soles(total)}</b>
          {faltan > 0 && <span className="ml-2 text-xs text-[#8a5a00]">· {faltan} sin costo</span>}
        </p>
      </div>
      <ul className="divide-y divide-borde">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="min-w-0">
              <span className="block font-medium">{i.nombre}</span>
              <span className="block text-xs text-suave">
                {cantidadConUnidad(i.cantidadAprobada ?? i.cantidad, i.unidad)}
                {i.costoFecha ? ` · anotado el ${fechaCorta(i.costoFecha)}` : ""}
              </span>
            </span>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-suave">S/</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={valores[i.id]}
                onChange={(e) => setValores((v) => ({ ...v, [i.id]: e.target.value }))}
                placeholder="0.00"
                className="input h-10 w-28 text-right disabled:bg-fondo"
                disabled={!editable}
                aria-label={`Costo de ${i.nombre}`}
              />
            </label>
          </li>
        ))}
      </ul>
      {editable && (
      <div className="flex justify-end border-t border-borde px-5 py-3">
        <button onClick={guardar} disabled={ocupado || invalido || cambios.length === 0} className="btn-primario">
          <Save className="h-4 w-4" /> {ocupado ? "Guardando..." : invalido ? "Revisa los montos" : "Guardar costos"}
        </button>
      </div>
      )}
    </div>
  );
}
