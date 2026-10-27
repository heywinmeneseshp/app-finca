import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { cargarSesionActiva, guardarPuntoTraza } from '@/services/precalibracion.service';

// Tracking GPS en segundo plano de la sesión de precalibración (servicio en primer plano en Android).
// Solo funciona en una build propia (no en Expo Go); allí se queda el seguimiento con la app abierta.
export const TAREA_TRAZA = 'precalibracion-traza';

TaskManager.defineTask(TAREA_TRAZA, async ({ data, error }) => {
  if (error) return;
  const activa = await cargarSesionActiva();
  if (!activa) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  for (const l of locations) {
    await guardarPuntoTraza(activa.sesion.uuid, l.coords.latitude, l.coords.longitude, l.coords.accuracy ?? null, l.timestamp);
  }
});

/** Activa el tracking en segundo plano. Devuelve false si no hay permiso o el entorno no lo soporta. */
export const iniciarTrazaBackground = async (): Promise<boolean> => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(TAREA_TRAZA)) return true;
    await Location.startLocationUpdatesAsync(TAREA_TRAZA, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 5,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Precalibración en curso',
        notificationBody: 'Guardando tu recorrido mientras trabajas.',
        notificationColor: '#16a34a',
      },
    });
    return true;
  } catch {
    return false;
  }
};

export const detenerTrazaBackground = async (): Promise<void> => {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TAREA_TRAZA)) await Location.stopLocationUpdatesAsync(TAREA_TRAZA);
  } catch {
    // sin tarea activa o entorno sin soporte
  }
};
