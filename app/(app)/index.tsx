import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { resumenPendientes } from '@/services/precalibracion.service';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function InicioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const hasPermission = useSessionStore((s) => s.hasPermission);
  const [pendientes, setPendientes] = useState(0);

  useFocusEffect(
    useCallback(() => {
      resumenPendientes().then((r) => setPendientes(r.total));
    }, []),
  );

  const salir = async () => {
    const { total } = await resumenPendientes();
    const aviso = total > 0 ? `Tienes ${total} registro(s) sin enviar. Se conservan en el dispositivo, pero conviene sincronizarlos antes de salir.\n\n` : '';
    Alert.alert('Cerrar sesión', `${aviso}¿Quieres cerrar sesión?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      <Text style={styles.saludo}>Hola, {user?.nombre}</Text>
      <Text style={styles.sub}>¿Qué vas a hacer hoy?</Text>

      {hasPermission('precalibracion.crear') && (
        <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={() => router.push('/precalibrador')}>
          <View style={styles.iconoBox}>
            <Feather name="sliders" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitulo}>Precalibrador</Text>
            <Text style={styles.cardTexto}>Registra los racimos que cumplen la medida del calibrador.</Text>
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
            <Text style={styles.cardTexto}>Asistencia, registro de rostro, prueba de reconocimiento y nuevos colaboradores.</Text>
          </View>
        </Pressable>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button label="Cerrar sesión" variant="outline" onPress={salir} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg },
  saludo: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { color: colors.textMuted, marginBottom: spacing.lg, marginTop: spacing.xs },
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
  cardTitulo: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardTexto: { color: colors.textMuted, marginTop: 2 },
  pendiente: { color: colors.warning, fontWeight: '600', marginTop: spacing.xs },
});
