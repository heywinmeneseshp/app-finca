import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  /** Texto de un botón dentro del campo (ej. "Mostrar" para ver la contraseña). */
  accionLabel?: string;
  onAccionPress?: () => void;
}

export function TextField({ label, error, style, accionLabel, onAccionPress, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, error ? { borderColor: colors.danger } : null, accionLabel ? { paddingRight: 84 } : null, style]}
          {...rest}
        />
        {accionLabel ? (
          <Pressable style={styles.accion} onPress={onAccionPress} hitSlop={8}>
            <Text style={styles.accionTexto}>{accionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: spacing.xs },
  accion: { position: 'absolute', right: spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  accionTexto: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});

export default TextField;
