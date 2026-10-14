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
      ruta: '/asistencia',
      icono: 'user-check',
      titulo: 'Asistencia',
      texto: 'Marca entrada o salida con el reconocimiento del rostro, en cualquier finca.',
      visible: hasPermission('asistencia.marcar') || hasPermission('asistencia.marcar_cuadrilla'),
    },
    {
      ruta: '/crear-colaborador',
      icono: 'user-plus',
      titulo: 'Nuevo colaborador',
      texto: 'Crea un colaborador con su identificación y finca predeterminada.',
      visible: hasPermission('colaborador.crear'),
    },
    {
      ruta: '/enrolar-rostro',
      icono: 'camera',
      titulo: 'Registrar rostro',
      texto: 'Enrola la cara de un colaborador desde varios ángulos.',
      visible: hasPermission('colaborador.editar'),
    },
    {
      ruta: '/prueba-rostro',
      icono: 'target',
      titulo: 'Prueba de reconocimiento',
      texto: 'Mide qué tan bien reconoce, sin guardar marcaciones.',
      visible: hasPermission('asistencia.marcar_cuadrilla'),
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
  cardTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardTexto: { color: colors.textMuted, marginTop: 2 },
});
