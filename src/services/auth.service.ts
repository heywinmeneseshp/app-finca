import { authApi } from '@/api/auth.api';
import { getDb, kvDelete, kvGet, kvSet } from '@/services/db';
import { tokenStorage } from '@/services/tokenStorage';
import type { AuthUser } from '@/types/auth';

const CURRENT_USER_KEY = 'currentUser';
const OPCIONES_KEY = 'precal.opciones';

export const authService = {
  async login(usuario: string, password: string): Promise<AuthUser> {
    const { accessToken, refreshToken, user } = await authApi.login(usuario, password);
    await tokenStorage.setTokens(accessToken, refreshToken);
    await kvSet(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  async logout(): Promise<void> {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Sin conexión o token ya vencido: igual se limpia la sesión local.
      }
    }
    await tokenStorage.clearTokens();
    await kvDelete(CURRENT_USER_KEY);
    // Las fincas/lotes dependen del usuario (restricción por finca): se borran para no mostrarlas a otra persona.
    // La cola de registros pendientes NO se toca: son datos de trabajo que aún no se han enviado.
    await kvDelete(OPCIONES_KEY);
    await getDb();
  },

  /** Lee la sesión guardada sin requerir red — tolera arrancar sin conexión. */
  async bootstrapSession(): Promise<AuthUser | null> {
    const accessToken = await tokenStorage.getAccessToken();
    if (!accessToken) return null;
    const raw = await kvGet(CURRENT_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },

  /** Intenta refrescar el perfil/permisos en segundo plano; ignora fallos offline. */
  async refreshProfileInBackground(): Promise<AuthUser | null> {
    try {
      const user = await authApi.me();
      await kvSet(CURRENT_USER_KEY, JSON.stringify(user));
      return user;
    } catch {
      return null;
    }
  },
};

export default authService;
