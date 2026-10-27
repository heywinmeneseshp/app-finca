import * as Crypto from 'expo-crypto';
import { precalibracionApi } from '@/api/precalibracion.api';
import type { OpcionesPrecalibracion, RegistroPrecalibracion, SesionPrecalibracion } from '@/api/precalibracion.api';
import { getDb, kvDelete, kvGet, kvSet } from '@/services/db';

const OPCIONES_KEY = 'precal.opciones';
const LOTE_SYNC = 200;
const CIERRES_KEY = 'precal.cierres'; // sesiones finalizadas cuyo cierre aún no llegó al servidor
const SESION_KEY = 'precal.sesion'; // sesión en curso (sobrevive si se cierra la app)

export interface PendientesResumen {
  total: number;
  conError: number;
}

// Catálogos (fincas, lotes, valores y cintas de la semana): se piden al servidor y se guardan para poder trabajar
// sin conexión. Si no hay red, se usa lo último guardado.
export const cargarOpciones = async (): Promise<{ opciones: OpcionesPrecalibracion | null; desdeCache: boolean }> => {
  try {
    const opciones = await precalibracionApi.opciones();
    await kvSet(OPCIONES_KEY, JSON.stringify(opciones));
    return { opciones, desdeCache: false };
  } catch {
    const raw = await kvGet(OPCIONES_KEY);
    return { opciones: raw ? (JSON.parse(raw) as OpcionesPrecalibracion) : null, desdeCache: true };
  }
};

// Fecha local del dispositivo (YYYY-MM-DD), sin pasar por UTC.
const fechaLocal = (d: Date) => {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

export interface NuevoRegistro {
  fincaUuid: string;
  loteUuid: string;
  semanaEmbolseUuid: string;
  valor: string;
  lat: number | null;
  lng: number | null;
  sesion?: SesionPrecalibracion;
}

/** Guarda UN racimo apto en la cola local (con hora y GPS) y devuelve su uuid. */
export const registrarRacimo = async (nuevo: NuevoRegistro): Promise<string> => {
  const ahora = new Date();
  const registro: RegistroPrecalibracion = {
    uuid: Crypto.randomUUID(),
    ...nuevo,
    fechaHora: ahora.toISOString(),
    fecha: fechaLocal(ahora),
  };
  const db = await getDb();
  await db.runAsync('INSERT INTO precal_cola (uuid, payload, created_at) VALUES (?, ?, ?)', registro.uuid, JSON.stringify(registro), ahora.getTime());
  return registro.uuid;
};

/** Quita un registro que todavía no se ha enviado (deshacer el último toque). */
export const deshacerRegistro = async (uuid: string): Promise<boolean> => {
  const db = await getDb();
  const res = await db.runAsync('DELETE FROM precal_cola WHERE uuid = ?', uuid);
  return res.changes > 0;
};

export interface SesionActiva {
  sesion: SesionPrecalibracion;
  fincaId: string;
  loteId: string;
  valor: string;
}

/** Sesión en curso guardada en el dispositivo (para retomarla si se cerró la app). */
export const cargarSesionActiva = async (): Promise<SesionActiva | null> => {
  const raw = await kvGet(SESION_KEY);
  return raw ? (JSON.parse(raw) as SesionActiva) : null;
};

export const guardarSesionActiva = (activa: SesionActiva) => kvSet(SESION_KEY, JSON.stringify(activa));

const MIN_SEG_TRAZA = 5;
const MIN_METROS_TRAZA = 5;
const ultimoPunto = new Map<string, { lat: number; lng: number; ms: number }>();

/** Guarda un punto del tracking de la sesión (como máximo uno cada ~5 s o ~5 m). Va a la base local; se envía al sincronizar. */
export const guardarPuntoTraza = async (sesionUuid: string, lat: number, lng: number, precision: number | null, momentoMs?: number): Promise<void> => {
  const ahora = momentoMs ?? Date.now();
  const ant = ultimoPunto.get(sesionUuid);
  if (ant) {
    const dLat = (lat - ant.lat) * 111320;
    const dLng = (lng - ant.lng) * 111320 * Math.cos((lat * Math.PI) / 180);
    const metros = Math.hypot(dLat, dLng);
    if (ahora - ant.ms < MIN_SEG_TRAZA * 1000 && metros < MIN_METROS_TRAZA) return;
  }
  ultimoPunto.set(sesionUuid, { lat, lng, ms: ahora });
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO precal_traza (sesion_uuid, lat, lng, precision_m, t) VALUES (?, ?, ?, ?, ?)',
    sesionUuid,
    lat,
    lng,
    precision,
    new Date(ahora).toISOString(),
  );
};

