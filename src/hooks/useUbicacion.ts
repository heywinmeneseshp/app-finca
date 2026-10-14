import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

/** Mantiene la última posición GPS para que cada captura la use sin esperar. */
export const useUbicacion = () => {
  const ubicacion = useRef<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<'buscando' | 'ok' | 'sin-permiso'>('buscando');

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelado = false;
    (async () => {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        if (!cancelado) setGps('sin-permiso');
        return;
      }
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima && !cancelado) {
        ubicacion.current = { lat: ultima.coords.latitude, lng: ultima.coords.longitude };
        setGps('ok');
      }
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 2 }, (p) => {
        ubicacion.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGps('ok');
      });
    })();
    return () => {
      cancelado = true;
      sub?.remove();
    };
  }, []);

  return { ubicacion, gps };
};
