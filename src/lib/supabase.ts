/**
 * Cliente de Supabase. Usa la SERVICE key, nunca la anonima: todo lo que lee
 * el dashboard es server-side.
 *
 * ⚠ Desde el 30/10/2026 Supabase dejo de dar acceso automatico al Data API a
 * las tablas nuevas del schema `public`. Como esto pasa por supabase-js —o
 * sea PostgREST— toda tabla que se cree de ahora en mas necesita su GRANT
 * explicito o devuelve "permission denied":
 *
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO service_role;
 *
 * Solo a service_role. Ni anon ni authenticated: estas tablas son metricas de
 * costos y nadie las consulta desde el navegador.
 */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
