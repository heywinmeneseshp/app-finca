import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';
import { ApiRequestError } from '@/types/common';

export default function LoginScreen() {
  const login = useSessionStore((s) => s.login);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ingresar = async () => {
    if (!usuario.trim() || !password) {
      setError('Ingresa tu usuario y tu contraseña');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(usuario.trim(), password);
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err.message);
      else if (err instanceof TypeError) setError('No se pudo conectar con el servidor. Verifica tu conexión.');
      else setError('Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoTexto}>C</Text>
            </View>
            <Text style={styles.title}>Corbana Finca</Text>
            <Text style={styles.subtitle}>Herramientas de campo</Text>
          </View>

          <View style={styles.form}>
            <TextField label="Usuario" autoCapitalize="none" autoCorrect={false} value={usuario} onChangeText={setUsuario} />
            <TextField
              label="Contraseña"
              secureTextEntry={!verPassword}
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={ingresar}
              accionLabel={verPassword ? 'Ocultar' : 'Mostrar'}
              onAccionPress={() => setVerPassword((v) => !v)}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label="Ingresar" onPress={ingresar} loading={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primaryDarker },
  scroll: { flexGrow: 1 },
  brand: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl * 1.5, paddingHorizontal: spacing.lg },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoTexto: { color: '#fff', fontSize: 30, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: 'rgba(240,253,244,0.75)', marginTop: spacing.xs },
  form: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  error: { color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
});
