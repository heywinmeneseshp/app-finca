import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

const REINTENTO_MS = 5000;
const ESPERA_INTENTO_MS = 15000;
export const INTENTOS_GPS = 3;

/** Mantiene la posición GPS actual para marcar. No usa la última conocida del celular: puede ser de otro lugar. Si la ubicación está
 * apagada revisa cada 5 s, así la pantalla se habilita sola al activarla. Con la ubicación activa pero sin señal, `intentar()` busca
 * la posición; tras 3 intentos fallidos `sinGpsPermitido` deja guardar la marcación sin GPS. */
export const useUbicacion = () => {
  const ubicacion = useRef<{ lat: number; lng: number } | null>(null);
  const [gps, setGps] = useState<'buscando' | 'ok' | 'sin-permiso' | 'apagado'>('buscando');
  const [intentos, setIntentos] = useState(0);
  const [intentando, setIntentando] = useState(false);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let reintento: ReturnType<typeof setTimeout> | null = null;
    let cancelado = false;

    const iniciar = async () => {
      if (cancelado) return;
      try {
        const permiso = await Location.requestForegroundPermissionsAsync();
        if (cancelado) return;
        if (permiso.status !== 'granted') {
          setGps('sin-permiso');
          reintento = setTimeout(iniciar, REINTENTO_MS);
          return;
        }
        if (!(await Location.hasServicesEnabledAsync())) {
          if (!cancelado) setGps('apagado');
          ubicacion.current = null;
          reintento = setTimeout(iniciar, REINTENTO_MS);
          return;
        }
        if (cancelado) return;
        setGps((g) => (g === 'ok' ? g : 'buscando'));
        if (sub) return;
        const nueva = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 2 }, (p) => {
          ubicacion.current = { lat: p.coords.latitude, lng: p.coords.longitude };
          setGps('ok');
        });
        if (cancelado) nueva.remove();
        else sub = nueva;
      } catch {
        if (!cancelado) {
          setGps('apagado');
          reintento = setTimeout(iniciar, REINTENTO_MS);
        }
      }
    };
    iniciar();

    return () => {
      cancelado = true;
      if (reintento) clearTimeout(reintento);
      sub?.remove();
    };
  }, []);

  const intentar = async () => {
    setIntentando(true);
    try {
      const p = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ESPERA_INTENTO_MS)),
      ]);
      if (!p) throw new Error('Sin señal GPS');
      ubicacion.current = { lat: p.coords.latitude, lng: p.coords.longitude };
      setGps('ok');
    } catch {
      setIntentos((n) => n + 1);
    } finally {
      setIntentando(false);
    }
  };

  return { ubicacion, gps, intentos, intentando, intentar, sinGpsPermitido: gps === 'buscando' && intentos >= INTENTOS_GPS };
};
