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
  configPorFinca?: Record<string, { edades: number[]; valores: string[] }>;
  semanaActualId: string | null;
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
};

export default precalibracionApi;
