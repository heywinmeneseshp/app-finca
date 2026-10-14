export interface AuthUser {
  id: number;
  uuid: string;
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  estado: boolean;
  roles: string[];
  permissions: string[];
  /** Ids de fincas asignadas, o null si el usuario no tiene restricción (ve todas). */
  fincaIds: number[] | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
