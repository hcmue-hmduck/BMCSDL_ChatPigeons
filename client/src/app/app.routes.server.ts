import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'conversations/:convID',
    renderMode: RenderMode.Client,
  },
  {
    path: 'conversations',
    renderMode: RenderMode.Client,
  },
  {
    path: 'relationship',
    renderMode: RenderMode.Client,
  },
  {
    path: 'call-display',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
