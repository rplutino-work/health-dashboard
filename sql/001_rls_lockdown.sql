-- Cierra el acceso anónimo al Data API. Correr entero, es idempotente.
--
-- El aviso de seguridad de Supabase (rls_disabled_in_public, 25/10/2026) es
-- real: estas tablas viven en el schema `public`, que está expuesto por
-- PostgREST, y sin RLS "son legibles y escribibles por cualquier rol que tenga
-- un grant". Las diez se crearon antes del cambio del 30/10/2026, así que
-- recibieron el grant automático a `anon` y `authenticated`.
--
-- No rompe el dashboard: entra siempre con la SERVICE key, y `service_role`
-- tiene el atributo `bypassrls`. El bypass sólo se pierde si la request lleva
-- el token de un usuario logueado, y acá no hay login: el cliente de
-- `src/lib/supabase.ts` nunca llama a signIn.
--
-- Se hacen las dos cosas a propósito. RLS sin políticas deja las lecturas en
-- cero y rechaza las escrituras; revocar el grant además las corta antes, con
-- un "permission denied" en vez de una respuesta vacía que parece un dato real.

alter table public.alert_log         enable row level security;
alter table public.billing_history   enable row level security;
alter table public.fx_rates          enable row level security;
alter table public.health_checks     enable row level security;
alter table public.health_daily      enable row level security;
alter table public.health_runs       enable row level security;
alter table public.provider_billing  enable row level security;
alter table public.provider_charges  enable row level security;
alter table public.provider_invoices enable row level security;
alter table public.provider_usage    enable row level security;

-- Ninguna política, a propósito: nadie consulta esto desde el navegador. Son
-- métricas de costos y el único lector es el server del dashboard.

revoke all on public.alert_log         from anon, authenticated;
revoke all on public.billing_history   from anon, authenticated;
revoke all on public.fx_rates          from anon, authenticated;
revoke all on public.health_checks     from anon, authenticated;
revoke all on public.health_daily      from anon, authenticated;
revoke all on public.health_runs       from anon, authenticated;
revoke all on public.provider_billing  from anon, authenticated;
revoke all on public.provider_charges  from anon, authenticated;
revoke all on public.provider_invoices from anon, authenticated;
revoke all on public.provider_usage    from anon, authenticated;

-- Las funciones son el agujero que el linter de Supabase no marca, y es el peor
-- de los dos: en Postgres el EXECUTE de una función nueva se otorga a PUBLIC
-- por defecto. `purge_old_checks` borra todo lo anterior a N días, así que con
-- la anon key y un `keep_days` de 0 se vacía el historial entero. Si además
-- fuera SECURITY DEFINER, el RLS de arriba ni la frenaría.

revoke all on function public.purge_old_checks(integer)  from anon, authenticated, public;
revoke all on function public.rollup_health_daily(date)  from anon, authenticated, public;

grant execute on function public.purge_old_checks(integer) to service_role;
grant execute on function public.rollup_health_daily(date) to service_role;

-- Verificación. Las diez tablas tienen que salir con rls = true y sin grants
-- para anon/authenticated.
--
--   select c.relname, c.relrowsecurity as rls,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public' and p.tablename = c.relname) as politicas
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r'
--    order by 1;
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon','authenticated');
