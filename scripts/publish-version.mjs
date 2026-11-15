#!/usr/bin/env node
// Automatiza el paso manual de "entrar al panel admin y actualizar la
// versión": lee la versión de app.json y la publica contra
// PUT /configuraciones/app-version?app=finca, para correr justo después de `eas build`.
//
// Uso:
//   node scripts/publish-version.mjs --downloadUrl="https://expo.dev/artifacts/eas/xxxx.apk" [--notes="..."] [--force]
//
// Variables de entorno requeridas:
//   API_URL                 (ej: https://corbana-api.vercel.app/api/v1)
//   APP_VERSION_DEPLOY_KEY  (clave dedicada — no es tu usuario/contraseña,
//                            se configura en el backend con la misma
//                            variable de entorno; ver src/config/env.config.js)
//
// --force sube también minSupportedVersion a la versión actual (bloquea a
// todos los que no actualicen). Sin --force, solo avisa (no bloquea) y deja
// minSupportedVersion como estaba.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Reusa la misma variable que ya usa la app (EXPO_PUBLIC_API_URL, ver
  // .env) si no se pasó API_URL aparte — evita tener que configurar dos
  // variables distintas para la misma URL.
  const apiUrl = process.env.API_URL || process.env.EXPO_PUBLIC_API_URL;
  const deployKey = process.env.APP_VERSION_DEPLOY_KEY;

  if (!apiUrl || !deployKey) {
    console.error('Faltan variables de entorno: API_URL (o EXPO_PUBLIC_API_URL), APP_VERSION_DEPLOY_KEY');
    process.exit(1);
  }
  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    console.warn(`⚠ API_URL apunta a ${apiUrl} — si quieres publicar contra producción, exporta la URL real.`);
  }
  if (!args.downloadUrl) {
    console.error('Falta --downloadUrl="<link del APK>"');
    process.exit(1);
  }

  const appJson = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'));
  const version = appJson.expo.version;
  console.log(`Versión detectada en app.json: ${version}`);

  console.log('Consultando configuración actual...');
  const currentRes = await fetch(`${apiUrl}/configuraciones/app-version?app=finca`);
  const currentBody = await currentRes.json();
  const current = currentBody.data ?? {};

  const payload = {
    latestVersion: version,
    minSupportedVersion: args.force ? version : current.minSupportedVersion || version,
    downloadUrl: args.downloadUrl,
    releaseNotes: args.notes || current.releaseNotes || '',
  };

  console.log('Publicando:', payload);
  const putRes = await fetch(`${apiUrl}/configuraciones/app-version?app=finca`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Deploy-Key': deployKey,
    },
    body: JSON.stringify(payload),
  });
  const putBody = await putRes.json();
  if (!putRes.ok || !putBody.success) {
    console.error('Error al publicar:', putBody.message || putRes.status);
    process.exit(1);
  }

  console.log('✓ Versión publicada correctamente.');
  console.log(
    args.force
      ? '  Se forzó minSupportedVersion — los usuarios con versión anterior quedarán bloqueados hasta actualizar.'
      : '  Los usuarios verán el aviso de actualización (no bloqueante).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
