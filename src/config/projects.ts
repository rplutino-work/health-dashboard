import { ProjectConfig } from '@/lib/types'

export const projects: ProjectConfig[] = [
  // ── Full-stack (Front + API+DB) ──────────────────────────────
  {
    slug: 'meller',
    name: 'MeleRoller',
    url: 'https://www.meleroller.com.ar',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
      { name: 'api+db', type: 'api', path: '/api/banners' },
    ],
  },
  {
    slug: 'barbershop-brothers',
    name: 'Barbershop Brothers',
    url: 'https://barbershop-brothers.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
      { name: 'api+db', type: 'api', path: '/api/services' },
    ],
  },
  {
    slug: 'compactfit-membresias',
    name: 'CompactFit Membresias',
    url: 'https://pilatesbasicsclub.com',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'rok-studio',
    name: 'ROK Studio',
    url: 'https://rok.com.ar',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'simuladorvr',
    name: 'Simulador VR',
    url: 'https://simuladorvr.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'estadodecaja',
    name: 'Estado de Caja',
    url: 'https://estadodecaja.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },

  // ── Frontends sin back propio ────────────────────────────────
  {
    slug: 'argentum-web',
    name: 'Argentum Web',
    url: 'https://argentum-web-five.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'sitioweb-rodrigoplutino',
    name: 'Portfolio Rodrigo',
    url: 'https://rodrigoplutino.com.ar',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'frutos-secos-dg',
    name: 'Frutos Secos DG',
    url: 'https://frutos-secos-dg.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'ecommerce-kit',
    name: 'Ecommerce Kit',
    url: 'https://ecommerce-kit-umber.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },

  // ── Admin panels (aceptan redirect a login) ──────────────────
  {
    slug: 'frutos-secos-dg-admin',
    name: 'Frutos Secos DG Admin',
    url: 'https://frutos-secos-dg-admin.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'rok-admin',
    name: 'ROK Admin',
    url: 'https://rok-admin.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'plasdeko-admin',
    name: 'Plasdeko Admin',
    url: 'https://plasdeko-admin.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'plasdeko-checkout',
    name: 'Plasdeko Checkout',
    url: 'https://plasdeko-checkout.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'plasdeko-dashboard',
    name: 'Plasdeko Dashboard',
    url: 'https://plasdeko-dashboard.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'admin-vite',
    name: 'Admin (Vite)',
    url: 'https://admin-beta-green.vercel.app',
    checks: [
      { name: 'front', type: 'admin', path: '/' },
    ],
  },
  {
    slug: 'rodri-panel',
    name: 'Rodri Panel',
    url: 'https://rodri-panel.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },

  // ── Known broken (ERROR en Vercel) ───────────────────────────
  {
    slug: 'storefront',
    name: 'Storefront',
    url: 'https://storefront-rodrigos-projects-8b995206.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
  {
    slug: 'dashboard-medusa',
    name: 'Dashboard Medusa',
    url: 'https://dashboard-rodrigos-projects-8b995206.vercel.app',
    checks: [
      { name: 'front', type: 'frontend', path: '/' },
    ],
  },
]

export const alertConfig = {
  emailTo: 'rodrigoivanplutino@gmail.com',
  cooldownMinutes: 60,
  degradedThresholdMs: 5000,
  timeoutMs: 15000,
}
