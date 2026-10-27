import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authApi } from '@/api/auth.api';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/constants/theme';
import { resumenPendientes } from '@/services/precalibracion.service';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Perfil del usuario: datos personales, cambio de contraseña y cierre de sesión.
export default function PerfilScreen() {
  const insets = useSafeAreaInsets();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);

  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [apellido, setApellido] = useState(user?.apellido ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [errorPerfil, setErrorPerfil] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [verClaves, setVerClaves] = useState(false);
  const [errorClave, setErrorClave] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);

  const cambioPerfil = nombre.trim() !== user?.nombre || apellido.trim() !== user?.apellido || email.trim() !== user?.email;

  const guardarPerfil = async () => {
    if (nombre.trim().length < 2 || apellido.trim().length < 2 || !email.trim()) {
      setErrorPerfil('Completa nombre, apellido y correo.');
      return;
    }
    setGuardandoPerfil(true);
    setErrorPerfil('');
    try {
      await authApi.updateProfile({ nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim() });
      const refrescado = await authApi.me();
      useSessionStore.setState({ user: refrescado });
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron.');
    } catch (e) {
      setErrorPerfil(e instanceof Error ? e.message : 'No se pudo guardar el perfil.');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const cambiarClave = async () => {
    if (!actual || !nueva) {
      setErrorClave('Escribe tu contraseña actual y la nueva.');
      return;
    }
    setGuardandoClave(true);
    setErrorClave('');
    try {
      await authApi.changePassword(actual, nueva);
      setActual('');
      setNueva('');
      Alert.alert('Contraseña actualizada', 'Usa la nueva contraseña la próxima vez que ingreses.');
    } catch (e) {
      setErrorClave(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardandoClave(false);
    }
  };

  const salir = async () => {
    const { total } = await resumenPendientes();
    const aviso = total > 0 ? `Tienes ${total} registro(s) sin enviar. Se conservan en el dispositivo, pero conviene sincronizarlos antes de salir.\n\n` : '';
    Alert.alert('Cerrar sesión', `${aviso}¿Quieres cerrar sesión?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={styles.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={styles.usuario}>@{user?.usuario}</Text>
            <Text style={styles.roles}>{user?.roles.join(', ') || 'Sin rol'}</Text>
          </View>
          <Pressable onPress={salir} hitSlop={10} accessibilityLabel="Cerrar sesión" style={styles.salir}>
            <Feather name="log-out" size={20} color={colors.danger} />
          </Pressable>
        </View>

        <Text style={styles.seccion}>Datos personales</Text>
        <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
        <TextField label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" />
        <TextField label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        {errorPerfil ? <Text style={styles.error}>{errorPerfil}</Text> : null}
        <Button label="Guardar cambios" onPress={guardarPerfil} loading={guardandoPerfil} disabled={!cambioPerfil} />

        <Text style={[styles.seccion, { marginTop: spacing.lg }]}>Cambiar contraseña</Text>
        <TextField
          label="Contraseña actual"
          value={actual}
          onChangeText={setActual}
          secureTextEntry={!verClaves}
          autoCapitalize="none"
          accionLabel={verClaves ? 'Ocultar' : 'Mostrar'}
          onAccionPress={() => setVerClaves((v) => !v)}
        />
        <TextField label="Contraseña nueva" value={nueva} onChangeText={setNueva} secureTextEntry={!verClaves} autoCapitalize="none" />
        <Text style={styles.ayuda}>Mínimo 8 caracteres, con letras y números.</Text>
        {errorClave ? <Text style={styles.error}>{errorClave}</Text> : null}
        <Button label="Cambiar contraseña" onPress={cambiarClave} loading={guardandoClave} variant="outline" />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'flex-start' },
  salir: { padding: spacing.sm },
  usuario: { fontSize: 20, fontWeight: '700', color: colors.text },
  roles: { color: colors.textMuted, marginBottom: spacing.md },
  seccion: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, marginBottom: spacing.sm },
  ayuda: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.sm },
});
