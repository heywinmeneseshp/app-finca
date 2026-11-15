import { apiRequest } from '@/api/client';

export interface AppVersionInfo {
  latestVersion: string;
  minSupportedVersion: string;
  downloadUrl: string;
  releaseNotes: string;
}

export const appVersionApi = {
  // Sin auth: se consulta incluso antes de iniciar sesión. Versión propia de app-finca (?app=finca).
  get: () => apiRequest<AppVersionInfo>('/configuraciones/app-version?app=finca', { auth: false }),
};

export default appVersionApi;