// Envía los puntos del tracking por lotes y los borra al confirmarse. Si la sesión no existe aún en el servidor, se reintenta luego.
const enviarTrazas = async (): Promise<void> => {
  const db = await getDb();
  const sesiones = await db.getAllAsync<{ sesion_uuid: string }>('SELECT DISTINCT sesion_uuid FROM precal_traza');
  for (const { sesion_uuid } of sesiones) {
    while (true) {
      const filas = await db.getAllAsync<{ id: number; lat: number; lng: number; precision_m: number | null; t: string }>(
        'SELECT id, lat, lng, precision_m, t FROM precal_traza WHERE sesion_uuid = ? ORDER BY id LIMIT 1000',
        sesion_uuid,
      );
      if (filas.length === 0) break;
      try {
        await precalibracionApi.enviarTraza(
          sesion_uuid,
          filas.map((f) => ({ lat: f.lat, lng: f.lng, t: f.t, precision: f.precision_m })),
        );
      } catch {
        break;
      }
      await db.runAsync(`DELETE FROM precal_traza WHERE id IN (${filas.map(() => '?').join(',')})`, ...filas.map((f) => f.id));
    }
  }
};

/** Finaliza la sesión: su cierre (hora de fin y potencial de cosecha) se envía cuando haya conexión y ya estén sus racimos. */
export const finalizarSesion = async (uuid: string): Promise<void> => {
  const raw = await kvGet(CIERRES_KEY);
  const cierres: { uuid: string; fin: string }[] = raw ? JSON.parse(raw) : [];
  cierres.push({ uuid, fin: new Date().toISOString() });
  await kvSet(CIERRES_KEY, JSON.stringify(cierres));
  await kvDelete(SESION_KEY);
};

// Envía los cierres pendientes. Un cierre se quita al enviarse, o si la sesión no existe en el servidor (no llegó ningún racimo).
const enviarCierres = async (): Promise<void> => {
  const raw = await kvGet(CIERRES_KEY);
  const cierres: { uuid: string; fin: string }[] = raw ? JSON.parse(raw) : [];
  const pendientes: { uuid: string; fin: string }[] = [];
  for (const c of cierres) {
    try {
      await precalibracionApi.cerrarSesion(c.uuid, c.fin);
    } catch (e) {
      if (!(e instanceof Error && /no encontrada/i.test(e.message))) pendientes.push(c);
    }
  }
  await kvSet(CIERRES_KEY, JSON.stringify(pendientes));
};

export const resumenPendientes = async (): Promise<PendientesResumen> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number; conError: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END), 0) AS conError FROM precal_cola',
  );
  return { total: row?.total ?? 0, conError: row?.conError ?? 0 };
};

export interface ResultadoSync {
  enviados: number;
  errores: number;
  restantes: number;
}

/**
 * Envía la cola al servidor por lotes. Los CREADOS y DUPLICADOS se borran de la cola (ya están en el servidor);
 * los que el servidor rechaza quedan con su mensaje de error para revisarlos. Si no hay red, se detiene sin perder nada.
 */
export const sincronizarCola = async (): Promise<ResultadoSync> => {
  const db = await getDb();
  let enviados = 0;
  let errores = 0;

  while (true) {
    const filas = await db.getAllAsync<{ uuid: string; payload: string }>(
      'SELECT uuid, payload FROM precal_cola WHERE error IS NULL ORDER BY created_at ASC LIMIT ?',
      LOTE_SYNC,
    );
    if (filas.length === 0) break;

    const respuesta = await precalibracionApi.registrar(filas.map((f) => JSON.parse(f.payload) as RegistroPrecalibracion));
    for (const r of respuesta.resultados) {
      if (r.estado === 'ERROR') {
        errores += 1;
        await db.runAsync('UPDATE precal_cola SET error = ? WHERE uuid = ?', r.mensaje ?? 'Error', r.uuid);
      } else {
        enviados += 1;
        await db.runAsync('DELETE FROM precal_cola WHERE uuid = ?', r.uuid);
      }
    }
  }

  // Con los racimos ya en el servidor (la sesión ya existe allá), se envía el tracking GPS y luego los cierres.
  await enviarTrazas();
  // Se envían los cierres de sesión pendientes.
  await enviarCierres();

  const { total } = await resumenPendientes();
  return { enviados, errores, restantes: total };
};
