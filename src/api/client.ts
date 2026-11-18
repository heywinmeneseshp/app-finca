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

const TIEMPO_LIMITE_MS = 8000;

const rawFetch = async <T>(path: string, options: RequestOptions, accessToken: string | null) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Cliente propio (no "movil"): el backend SÍ aplica la restricción de fincas asignadas al usuario. El
    // User-Agent propio evita que el backend lo confunda con el cliente OkHttp por defecto de Android.
    'X-Client-App': 'finca',
    'User-Agent': 'CorbanaFinca/1.0',
  };
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Con señal débil o nula una petición puede quedar colgada: se corta a los 8 s y se trata como falla de red.
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);
  try {
    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controlador.signal,
    });
    const envelope = (await response.json()) as ApiEnvelope<T>;
    return { response, envelope };
  } finally {
    clearTimeout(corte);
  }
};

type RefreshResult = { ok: true; accessToken: string } | { ok: false; reason: 'invalid' | 'network' };

// 'invalid' = el backend rechazó el refresh token (único caso que amerita cerrar sesión). 'network' = cualquier
// otra falla: la sesión local sigue intacta para no dejar al usuario sin poder abrir la app en el campo.
const renovarToken = async (): Promise<RefreshResult> => {
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

  if (response.status === 401 || response.status === 403) {
    const actual = await tokenStorage.getRefreshToken();
    const accessActual = await tokenStorage.getAccessToken();
    if (actual && actual !== refreshToken && accessActual) return { ok: true, accessToken: accessActual };
    return { ok: false, reason: 'invalid' };
  }
  if (!response.ok || !envelope.success) return { ok: false, reason: 'network' };

  await tokenStorage.setTokens(envelope.data.accessToken, envelope.data.refreshToken);
  return { ok: true, accessToken: envelope.data.accessToken };
};

// El backend rota el refresh token: cada uno sirve UNA sola vez. Si dos peticiones (perfil, sincronización, traza en segundo plano...) reciben 401 a la
// vez y cada una pide su refresh con el mismo token, la segunda llega con un token ya usado, el backend la rechaza y la app cerraba la sesión sola.
// Por eso: (1) una sola renovación a la vez, que todas las peticiones comparten, y (2) si el backend rechaza el token pero el guardado ya cambió
// (otra renovación se adelantó), se usa el nuevo en vez de cerrar la sesión.
let renovando: Promise<RefreshResult> | null = null;

export const refreshAccessToken = (): Promise<RefreshResult> => {
  if (!renovando) {
    renovando = renovarToken().finally(() => {
      renovando = null;
    });
  }
  return renovando;
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
