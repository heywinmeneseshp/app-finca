import { apiRequest } from '@/api/client';
import type { AuthUser, LoginResponse } from '@/types/auth';

export const authApi = {
  login: (usuario: string, password: string) =>
    apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: { usuario, password }, auth: false }),

  logout: (refreshToken: string) =>
    apiRequest<null>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),

  me: () => apiRequest<AuthUser>('/auth/me'),
};

export default authApi;
