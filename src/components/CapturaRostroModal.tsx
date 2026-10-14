import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CamaraRostro } from '@/components/CamaraRostro';
import { EstadoChip } from '@/components/EstadoChip';
import { colors, radius, spacing } from '@/constants/theme';
import { useMotorFacial } from '@/face/motor';

interface Props {
  visible: boolean;
  titulo: string;
  /** Instrucción actual (ej. la pose que sigue). */
  instruccion?: string;
  /** Avance de una serie de capturas (ej. 2 de 5). */
  progreso?: { actual: number; total: number };
  etiquetaBoton?: string;
  error?: string;
  onFoto: (base64: string) => Promise<void>;
  onClose: () => void;
  /** Resultado u otra información que se muestra debajo de la cámara. */
  children?: ReactNode;
}

// Captura del rostro en un modal a pantalla completa: cámara, avance, instrucción y el resultado o el error a la vista.
export function CapturaRostroModal({ visible, titulo, instruccion, progreso, etiquetaBoton = 'Capturar', error, onFoto, onClose, children }: Props) {
  const motor = useMotorFacial((s) => s.estado);
  const motorMensaje = useMotorFacial((s) => s.mensaje);
  const listo = motor === 'listo';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
      <SafeAreaView style={styles.pantalla} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>{titulo}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.cerrar}>
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          {progreso && (
            <View style={styles.progreso}>
              {Array.from({ length: progreso.total }).map((_, i) => (
                <View key={i} style={[styles.punto, i < progreso.actual && styles.puntoLleno, i === progreso.actual && styles.puntoActual]} />
              ))}
              <Text style={styles.progresoTexto}>
                {Math.min(progreso.actual + 1, progreso.total)} de {progreso.total}
              </Text>
            </View>
          )}
          {instruccion ? <Text style={styles.instruccion}>{instruccion}</Text> : null}

          <CamaraRostro etiqueta={etiquetaBoton} deshabilitado={!listo} onFoto={onFoto} />

          <View style={{ marginTop: spacing.sm }}>
            {!listo && (
              <EstadoChip
                icono="user-check"
                texto={motor === 'error' ? motorMensaje || 'Error del motor facial' : 'Preparando reconocimiento...'}
                color={motor === 'error' ? colors.danger : colors.warning}
              />
            )}
          </View>

          {error ? (
            <View style={styles.error}>
              <Feather name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorTexto}>{error}</Text>
            </View>
          ) : null}
          {children}
        </ScrollView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  titulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  cerrar: { padding: spacing.xs },
  contenido: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xl * 2 },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  puntoLleno: { backgroundColor: colors.primary },
  puntoActual: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface },
  progresoTexto: { marginLeft: spacing.sm, color: colors.textMuted, fontWeight: '600' },
  instruccion: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fdecea' },
  errorTexto: { flex: 1, color: colors.danger, fontWeight: '600' },
});

export default CapturaRostroModal;
