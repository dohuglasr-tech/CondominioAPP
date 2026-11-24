/**
 * Utilidad de paginación completa para consultas Supabase PostgREST.
 * Evita el truncamiento silencioso en 1,000 registros cuando crece el historial.
 */
export async function fetchAllSupabasePages<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize: number = 1000,
  maxPages: number = 50
): Promise<{ data: T[]; error: any }> {
  const allRows: T[] = []
  let from = 0

  for (let page = 0; page < maxPages; page++) {
    const to = from + pageSize - 1
    const { data, error } = await buildQuery(from, to)

    if (error) {
      return { data: allRows, error }
    }

    const batch = Array.isArray(data) ? data : []
    allRows.push(...batch)

    if (batch.length < pageSize) {
      break
    }

    from += pageSize
  }

  return { data: allRows, error: null }
}
