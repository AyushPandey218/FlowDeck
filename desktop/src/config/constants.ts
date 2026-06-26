export const APP_METADATA = {
  name: 'Flow Deck',
  version: '0.1.0-alpha',
  tagline: 'Control your Windows PC from your phone',
};

export const ROUTES = {
  DASHBOARD: 'dashboard',
  ACTIONS: 'actions',
  MONITOR: 'monitor',
  CLIPBOARD: 'clipboard',
  SETTINGS: 'settings',
  TRANSFERS: 'transfers',
} as const;

export type RouteType = typeof ROUTES[keyof typeof ROUTES];
