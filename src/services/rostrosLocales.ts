import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import aesjs from 'aes-js';
import { asistenciaApi } from '@/api/asistencia.api';
import { getDb } from '@/services/db';

// Rostros en el celular para reconocer sin internet. Solo se guarda a quienes YA marcaron en este celular (los baja el servidor al
// confirmar una marcación), cifrados con AES-256 (llave aleatoria en el almacenamiento seguro del teléfono). Son vectores, no fotos.
// Se borran al cerrar sesión y caducan a los 30 días sin refrescarse.
const LLAVE_KEY = 'finca.rostrosLlave';
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;

let tablaLista: Promise<void> | null = null;
const asegurarTabla = () => {
  if (!tablaLista) {
    tablaLista = getDb().then((db) =>
      db.execAsync(`CREATE TABLE IF NOT EXISTS rostros_locales (
        colaborador_uuid TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        datos TEXT NOT NULL,
        umbral REAL NOT NULL,
        margen REAL NOT NULL,
        guardado_en INTEGER NOT NULL
      );`),
    );
  }
  return tablaLista;
};

const aHex = (b: Uint8Array) => aesjs.utils.hex.fromBytes(b);
const deHex = (h: string) => aesjs.utils.hex.toBytes(h);

const obtenerLlave = async (): Promise<Uint8Array> => {
  let hex = await SecureStore.getItemAsync(LLAVE_KEY);
  if (!hex) {
    hex = aHex(Crypto.getRandomBytes(32));
    await SecureStore.setItemAsync(LLAVE_KEY, hex);
  }
  return deHex(hex);
};

// AES-CTR con un contador inicial aleatorio por registro (se guarda junto al texto cifrado).
const cifrar = async (texto: string): Promise<string> => {
  const llave = await obtenerLlave();
  const inicio = Crypto.getRandomBytes(16);
  const ctr = new aesjs.ModeOfOperation.ctr(llave, new aesjs.Counter(Array.from(inicio)));
  return `${aHex(inicio)}:${aHex(ctr.encrypt(aesjs.utils.utf8.toBytes(texto)))}`;
};

const descifrar = async (guardado: string): Promise<string | null> => {
  try {
    const [inicio, datos] = guardado.split(':');
    const llave = await obtenerLlave();
    const ctr = new aesjs.ModeOfOperation.ctr(llave, new aesjs.Counter(Array.from(deHex(inicio))));
    return aesjs.utils.utf8.fromBytes(ctr.decrypt(deHex(datos)));
  } catch {
    return null;
  }
};

const distancia = (a: number[], b: number[]) => {
  let suma = 0;
  for (let i = 0; i < a.length; i += 1) suma += (a[i] - b[i]) ** 2;
  return Math.sqrt(suma);
};

export interface CoincidenciaLocal {
  colaboradorUuid: string;
  nombre: string;
  distancia: number;
}

/**
 * Misma regla que el servidor: la distancia de cada persona es la MÍNIMA entre sus vectores; se acepta al mejor si está dentro del umbral y
 * supera al segundo por el margen. Devuelve null si no hay coincidencia clara (o no hay rostros guardados).
 */
export const identificarLocal = async (descriptor: number[]): Promise<CoincidenciaLocal | null> => {
  await asegurarTabla();
  const db = await getDb();
  const filas = await db.getAllAsync<{ colaborador_uuid: string; nombre: string; datos: string; umbral: number; margen: number; guardado_en: number }>(
    'SELECT * FROM rostros_locales WHERE guardado_en > ?',
    Date.now() - VIGENCIA_MS,
  );
  const ranking: { uuid: string; nombre: string; distancia: number; umbral: number; margen: number }[] = [];
  for (const f of filas) {
    const texto = await descifrar(f.datos);
    if (!texto) continue;
    const muestras = JSON.parse(texto) as number[][];
    if (!muestras.length) continue;
    ranking.push({ uuid: f.colaborador_uuid, nombre: f.nombre, distancia: Math.min(...muestras.map((m) => distancia(descriptor, m))), umbral: f.umbral, margen: f.margen });
  }
  ranking.sort((a, b) => a.distancia - b.distancia);
  const mejor = ranking[0];
  if (!mejor || mejor.distancia > mejor.umbral) return null;
  if (ranking[1] && ranking[1].distancia - mejor.distancia < mejor.margen) return null;
  return { colaboradorUuid: mejor.uuid, nombre: mejor.nombre, distancia: mejor.distancia };
};

/** Baja y guarda cifrados los vectores de un colaborador ya marcado en este celular. No falla si no hay conexión. */
export const guardarRostro = async (colaboradorUuid: string): Promise<void> => {
  try {
    await asegurarTabla();
    const db = await getDb();
    const existente = await db.getFirstAsync<{ guardado_en: number }>('SELECT guardado_en FROM rostros_locales WHERE colaborador_uuid = ?', colaboradorUuid);
    // Una copia reciente (menos de 15 días) no se vuelve a bajar; pasado ese tiempo se refresca por si se volvió a registrar el rostro.
    if (existente && Date.now() - existente.guardado_en < VIGENCIA_MS / 2) return;
    const r = await asistenciaApi.descriptoresRostro(colaboradorUuid);
    const datos = await cifrar(JSON.stringify(r.muestras));
    await db.runAsync(
      'INSERT OR REPLACE INTO rostros_locales (colaborador_uuid, nombre, datos, umbral, margen, guardado_en) VALUES (?, ?, ?, ?, ?, ?)',
      colaboradorUuid,
      r.colaborador.nombre,
      datos,
      r.umbral,
      r.margen,
      Date.now(),
    );
  } catch {
    // Sin conexión o sin permiso: simplemente no queda guardado.
  }
};

/** Borra las copias de más de 30 días. */
export const limpiarRostrosVencidos = async (): Promise<void> => {
  try {
    await asegurarTabla();
    const db = await getDb();
    await db.runAsync('DELETE FROM rostros_locales WHERE guardado_en <= ?', Date.now() - VIGENCIA_MS);
  } catch {
    // nada
  }
};

/** Cierre de sesión: no queda ningún rostro ni la llave en el celular. */
export const borrarRostrosLocales = async (): Promise<void> => {
  try {
    await asegurarTabla();
    const db = await getDb();
    await db.runAsync('DELETE FROM rostros_locales');
    await SecureStore.deleteItemAsync(LLAVE_KEY);
  } catch {
    // nada
  }
};
