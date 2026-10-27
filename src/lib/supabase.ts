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
 *
 * El GRANT no alcanza: la tabla nueva tambien necesita RLS, o queda legible y
 * escribible por cualquiera que tenga la anon key. Son dos lineas, no una:
 *
 *   ALTER TABLE public.<tabla> ENABLE ROW LEVEL SECURITY;
 *
 * Sin politicas. Esto no afecta al dashboard porque service_role tiene
 * `bypassrls`. Lo mismo con las funciones nuevas: Postgres les da EXECUTE a
 * PUBLIC por defecto, asi que hay que revocarlo. Ver `sql/001_rls_lockdown.sql`.
 */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
