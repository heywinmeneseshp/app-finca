import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Opcion {
  ruta: '/asistencia' | '/enrolar-rostro' | '/prueba-rostro' | '/crear-colaborador';
  icono: keyof typeof Feather.glyphMap;
  titulo: string;
  texto: string;
  visible: boolean;
}

// Menú de colaboradores: asistencia, registro de rostro, prueba de reconocimiento y creación de colaboradores.
export default function ColaboradoresScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasPermission = useSessionStore((s) => s.hasPermission);

  const opciones: Opcion[] = [
    {
      ruta: '/crear-colaborador',
      texto: 'Registrar un colaborador',
      icono: 'user-plus',
      titulo: 'Nuevo colaborador',
      visible: hasPermission('colaborador.crear'),
    },
    {
      ruta: '/enrolar-rostro',
      texto: 'Guardar el rostro',
      icono: 'camera',
      titulo: 'Registrar rostro',
      visible: hasPermission('colaborador.editar'),
    },
    {
      ruta: '/prueba-rostro',
      texto: 'Probar el reconocimiento',
      icono: 'target',
      titulo: 'Prueba de reconocimiento',
      visible: hasPermission('asistencia.marcar_cuadrilla'),
    },
    {
      ruta: '/asistencia',
      texto: 'Marcar entrada o salida',
      icono: 'user-check',
      titulo: 'Asistencia',
      visible: hasPermission('asistencia.marcar') || hasPermission('asistencia.marcar_cuadrilla'),
    },
  ];

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      {opciones
        .filter((o) => o.visible)
        .map((o, i) => (
          <Pressable key={o.ruta} style={({ pressed }) => [styles.card, i > 0 && styles.cardSep, pressed && { opacity: 0.9 }]} onPress={() => router.push(o.ruta)}>
            <View style={styles.iconoBox}>
              <Feather name={o.icono} size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitulo}>{o.titulo}</Text>
              <Text style={styles.cardTexto}>{o.texto}</Text>
            </View>
          </Pressable>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  cardSep: { marginTop: spacing.md },
  iconoBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e8f6ee', alignItems: 'center', justifyContent: 'center' },
  cardTexto: { color: colors.textMuted, marginTop: 2 },
  cardTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
});
