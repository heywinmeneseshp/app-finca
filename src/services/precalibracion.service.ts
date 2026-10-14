import * as Crypto from 'expo-crypto';
import { precalibracionApi } from '@/api/precalibracion.api';
import type { OpcionesPrecalibracion, RegistroPrecalibracion } from '@/api/precalibracion.api';
import { getDb, kvGet, kvSet } from '@/services/db';

const OPCIONES_KEY = 'precal.opciones';
const LOTE_SYNC = 200;

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

  const { total } = await resumenPendientes();
  return { enviados, errores, restantes: total };
};
