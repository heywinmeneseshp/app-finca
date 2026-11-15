import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { MiFicha } from '@/api/asistencia.api';
import { cargarUbicaciones, destinoDe } from '@/services/asistencia.service';
import type { UbicacionAsistencia } from '@/services/asistencia.service';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/SelectField';
import { CargoSelectField } from '@/components/CargoSelectField';
import { TextField } from '@/components/TextField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Mi ficha de colaborador (autoservicio): si no existe se crea vinculada al usuario de la sesión; luego se registra el rostro.
// Después se pueden editar teléfono, cargo y lugar predeterminado (finca u oficina); nombre, apellido e identificación quedan protegidos.
// Igual que «Mi registro» en la web. Se necesita conexión.
export default function MiFichaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const [ficha, setFicha] = useState<MiFicha | null | undefined>(undefined); // undefined = cargando
  const [ubicaciones, setUbicaciones] = useState<UbicacionAsistencia[]>([]);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [apellido, setApellido] = useState(user?.apellido ?? '');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cargo, setCargo] = useState('');
  const [sitio, setSitio] = useState<string | null>(null); // lugar predeterminado: "f:<uuid>" finca o "l:<uuid>" oficina
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setError('');
      asistenciaApi
        .miFicha()
        .then((f) => setFicha(f ?? null))
        .catch((e) => {
          setFicha(null);
          setError(e instanceof Error ? e.message : 'No se pudo cargar tu ficha. Se necesita conexión.');
        });
      cargarUbicaciones()
        .then(setUbicaciones)
        .catch(() => {});
    }, []),
  );

  const crear = async () => {
    if (!documento.trim()) {
      setError('Escribe tu número de identificación.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const creada = await asistenciaApi.crearMiFicha({
        nombre: nombre.trim() || null,
        apellido: apellido.trim() || null,
        documento: documento.trim(),
        telefono: telefono.trim() || null,
        cargo: cargo.trim() || null,
        ...(sitio ? destinoDe(sitio) : {}),
      });
      setFicha(creada);
      Alert.alert('Ficha creada', 'Ahora registra tu rostro para marcar tu asistencia.', [
        { text: 'Más tarde', style: 'cancel' },
        { text: 'Registrar rostro', onPress: () => router.push('/enrolar-rostro') },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear tu ficha.');
    } finally {
      setGuardando(false);
    }
  };

  if (ficha === undefined) {
    return (
      <View style={styles.centro}>
        <Text style={{ color: colors.textMuted }}>Cargando...</Text>
      </View>
    );
  }

  const etiquetaSitio = (u: UbicacionAsistencia) => (u.tipo === 'FINCA' ? u.nombre : `${u.nombre} · oficina/otro`);
  const selectorSitio = (
    <SelectField label="Lugar predeterminado (opcional)" value={sitio} options={ubicaciones.map((u) => ({ value: u.clave, label: etiquetaSitio(u) }))} onChange={setSitio} />
  );

  const empezarEdicion = (f: MiFicha) => {
    setTelefono(f.telefono ?? '');
    setCargo(f.cargo ?? '');
    setSitio(f.lugar ? `l:${f.lugar.uuid}` : f.finca ? `f:${f.finca.uuid}` : null);
    setError('');
    setEditando(true);
  };

  const guardarEdicion = async () => {
    setGuardando(true);
    setError('');
    try {
      const destino = sitio ? destinoDe(sitio) : {};
      const f = await asistenciaApi.actualizarMiFicha({
        telefono: telefono.trim() || null,
        cargo: cargo.trim() || null,
        fincaUuid: destino.fincaUuid ?? null,
        lugarUuid: destino.lugarUuid ?? null,
      });
      setFicha(f);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  if (ficha && editando) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.ayuda}>Nombre, apellido e identificación solo los cambia quien administra los colaboradores.</Text>
          <CargoSelectField value={cargo} onChange={setCargo} />
          <TextField label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
          {selectorSitio}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label={guardando ? 'Guardando...' : 'Guardar cambios'} onPress={guardarEdicion} disabled={guardando} />
          <View style={{ height: spacing.sm }} />
          <Button label="Cancelar" variant="outline" onPress={() => setEditando(false)} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (ficha) {
    const s = ficha.solicitudRostro;
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }}>
        <View style={styles.card}>
          <Text style={styles.titulo}>{`${ficha.nombre} ${ficha.apellido ?? ''}`.trim()}</Text>
          {ficha.documento ? <Text style={styles.linea}>Identificación: {ficha.documento}</Text> : null}
          {ficha.cargo ? <Text style={styles.linea}>Cargo: {ficha.cargo}</Text> : null}
          {ficha.telefono ? <Text style={styles.linea}>Teléfono: {ficha.telefono}</Text> : null}
          {ficha.finca || ficha.lugar ? <Text style={styles.linea}>Lugar predeterminado: {(ficha.finca || ficha.lugar)?.nombre}</Text> : null}
          <Text style={[styles.linea, { color: ficha.rostroEnrolado ? colors.success : colors.warning, fontWeight: '700' }]}>
            {ficha.rostroEnrolado ? `Rostro registrado (${ficha.rostroMuestras} capturas)` : 'Rostro sin registrar'}
          </Text>
          {s?.estado === 'PENDIENTE' ? <Text style={[styles.linea, { color: colors.warning }]}>Nuevo registro pendiente de aprobación</Text> : null}
          {s?.estado === 'RECHAZADA' && s.nota ? <Text style={[styles.linea, { color: colors.danger }]}>Último nuevo registro rechazado: {s.nota}</Text> : null}
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Button label={ficha.rostroEnrolado ? 'Reforzar o volver a registrar mi rostro' : 'Registrar mi rostro'} onPress={() => router.push('/enrolar-rostro')} />
          <View style={{ height: spacing.sm }} />
          <Button label="Editar mi ficha" variant="outline" onPress={() => empezarEdicion(ficha)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl + insets.bottom }} keyboardShouldPersistTaps="handled">
        <Text style={styles.ayuda}>Aún no tienes ficha de colaborador. Créala para registrar tu rostro y marcar tu asistencia; queda vinculada a tu usuario.</Text>
        <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
        <TextField label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" />
        <TextField label="Identificación" value={documento} onChangeText={setDocumento} keyboardType="number-pad" />
        <CargoSelectField label="Cargo (opcional)" value={cargo} onChange={setCargo} permitirNuevo />
        <TextField label="Teléfono (opcional)" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
        {selectorSitio}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={guardando ? 'Guardando...' : 'Crear mi ficha'} onPress={crear} disabled={guardando} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  titulo: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  linea: { color: colors.text, marginTop: 4 },
  ayuda: { color: colors.textMuted, marginBottom: spacing.md, fontSize: 13 },
  error: { color: colors.danger, marginBottom: spacing.md },
});
