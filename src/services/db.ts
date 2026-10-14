import * as SQLite from 'expo-sqlite';

// Base local (offline-first): clave/valor para la sesión y los catálogos, y la cola de registros de precalibración
// pendientes de enviar al servidor.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('finca.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS precal_cola (
          uuid TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS asistencia_cola (
          uuid TEXT PRIMARY KEY NOT NULL,
          payload TEXT NOT NULL,
          error TEXT,
          created_at INTEGER NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
};

export const kvGet = async (key: string): Promise<string | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? row.value : null;
};

export const kvSet = async (key: string, value: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
};

export const kvDelete = async (key: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
};
