import { apiRequest } from '@/api/client';

export interface OpcionFinca {
  id: string;
  codigo: string;
  nombre: string;
}

export interface OpcionLote {
  id: string;
  nombre: string;
  fincaId: string;
}

export interface OpcionValor {
  id: string;
  codigo: string;
  nombre: string;
}

/** Cinta de la semana: el color y la edad salen de la semana de embolse. */
export interface OpcionCinta {
  id: string;
  edad: number;
  nombre: string;
  color: string;
  embolse: string;
  embolseCodigo: string;
  semanaEmbolseUuid: string | null;
}

export interface OpcionesPrecalibracion {
  fincas: OpcionFinca[];
  lotes: OpcionLote[];
  valores: OpcionValor[];
  cintas: OpcionCinta[];
  /** Configuración efectiva por finca (edades y calibres habilitados): se configura en la web, pestaña Configuración. */
  configPorFinca?: Record<string, { edades: number[]; valores: string[]; segundosEspera?: number; modalidad?: ModalidadPrecalibracion }>;
  semanaActualId: string | null;
}

/** Modalidad de la sesión: VIGENTE = se precalibra la semana del corte; ANTICIPADA = una semana antes del corte. */
export type ModalidadPrecalibracion = 'VIGENTE' | 'ANTICIPADA';

export interface SesionPrecalibracion {
  uuid: string;
  tipo: ModalidadPrecalibracion;
  /** Hora de inicio de la sesión (ISO). */
  inicio: string;
}

export interface RegistroPrecalibracion {
  uuid: string;
  fincaUuid: string;
  loteUuid: string;
  semanaEmbolseUuid: string;
  valor: string;
  fechaHora: string;
  /** Fecha local del dispositivo (YYYY-MM-DD). */
  fecha: string;
  lat: number | null;
  lng: number | null;
  /** Sesión a la que pertenece el racimo (el servidor la crea la primera vez que llega). */
  sesion?: SesionPrecalibracion;
}

export interface ResultadoRegistro {
  uuid: string;
  estado: 'CREADO' | 'DUPLICADO' | 'ERROR';
  mensaje?: string;
}

export interface RespuestaRegistrar {
  total: number;
  creados: number;
  duplicados: number;
  errores: number;
  resultados: ResultadoRegistro[];
}

export const precalibracionApi = {
  opciones: () => apiRequest<OpcionesPrecalibracion>('/precalibracion/opciones'),

  registrar: (registros: RegistroPrecalibracion[]) =>
    apiRequest<RespuestaRegistrar>('/precalibracion/registros', { method: 'POST', body: { registros } }),

  enviarTraza: (uuid: string, puntos: { lat: number; lng: number; t: string; precision?: number | null }[]) =>
    apiRequest<{ recibidos: number }>(`/precalibracion/sesiones/${uuid}/traza`, { method: 'POST', body: { puntos } }),

  cerrarSesion: (uuid: string, fin: string) =>
    apiRequest<{ uuid: string }>(`/precalibracion/sesiones/${uuid}/cerrar`, { method: 'POST', body: { fin } }),
};

export default precalibracionApi;
