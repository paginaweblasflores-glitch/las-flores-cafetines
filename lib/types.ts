export type Rol = "ADMIN" | "LOGISTICA" | "PERSONAL" | "COCINA";

export type Presentacion = "UNIDAD" | "CAJA" | "PAQUETE" | "BOLSA" | "OTRO";

export type TipoMovimiento = "INGRESO" | "VENTA" | "AJUSTE" | "MERMA";

export type Sesion = {
  uid: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  colegioId: number | null;
};

export type Colegio = {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  responsable: string | null;
  activo: boolean;
};

export type Categoria = { id: number; nombre: string; orden: number };

/** Fila de la vista v_stock (equivale a la hoja CONTROL de cada colegio) */
export type StockRow = {
  id: number;
  colegio_id: number;
  colegio: string;
  producto_id: number;
  producto: string;
  categoria_id: number | null;
  categoria: string | null;
  presentacion: Presentacion;
  unidades_por_presentacion: number;
  /** Stock total en unidades (las cajas son solo referencia) */
  total_unidades: number;
  costo_presentacion: number;
  costo_unitario: number;
  precio_venta: number;
  ganancia_unitaria: number;
  margen_pct: number | null;
  valor_venta_stock: number;
  valor_costo_stock: number;
  stock_minimo: number;
  stock_bajo: boolean;
  activo: boolean;
  producto_activo: boolean;
  colegio_activo: boolean;
  observacion: string | null;
  updated_at: string;
  /** Se prepara y se vende en el día: lo que sobra se registra como merma */
  perecible: boolean;
  /** Última vez que el personal contó el producto (aunque coincida) */
  ultimo_conteo: string | null;
};

export type VentaDiaria = {
  colegio_id: number;
  producto_id: number;
  fecha: string;
  unidades: number;
  monto: number;
  costo: number;
  ganancia: number;
};

export type Movimiento = {
  id: number;
  fecha: string;
  colegio_id: number;
  producto_id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  cajas: number;
  unidades_por_caja: number | null;
  efecto_stock: number;
  precio_unitario: number;
  costo_unitario: number;
  monto: number;
  stock_resultante: number | null;
  usuario_id: number | null;
  observacion: string | null;
  created_at: string;
};

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };
