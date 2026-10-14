# app-finca

App móvil de campo para las fincas (Expo + Expo Router + TypeScript), hermana de `app-movil`. Primer módulo: **Precalibrador**
(cada racimo apto se registra con hora y GPS y se sincroniza con `POST /precalibracion/registros`).

- **Expo SDK 57** (igual que `app-movil`). Ojo: en una ocasión el SDK 57 crasheó en el Expo Go del celular de pruebas; si pasa, el plan B es bajar a SDK 54. Probar en un celular físico. Docs: https://docs.expo.dev/versions/v57.0.0/
- `.npmrc` con `legacy-peer-deps=true` (expo-router trae una dependencia opcional que pide un `react-dom` más nuevo).
- La API se configura con `EXPO_PUBLIC_API_URL` (por defecto `http://localhost:3000/api/v1`; en el celular usa la IP del PC).
- Offline-first: los registros se guardan en SQLite (`src/services/db.ts`) y se envían cuando hay conexión.
- El cliente se identifica con `X-Client-App: finca` y un `User-Agent` propio: así el backend SÍ aplica la restricción de
  fincas asignadas (a diferencia de `app-movil`, que va sin restricción).
- Estilo: tuteo ("Selecciona", "Tienes"), español, misma paleta verde de `app-corbana`.

## Asistencia por rostro
- El vector facial (128 números) se calcula en el celular con `face-api` dentro de un WebView oculto (`src/components/FaceEngine.tsx`,
  página en `src/face/paginaFacial.ts`, assets en `assets/face/`). No se guardan fotos: la foto se borra tras calcular el vector.
- El servidor solo compara vectores (`asistencia.service.js` en el backend). La marcación se guarda offline en `asistencia_cola`.
- Pantallas: `asistencia` (marcar), `enrolar-rostro` (5 poses) y `prueba-rostro` (piloto de precisión: muestra distancias).
- Los mismos modelos/motor se usan en la web (`app-corbana/public/face`); si se cambia el modelo hay que volver a enrolar a todos.
