/**
 * Procesa una lista con varias tareas a la vez (como máximo `limite` juntas) y devuelve
 * los resultados en el mismo orden. Para guardar muchos productos sin esperar uno por uno.
 */
export async function enParalelo<T, R>(items: T[], limite: number, tarea: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await tarea(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}
