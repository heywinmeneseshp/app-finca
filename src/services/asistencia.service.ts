import * as Crypto from 'expo-crypto';
import { asistenciaApi } from '@/api/asistencia.api';
import type { FincaAsistencia, MarcacionPayload, ResultadoMarcacion, TipoMarcacion } from '@/api/asistencia.api';
import { getDb, kvGet, kvSet } from '@/services/db';

const FINCAS_KEY = 'asistencia.fincas';
const LOTE_SYNC = 100;

// Fincas del usuario: se piden al servidor y se guardan para poder marcar sin conexión.
export const cargarFincas = async (): Promise<FincaAsistencia[]> => {
  try {
    const { fincas } = await asistenciaApi.rostrosEstado();
    await kvSet(FINCAS_KEY, JSON.stringify(fincas));
    return fincas;
  } catch {
    const raw = await kvGet(FINCAS_KEY);
    return raw ? (JSON.parse(raw) as FincaAsistencia[]) : [];
  }
};

export interface NuevaMarcacion {
  fincaUuid: string;
  tipo: TipoMarcacion;
  lat: number | null;
  lng: number | null;
  descriptor: number[];
}

/** Guarda la marcación en la cola local (solo números: vector, tipo, hora y GPS; nunca una foto). */
export const encolarMarcacion = async (nueva: NuevaMarcacion): Promise<string> => {
  const ahora = new Date();
  const payload: MarcacionPayload = { uuid: Crypto.randomUUID(), ...nueva, fechaHora: ahora.toISOString() };
  const db = await getDb();
  await db.runAsync('INSERT INTO asistencia_cola (uuid, payload, created_at) VALUES (?, ?, ?)', payload.uuid, JSON.stringify(payload), ahora.getTime());
  return payload.uuid;
};

export const resumenPendientes = async () => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number; conError: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END), 0) AS conError FROM asistencia_cola',
  );
  return { total: row?.total ?? 0, conError: row?.conError ?? 0 };
};

/** Descarta las marcaciones que el servidor rechazó (no reconocidas, ambiguas o con error). */
export const descartarConError = async () => {
  const db = await getDb();
  await db.runAsync('DELETE FROM asistencia_cola WHERE error IS NOT NULL');
};

/**
 * Envía la cola al servidor. CREADA/DUPLICADA se borran de la cola; NO_RECONOCIDA/AMBIGUA/ERROR quedan marcadas con su
 * mensaje (reintentar no las arregla: hay que volver a marcar). Si no hay red, se detiene sin perder nada.
 * Devuelve el resultado por uuid para que la pantalla muestre a quién se reconoció.
 */
export const sincronizarCola = async (): Promise<Map<string, ResultadoMarcacion>> => {
  const db = await getDb();
  const resultados = new Map<string, ResultadoMarcacion>();

  while (true) {
    const filas = await db.getAllAsync<{ uuid: string; payload: string }>(
      'SELECT uuid, payload FROM asistencia_cola WHERE error IS NULL ORDER BY created_at ASC LIMIT ?',
      LOTE_SYNC,
    );
    if (filas.length === 0) break;

    const respuesta = await asistenciaApi.marcar(filas.map((f) => JSON.parse(f.payload) as MarcacionPayload));
    for (const r of respuesta.resultados) {
      resultados.set(r.uuid, r);
      if (r.estado === 'CREADA' || r.estado === 'DUPLICADA') {
        await db.runAsync('DELETE FROM asistencia_cola WHERE uuid = ?', r.uuid);
      } else {
        const mensaje =
          r.estado === 'NO_RECONOCIDA' ? 'No se reconoció el rostro' : r.estado === 'AMBIGUA' ? 'Rostro ambiguo (parecido a otra persona)' : r.mensaje ?? 'Error';
        await db.runAsync('UPDATE asistencia_cola SET error = ? WHERE uuid = ?', mensaje, r.uuid);
      }
    }
  }
  return resultados;
};
