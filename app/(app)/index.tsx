import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { resumenPendientes } from '@/services/precalibracion.service';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};
const primerNombre = (nombre?: string) => (nombre ?? '').trim().split(/\s+/)[0];
const fechaHoy = () => {
  const t = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const hasPermission = useSessionStore((s) => s.hasPermission);
  const [pendientes, setPendientes] = useState(0);

  useFocusEffect(
    useCallback(() => {
      resumenPendientes().then((r) => setPendientes(r.total));
    }, []),
  );

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      <Text style={styles.fecha}>{fechaHoy()}</Text>
      <Text style={styles.saludo}>{saludo()}, {primerNombre(user?.nombre)}</Text>

      {hasPermission('precalibracion.crear') && (
        <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => router.push('/precalibrador')}>
          <View style={styles.iconoBox}>
            <Feather name="sliders" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitulo}>Precalibrador</Text>
            <Text style={styles.cardTexto}>Registrar racimos aptos</Text>
            {pendientes > 0 && <Text style={styles.pendiente}>{pendientes} registro(s) sin enviar</Text>}
          </View>
        </Pressable>
      )}

      {(hasPermission('asistencia.marcar') || hasPermission('asistencia.marcar_cuadrilla') || hasPermission('colaborador.editar') || hasPermission('colaborador.crear')) && (
        <Pressable style={({ pressed }) => [styles.card, styles.cardSep, pressed && { opacity: 0.9 }]} onPress={() => router.push('/colaboradores')}>
          <View style={styles.iconoBox}>
            <Feather name="users" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitulo}>Colaboradores</Text>
            <Text style={styles.cardTexto}>Asistencia y registros</Text>
          </View>
        </Pressable>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  fecha: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  saludo: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  cardSep: { marginTop: spacing.md },
  iconoBox: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e8f6ee', alignItems: 'center', justifyContent: 'center' },
  cardTexto: { color: colors.textMuted, marginTop: 2 },
  cardTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  pendiente: { color: colors.warning, fontWeight: '600', marginTop: spacing.xs },
});
