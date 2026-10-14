import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, radius, spacing } from '@/constants/theme';

interface Props {
  /** Se llama con la foto en base64 (JPEG). La foto se borra del dispositivo en cuanto se entrega. */
  onFoto: (base64: string) => Promise<void>;
  etiqueta?: string;
  deshabilitado?: boolean;
}

// Cámara frontal con un botón de captura. La foto solo se usa para calcular el vector facial: no se conserva.
export function CamaraRostro({ onFoto, etiqueta = 'Capturar', deshabilitado }: Props) {
  const camara = useRef<CameraView>(null);
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [procesando, setProcesando] = useState(false);

  if (!permiso) return <View style={styles.caja} />;
  if (!permiso.granted) {
    return (
      <View style={[styles.caja, styles.centro]}>
        <Text style={styles.texto}>Necesitamos la cámara para reconocer el rostro.</Text>
        <Pressable style={styles.boton} onPress={pedirPermiso}>
          <Text style={styles.botonTexto}>Dar permiso</Text>
        </Pressable>
      </View>
    );
  }

  const capturar = async () => {
    if (!camara.current || procesando) return;
    setProcesando(true);
    try {
      const foto = await camara.current.takePictureAsync({ quality: 0.5, base64: true, shutterSound: false });
      if (foto?.uri) FileSystem.deleteAsync(foto.uri, { idempotent: true }).catch(() => {});
      if (foto?.base64) await onFoto(foto.base64);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <View>
      <View style={styles.caja}>
        <CameraView ref={camara} style={StyleSheet.absoluteFill} facing="front" mirror />
        <View style={styles.guia} pointerEvents="none" />
      </View>
      <Pressable style={[styles.boton, (deshabilitado || procesando) && { opacity: 0.5 }]} disabled={deshabilitado || procesando} onPress={capturar}>
        {procesando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>{etiqueta}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  centro: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  texto: { color: '#fff', textAlign: 'center' },
  guia: {
    position: 'absolute',
    top: '12%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderStyle: 'dashed',
  },
  boton: { marginTop: spacing.md, minHeight: 52, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default CamaraRostro;
