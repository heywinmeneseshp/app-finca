import { API_URL } from '@/constants/config';
import { tokenStorage } from '@/services/tokenStorage';
import type { ApiEnvelope } from '@/types/common';
import { ApiRequestError } from '@/types/common';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
}

// Registrado por el store de sesión al arrancar la app (evita un import circular con el estado de sesión).
let unauthorizedHandler: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandler = handler;
};

const buildUrl = (path: string, query?: RequestOptions['query']) => {
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

const rawFetch = async <T>(path: string, options: RequestOptions, accessToken: string | null) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Cliente propio (no "movil"): el backend SÍ aplica la restricción de fincas asignadas al usuario. El
    // User-Agent propio evita que el backend lo confunda con el cliente OkHttp por defecto de Android.
    'X-Client-App': 'finca',
    'User-Agent': 'CorbanaFinca/1.0',
  };
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const envelope = (await response.json()) as ApiEnvelope<T>;
  return { response, envelope };
};

type RefreshResult = { ok: true; accessToken: string } | { ok: false; reason: 'invalid' | 'network' };

// 'invalid' = el backend rechazó el refresh token (único caso que amerita cerrar sesión). 'network' = cualquier
// otra falla: la sesión local sigue intacta para no dejar al usuario sin poder abrir la app en el campo.
export const refreshAccessToken = async (): Promise<RefreshResult> => {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return { ok: false, reason: 'invalid' };

  let response: Response;
  let envelope: ApiEnvelope<{ accessToken: string; refreshToken: string }>;
  try {
    ({ response, envelope } = await rawFetch<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken }, auth: false },
      null,
    ));
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'invalid' };
  if (!response.ok || !envelope.success) return { ok: false, reason: 'network' };

  await tokenStorage.setTokens(envelope.data.accessToken, envelope.data.refreshToken);
  return { ok: true, accessToken: envelope.data.accessToken };
};

export const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const accessToken = options.auth === false ? null : await tokenStorage.getAccessToken();
  let { response, envelope } = await rawFetch<T>(path, options, accessToken);

  if (response.status === 401 && options.auth !== false) {
    const result = await refreshAccessToken();
    if (!result.ok) {
      if (result.reason === 'invalid') {
        await tokenStorage.clearTokens();
        unauthorizedHandler?.();
        throw new ApiRequestError(401, envelope.success ? 'No autenticado' : envelope.message);
      }
      throw new ApiRequestError(0, 'Sin conexión con el servidor');
    }
    ({ response, envelope } = await rawFetch<T>(path, options, result.accessToken));
  }

  if (!envelope.success) throw new ApiRequestError(response.status, envelope.message, envelope.errors);
  return envelope.data;
};

export default apiRequest;
