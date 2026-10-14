import { apiRequest } from '@/api/client';

export interface FincaAsistencia {
  uuid: string;
  nombre: string;
}

export interface ColaboradorRostro {
  uuid: string;
  nombre: string;
  documento: string | null;
  finca: FincaAsistencia | null;
  muestras: number;
  enrolado: boolean;
  consentimiento: boolean;
}

export interface RostrosEstado {
  fincas: FincaAsistencia[];
  colaboradores: ColaboradorRostro[];
}

export type TipoMarcacion = 'ENTRADA' | 'SALIDA';

export interface MarcacionPayload {
  uuid: string;
  fincaUuid: string;
  tipo: TipoMarcacion;
  fechaHora: string;
  lat: number | null;
  lng: number | null;
  /** Vector facial (128 números). No es una foto. */
  descriptor: number[];
}

export interface Candidato {
  uuid: string;
  nombre: string;
  distancia: number;
}

export interface ResultadoMarcacion {
  uuid: string;
  estado: 'CREADA' | 'DUPLICADA' | 'NO_RECONOCIDA' | 'AMBIGUA' | 'ERROR';
  mensaje?: string;
  colaborador?: { uuid: string; nombre: string };
  distancia?: number;
  mejor?: Candidato | null;
  segundo?: Candidato | null;
}

export interface RespuestaMarcaciones {
  total: number;
  creadas: number;
  duplicadas: number;
  noReconocidas: number;
  ambiguas: number;
  errores: number;
  resultados: ResultadoMarcacion[];
}

export interface ResultadoPrueba {
  estado: 'VERIFICADA' | 'NO_RECONOCIDA' | 'AMBIGUA' | 'SIN_ENROLADOS';
  umbral: number;
  margen?: number;
  mejor: Candidato | null;
  segundo: Candidato | null;
}

export const asistenciaApi = {
  rostrosEstado: (fincaUuid?: string) => apiRequest<RostrosEstado>('/asistencia/rostros-estado', { query: { fincaUuid } }),

  enrolar: (colaboradorUuid: string, muestras: { pose: string; descriptor: number[] }[], consentimiento: boolean) =>
    apiRequest<{ colaboradorUuid: string; muestras: number }>(`/asistencia/rostros/${colaboradorUuid}`, {
      method: 'PUT',
      body: { muestras, consentimiento },
    }),

  marcar: (marcaciones: MarcacionPayload[]) =>
    apiRequest<RespuestaMarcaciones>('/asistencia/marcaciones', { method: 'POST', body: { marcaciones } }),

  crearColaborador: (datos: { nombre: string; apellido: string; documento: string; telefono: string; email: string; cargo: string; fincaUuid: string }) =>
    apiRequest<{ uuid: string }>('/colaboradores', { method: 'POST', body: datos }),

  probar: (fincaUuid: string, descriptor: number[]) =>
    apiRequest<ResultadoPrueba>('/asistencia/probar', { method: 'POST', body: { fincaUuid, descriptor } }),
};

export default asistenciaApi;
