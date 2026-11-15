import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
import { colors, radius, spacing } from '@/constants/theme';

// Se monta una sola vez, arriba del todo (fuera de la navegación), para que
// una actualización obligatoria bloquee la app entera y no solo una
// pantalla puntual.
export const UpdateModal = () => {
  const { status, info, currentVersion } = useAppVersionCheck();
  const [descartado, setDescartado] = useState(false);

  const visible = status === 'update-required' || (status === 'update-available' && !descartado);
  if (!visible || !info) return null;

  const obligatoria = status === 'update-required';

  const abrirDescarga = () => {
    if (info.downloadUrl) Linking.openURL(info.downloadUrl);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {
        if (!obligatoria) setDescartado(true);
      }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Feather name="download-cloud" size={28} color={colors.primary} />
          </View>

          <Text style={styles.title}>
            {obligatoria ? 'Actualización requerida' : 'Nueva versión disponible'}
          </Text>

          <Text style={styles.message}>
            {obligatoria
              ? `Tu versión (${currentVersion}) ya no es compatible. Actualiza a la ${info.latestVersion} para seguir usando la app.`
              : `Hay una nueva versión (${info.latestVersion}) disponible. Tienes la ${currentVersion}.`}
          </Text>

          {info.releaseNotes ? <Text style={styles.notes}>{info.releaseNotes}</Text> : null}

          <Pressable style={styles.updateBtn} onPress={abrirDescarga}>
            <Feather name="download" size={16} color="#fff" />
            <Text style={styles.updateBtnLabel}>Descargar actualización</Text>
          </Pressable>

          {!obligatoria && (
            <Pressable style={styles.laterBtn} onPress={() => setDescartado(true)}>
              <Text style={styles.laterBtnLabel}>Más tarde</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  message: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  notes: {
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.sm,
    width: '100%',
    marginBottom: spacing.md,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    width: '100%',
    marginTop: spacing.xs,
  },
  updateBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  laterBtn: { marginTop: spacing.sm, padding: spacing.xs },
  laterBtnLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});

export default UpdateModal;
