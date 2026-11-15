import * as Crypto from 'expo-crypto';
import { asistenciaApi } from '@/api/asistencia.api';
import type { FincaAsistencia, MarcacionPayload, ResultadoMarcacion, TipoMarcacion } from '@/api/asistencia.api';
import { getDb, kvGet, kvSet } from '@/services/db';
import { guardarRostro } from '@/services/rostrosLocales';

const FINCAS_KEY = 'asistencia.fincas'; // versiones anteriores: solo fincas
const UBICACIONES_KEY = 'asistencia.ubicaciones';
const LOTE_SYNC = 100;

/** Finca u otro lugar (oficina, planta...) donde se marca. `clave`: "f:<uuid>" para fincas, "l:<uuid>" para lugares. */
export interface UbicacionAsistencia {
  clave: string;
  uuid: string;
  nombre: string;
  tipo: string; // FINCA | OFICINA | PLANTA | BODEGA | OTRO
}

const deFincas = (fincas: FincaAsistencia[]): UbicacionAsistencia[] => fincas.map((f) => ({ clave: `f:${f.uuid}`, uuid: f.uuid, nombre: f.nombre, tipo: 'FINCA' }));

const leerUbicacionesGuardadas = async (): Promise<UbicacionAsistencia[]> => {
  const raw = await kvGet(UBICACIONES_KEY);
  if (raw) return JSON.parse(raw) as UbicacionAsistencia[];
  const viejas = await kvGet(FINCAS_KEY);
  return viejas ? deFincas(JSON.parse(viejas) as FincaAsistencia[]) : [];
};

/** Pide fincas y lugares al servidor y los guarda para poder marcar sin conexión. Lanza error si no hay red. */
const traerUbicaciones = async (): Promise<UbicacionAsistencia[]> => {
  const { fincas, lugares = [] } = await asistenciaApi.rostrosEstado();
  const lista = [...deFincas(fincas), ...lugares.map((l) => ({ clave: `l:${l.uuid}`, uuid: l.uuid, nombre: l.nombre, tipo: l.tipo }))];
  await kvSet(UBICACIONES_KEY, JSON.stringify(lista));
  return lista;
};

/** Descarga la lista de sitios sin molestar si no hay conexión (al iniciar sesión y al abrir la app). */
export const precargarUbicaciones = async (): Promise<void> => {
  try {
    await traerUbicaciones();
  } catch {
    // sin conexión: se usa lo ya guardado
  }
};

/**
 * Fincas del usuario y lugares de asistencia. Devuelve primero lo guardado en el celular (sin esperar a la red) y lo refresca en segundo
 * plano con `alActualizar`. Sin nada guardado, intenta la red (con tiempo límite); si falla devuelve una lista vacía.
 */
export const cargarUbicaciones = async (alActualizar?: (lista: UbicacionAsistencia[]) => void): Promise<UbicacionAsistencia[]> => {
  const guardadas = await leerUbicacionesGuardadas();
  if (guardadas.length > 0) {
    traerUbicaciones().then((nuevas) => alActualizar?.(nuevas)).catch(() => undefined);
    return guardadas;
  }
  try {
    return await traerUbicaciones();
  } catch {
    return [];
  }
};

/** "f:<uuid>" / "l:<uuid>" → campos de la marcación. */
export const destinoDe = (clave: string): { fincaUuid?: string; lugarUuid?: string } =>
  clave.startsWith('l:') ? { lugarUuid: clave.slice(2) } : { fincaUuid: clave.startsWith('f:') ? clave.slice(2) : clave };

export interface NuevaMarcacion {
  fincaUuid?: string;
  lugarUuid?: string;
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

/** Salida sin entrada previa que la persona confirmó: se reenvía con la confirmación. */
export const confirmarSalidaSinEntrada = async (uuid: string) => {
  const db = await getDb();
  const fila = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM asistencia_cola WHERE uuid = ?', uuid);
  if (!fila) return;
  const payload: MarcacionPayload = { ...(JSON.parse(fila.payload) as MarcacionPayload), confirmarSinEntrada: true };
  await db.runAsync('UPDATE asistencia_cola SET payload = ?, error = NULL WHERE uuid = ?', JSON.stringify(payload), uuid);
};

/** Quita una marcación de la cola (p. ej. una salida sin entrada que la persona no confirmó). */
export const descartarMarcacion = async (uuid: string) => {
  const db = await getDb();
  await db.runAsync('DELETE FROM asistencia_cola WHERE uuid = ?', uuid);
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
        // Ya marcó en este celular: se guarda su rostro (cifrado) para reconocerlo la próxima vez sin internet.
        if (r.colaborador?.uuid) void guardarRostro(r.colaborador.uuid);
      } else {
        const mensaje =
          r.estado === 'NO_RECONOCIDA'
            ? 'No se reconoció el rostro'
            : r.estado === 'AMBIGUA'
              ? 'Rostro ambiguo (parecido a otra persona)'
              : r.estado === 'SIN_ENTRADA_PREVIA'
                ? 'Salida sin entrada previa (no confirmada)'
                : r.mensaje ?? 'Error';
        await db.runAsync('UPDATE asistencia_cola SET error = ? WHERE uuid = ?', mensaje, r.uuid);
      }
    }
  }
  return resultados;
};
