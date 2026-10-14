import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { FincaAsistencia } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Crea un colaborador: nombre, apellido, identificación y finca predeterminada. La finca predeterminada es solo la
// habitual: el colaborador puede marcar asistencia en cualquier otra finca.
export default function CrearColaboradorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fincas, setFincas] = useState<FincaAsistencia[]>([]);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [cargo, setCargo] = useState('');
  const [fincaUuid, setFincaUuid] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      asistenciaApi
        .rostrosEstado()
        .then((r) => setFincas(r.fincas))
        .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las fincas. Se necesita conexión.'));
    }, []),
  );

  const guardar = async () => {
    if (!nombre.trim() || !apellido.trim() || !documento.trim() || !telefono.trim() || !email.trim() || !cargo.trim() || !fincaUuid) {
      setError('Completa nombre, apellido, identificación, cargo, número, correo y finca predeterminada.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await asistenciaApi.crearColaborador({ nombre: nombre.trim(), apellido: apellido.trim(), documento: documento.trim(), telefono: telefono.trim(), email: email.trim(), cargo: cargo.trim(), fincaUuid });
      Alert.alert('Colaborador creado', `${nombre.trim()} ${apellido.trim()} ya puede registrar su rostro y marcar asistencia.`, [
        { text: 'Aceptar', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el colaborador.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }} keyboardShouldPersistTaps="handled">
        <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
        <TextField label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" />
        <TextField label="Identificación" value={documento} onChangeText={setDocumento} keyboardType="number-pad" />
        <TextField label="Cargo" value={cargo} onChangeText={setCargo} autoCapitalize="sentences" />
        <TextField label="Número de teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
        <TextField label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <SelectField label="Finca predeterminada" value={fincaUuid} options={fincas.map((f) => ({ value: f.uuid, label: f.nombre }))} onChange={setFincaUuid} />
        <Text style={styles.ayuda}>Es la finca habitual del colaborador; puede marcar asistencia en cualquier otra finca.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={guardando ? 'Guardando...' : 'Crear colaborador'} onPress={guardar} disabled={guardando} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  ayuda: { color: colors.textMuted, marginBottom: spacing.md, fontSize: 13 },
  error: { color: colors.danger, marginBottom: spacing.md },
});
