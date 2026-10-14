import { create } from 'zustand';
import { authService } from '@/services/auth.service';
import type { AuthUser } from '@/types/auth';

interface SessionState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'ready';
  hasPermission: (code: string) => boolean;
  bootstrap: () => Promise<void>;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearLocalSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  status: 'idle',

  // El rol Administrador tiene todos los permisos (igual que en el backend).
  hasPermission: (code) => {
    const user = get().user;
    if (!user) return false;
    return user.roles.includes('Administrador') || user.permissions.includes(code);
  },

  bootstrap: async () => {
    set({ status: 'loading' });
    const user = await authService.bootstrapSession();
    set({ user, status: 'ready' });
    if (user) {
      authService.refreshProfileInBackground().then((refreshed) => {
        if (refreshed) set({ user: refreshed });
      });
    }
  },

  login: async (usuario, password) => {
    const user = await authService.login(usuario, password);
    set({ user, status: 'ready' });
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, status: 'ready' });
  },

  /** Limpia la sesión en memoria sin llamar a la API (cuando el refresh token ya expiró). */
  clearLocalSession: () => set({ user: null, status: 'ready' }),
}));

export default useSessionStore;
