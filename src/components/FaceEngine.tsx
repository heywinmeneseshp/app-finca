import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { paginaFacial } from '@/face/paginaFacial';
import { ASSETS_FACIALES, leerAsset, registrarEnvio, resolverResultado, useMotorFacial } from '@/face/motor';

const PARTE = 400_000; // caracteres de base64 por mensaje al WebView

// Motor de reconocimiento facial: un WebView oculto donde corre face-api. Se monta una vez (en el layout de la app
// autenticada) y carga los modelos desde los assets, sin internet.
export function FaceEngine() {
  const webRef = useRef<WebView>(null);
  const setEstado = useMotorFacial((s) => s.set);
  const [html, setHtml] = useState<string | null>(null);
  const estado = useMotorFacial((s) => s.estado);

  useEffect(() => {
    let cancelado = false;
    setEstado('cargando');
    leerAsset(ASSETS_FACIALES.motor, 'utf8')
      .then((motorJs) => {
        if (!cancelado) setHtml(paginaFacial(motorJs));
      })
      .catch((e: Error) => setEstado('error', e.message));
    return () => {
      cancelado = true;
      registrarEnvio(null);
    };
  }, [setEstado]);

  // Si el motor no queda listo en 2 minutos, se muestra un error en vez de quedarse en "preparando" para siempre.
  useEffect(() => {
    if (!html || estado === 'listo' || estado === 'error') return undefined;
    const t = setTimeout(() => setEstado('error', 'El motor facial no terminó de iniciar. Cierra y abre la app; si sigue igual, avisa al soporte.'), 120000);
    return () => clearTimeout(t);
  }, [html, estado, setEstado]);

  const enviar = (mensaje: object) => {
    webRef.current?.injectJavaScript(`window.__rn(${JSON.stringify(mensaje)});true;`);
  };

  const alCargarPagina = async () => {
    registrarEnvio(enviar);
    try {
      for (const nombre of ['tiny', 'landmark', 'recog'] as const) {
        enviar({ t: 'manifiesto', nombre, datos: ASSETS_FACIALES.manifiestos[nombre] });
        const b64 = await leerAsset(ASSETS_FACIALES.pesos[nombre], 'base64');
        for (let i = 0; i < b64.length; i += PARTE) enviar({ t: 'parte', nombre, datos: b64.slice(i, i + PARTE) });
      }
      enviar({ t: 'cargar' });
    } catch (e) {
      setEstado('error', e instanceof Error ? e.message : 'No se pudieron cargar los modelos');
    }
  };

  const alMensaje = (ev: WebViewMessageEvent) => {
    let m: { t: string; [k: string]: unknown };
    try {
      m = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (m.t === 'pagina') alCargarPagina();
    else if (m.t === 'listo') setEstado('listo');
    else if (m.t === 'error') setEstado('error', String(m.mensaje ?? ''));
    else if (m.t === 'resultado') resolverResultado(String(m.id), m as { descriptor?: number[]; confianza?: number; error?: string; backend?: string; ms?: number });
  };

  if (!html) return null;
  return (
    <View style={styles.oculto} pointerEvents="none">
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        onMessage={alMensaje}
        onError={() => setEstado('error', 'No se pudo iniciar el motor facial')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  oculto: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});

export default FaceEngine;
