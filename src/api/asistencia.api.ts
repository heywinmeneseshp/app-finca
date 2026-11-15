import { apiRequest } from '@/api/client';

export interface FincaAsistencia {
  uuid: string;
  nombre: string;
}

export interface ColaboradorRostro {
  uuid: string;
  nombre: string;
  documento: string | null;
  /** Usuario vinculado (si tiene). */
  userUuid?: string | null;
  finca: FincaAsistencia | null;
  muestras: number;
  enrolado: boolean;
  consentimiento: boolean;
}

/** Oficina, planta, bodega u otro lugar (no finca) donde también se marca asistencia. */
export interface LugarAsistencia {
  uuid: string;
  nombre: string;
  tipo: 'OFICINA' | 'PLANTA' | 'BODEGA' | 'OTRO' | string;
}

export interface RostrosEstado {
  fincas: FincaAsistencia[];
  /** Solo en servidores con lugares de asistencia (versiones anteriores no lo envían). */
  lugares?: LugarAsistencia[];
  colaboradores: ColaboradorRostro[];
}

export interface UsuarioBasico {
  uuid: string;
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  cargo?: string | null;
}

/** Ficha de colaborador del usuario de la sesión (autoservicio). */
export interface MiFicha {
  uuid: string;
  nombre: string;
  apellido: string | null;
  documento: string | null;
  cargo: string | null;
  telefono?: string | null;
  finca: FincaAsistencia | null;
  /** Lugar predeterminado cuando es una oficina u otro lugar (si no, `finca`). */
  lugar?: LugarAsistencia | null;
  rostroMuestras: number;
  rostroEnrolado: boolean;
  rostroConsentimiento: boolean;
  solicitudRostro: { uuid: string; estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; nota: string | null; fecha: string; resueltoAt: string | null } | null;
}

export type TipoMarcacion = 'ENTRADA' | 'SALIDA';

export interface MarcacionPayload {
  uuid: string;
  /** Dónde se marcó: una finca o un lugar (uno de los dos). */
  fincaUuid?: string;
  lugarUuid?: string;
  tipo: TipoMarcacion;
  fechaHora: string;
  lat: number | null;
  lng: number | null;
  /** Vector facial (128 números). No es una foto. */
  descriptor: number[];
  /** Salida sin entrada previa: la persona confirmó que sí quiere registrarla. */
  confirmarSinEntrada?: boolean;
}

export interface Candidato {
  uuid: string;
  nombre: string;
  distancia: number;
}

export interface ResultadoMarcacion {
  uuid: string;
  estado: 'CREADA' | 'DUPLICADA' | 'NO_RECONOCIDA' | 'AMBIGUA' | 'SIN_ENTRADA_PREVIA' | 'ERROR';
  fueraDelPerimetro?: boolean;
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

  /** `reforzar`: agrega capturas sin aprobación. Si ya tiene rostro y no es refuerzo, queda como solicitud pendiente de aprobación. */
  enrolar: (colaboradorUuid: string, muestras: { pose: string; descriptor: number[] }[], consentimiento: boolean, reforzar = false) =>
    apiRequest<{ colaboradorUuid: string; muestras: number; solicitud?: { uuid: string; estado: 'PENDIENTE'; parecido: number } }>(`/asistencia/rostros/${colaboradorUuid}`, {
      method: 'PUT',
      body: { muestras, consentimiento, reforzar },
    }),

  /** Vectores faciales de un colaborador que este usuario ya marcó, para reconocerlo sin internet. */
  descriptoresRostro: (colaboradorUuid: string) =>
    apiRequest<{ colaborador: { uuid: string; nombre: string }; muestras: number[][]; umbral: number; margen: number; actualizado: string }>(
      `/asistencia/rostros/${colaboradorUuid}/descriptores`,
    ),

  marcar: (marcaciones: MarcacionPayload[]) =>
    apiRequest<RespuestaMarcaciones>('/asistencia/marcaciones', { method: 'POST', body: { marcaciones } }),

  listarUsuarios: () => apiRequest<{ items: UsuarioBasico[] }>('/users', { query: { limit: 100 } }),

  // Cargos activos (Maestros → Cargos): el cargo de un colaborador se elige de esta lista.
  listarCargos: () => apiRequest<{ uuid: string; nombre: string }[]>('/cargos', { query: { activos: true } }),

  crearColaborador: (datos: { nombre: string; apellido: string; documento: string; telefono: string; email: string; cargo: string; fincaUuid?: string; lugarUuid?: string; userUuid?: string }) =>
    apiRequest<{ uuid: string }>('/colaboradores', { method: 'POST', body: datos }),

  miFicha: () => apiRequest<MiFicha | null>('/colaboradores/mio'),

  crearMiFicha: (datos: { nombre: string | null; apellido: string | null; documento: string; telefono: string | null; cargo: string | null; fincaUuid?: string | null; lugarUuid?: string | null }) =>
    apiRequest<MiFicha>('/colaboradores/mio', { method: 'POST', body: datos }),

  /** Editar la ficha propia: teléfono, cargo y lugar predeterminado (nombre, apellido e identificación quedan protegidos). */
  actualizarMiFicha: (datos: { telefono: string | null; cargo: string | null; fincaUuid: string | null; lugarUuid: string | null }) =>
    apiRequest<MiFicha>('/colaboradores/mio', { method: 'PUT', body: datos }),

  probar: (descriptor: number[]) => apiRequest<ResultadoPrueba>('/asistencia/probar', { method: 'POST', body: { descriptor } }),
};

export default asistenciaApi;
