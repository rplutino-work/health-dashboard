import type { ProjectResources } from '@/lib/types'

/**
 * Qué infraestructura tiene cada proyecto, para poder atribuirle su consumo.
 *
 * Va aparte de projects.ts a propósito: ese archivo dice QUÉ CHEQUEAR (URLs y
 * paths) y este dice QUÉ SE PAGA. Cambian por motivos distintos y en momentos
 * distintos — una migración de base toca este archivo y no el otro.
 *
 * Los ids son los que devuelve la API de cada proveedor. Un proyecto sin entrada
 * acá igual se chequea; simplemente no se le atribuye consumo, y su gasto
 * aparece en el dashboard bajo el id crudo del proveedor en vez de perderse.
 *
 * Actualizado tras la migración del 27/08/2026:
 *   - simuladorvr salió de Neon y vive en Supabase (schema `simuladorvr`)
 *   - plasdeko y frutos-secos-dg salieron de Neon y viven en Railway
 * Los proyectos de Neon que quedaron vacíos siguen mapeados a propósito: su
 * histórico de consumo es la prueba de que la migración sirvió.
 */
export const RESOURCES: Record<string, ProjectResources> = {
  meller: { neon: 'crimson-firefly-30480596', vercel: 'meller' },
  'barbershop-brothers': { neon: 'wild-mountain-93707754', vercel: 'barbershop-brothers' },
  'compactfit-membresias': {
    neon: 'withered-fire-54414959',
    vercel: 'compactfit-membresias',
  },
  'rok-studio': { neon: 'soft-sun-83209161', vercel: 'rok-studio' },
  simuladorvr: {
    // Migrado a Supabase el 27/08/2026; el proyecto de Neon quedó vacío.
    neon: 'lively-sunset-04016622',
    supabase: 'kucydhmobdcaihnpogqt/simuladorvr',
    vercel: 'simuladorvr',
  },
  'argentum-web': { neon: 'purple-band-68109684', vercel: 'argentum-web' },
  'sitioweb-rodrigoplutino': {
    neon: 'cool-leaf-86776242',
    vercel: 'sitioweb-rodrigoplutino',
  },
  'frutos-secos-dg': {
    // Migrado a Railway el 27/08/2026 (servicio creative-stillness).
    neon: 'lingering-sound-62525043',
    railway: '7cdf16eb-572d-421b-a5cb-a8d32aa8f687',
    vercel: 'frutos-secos-dg',
  },
  'ecommerce-kit': { neon: 'muddy-silence-59839518', vercel: 'ecommerce-kit' },
  'powerseries-club': { neon: 'jolly-union-61600763', vercel: 'powerseries-club' },
  // Base de musica: 213k canciones, 125k tags, 7k resenas. Aparecia como
  // "consumo sin asignar" hasta que se rastreo que pleyade la usa.
  pleyade: { neon: 'tiny-fog-60155655', vercel: 'pleyade' },
  'frutos-secos-dg-admin': { vercel: 'frutos-secos-dg-admin' },
  'rok-admin': { neon: 'plain-bread-34489395', vercel: 'rok-admin' },
  // plasdeko: la base salió de Neon a Railway el 27/08/2026. Falta el service id
  // de plasdeko-backend para atribuirle el consumo de Railway.
  'plasdeko-admin': { neon: 'divine-recipe-33614761', vercel: 'plasdeko-admin' },
  'plasdeko-checkout': { vercel: 'plasdeko-checkout' },
  'plasdeko-dashboard': { vercel: 'plasdeko-dashboard' },
  'admin-vite': { vercel: 'admin' },
  'rodri-panel': { neon: 'cold-violet-75962749', vercel: 'rodri-panel' },
  storefront: { vercel: 'storefront' },
  'dashboard-medusa': { vercel: 'dashboard' },
}

/** Schemas de Supabase que le pertenecen a un proyecto puntual. */
export const SUPABASE_SCHEMA_OWNER: Record<string, string> = {
  simuladorvr: 'simuladorvr',
  public: 'health-dashboard',
}
