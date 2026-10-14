import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { ColaboradorRostro } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { CapturaRostroModal } from '@/components/CapturaRostroModal';
import { SelectField } from '@/components/SelectField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { obtenerDescriptor } from '@/face/motor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Varios ángulos de la misma persona: más información y mejor reconocimiento aunque llegue de lado.
const POSES = [
  { id: 'frente', texto: 'Mira de frente a la cámara' },
  { id: 'izquierda', texto: 'Gira la cabeza un poco a tu izquierda' },
  { id: 'derecha', texto: 'Gira la cabeza un poco a tu derecha' },
  { id: 'arriba', texto: 'Levanta un poco la cara' },
  { id: 'abajo', texto: 'Baja un poco la cara' },
];

// Registra el rostro de un colaborador (5 capturas guiadas). No se guardan fotos: solo los vectores (números).
export default function EnrolarRostroScreen() {
  const insets = useSafeAreaInsets();
  const [colaboradores, setColaboradores] = useState<ColaboradorRostro[]>([]);
  const [colaboradorUuid, setColaboradorUuid] = useState<string | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [muestras, setMuestras] = useState<{ pose: string; descriptor: number[] }[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { colaboradores: lista } = await asistenciaApi.rostrosEstado();
      setColaboradores(lista);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista. Se necesita conexión.');
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const colaborador = useMemo(() => colaboradores.find((c) => c.uuid === colaboradorUuid) ?? null, [colaboradores, colaboradorUuid]);
  const poseActual = POSES[muestras.length];
  const completo = muestras.length === POSES.length;

  const elegir = (uuid: string) => {
    setColaboradorUuid(uuid);
    setMuestras([]);
    setError('');
    setConsentimiento(Boolean(colaboradores.find((c) => c.uuid === uuid)?.consentimiento));
  };

  const abrirCaptura = () => {
    setError('');
    setAbierto(true);
  };

  const alFoto = async (base64: string) => {
    if (!poseActual) return;
    setError('');
    try {
      const { descriptor } = await obtenerDescriptor(base64);
      setMuestras((m) => [...m, { pose: poseActual.id, descriptor }]);
      if (muestras.length + 1 >= POSES.length) setAbierto(false); // última pose: se cierra solo
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la captura.');
    }
  };

  const guardar = async () => {
    if (!colaborador) return;
    setGuardando(true);
    setError('');
    try {
      await asistenciaApi.enrolar(colaborador.uuid, muestras, consentimiento);
      Alert.alert('Listo', `El rostro de ${colaborador.nombre} quedó registrado.`);
      setMuestras([]);
      setColaboradorUuid(null);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Se necesita conexión.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.centro}>
        <Text style={{ color: colors.textMuted }}>Cargando...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <SelectField
          label="Colaborador"
          value={colaboradorUuid}
          options={colaboradores.map((c) => ({ value: c.uuid, label: `${c.nombre}${c.documento ? ` · ${c.documento}` : ''}${c.enrolado ? ' (registrado)' : ''}` }))}
          onChange={elegir}
        />
        {colaborador && (
          <>
            <Text style={styles.nota}>
              {colaborador.enrolado ? `Ya tiene ${colaborador.muestras} captura(s). Si continúas se reemplazan.` : 'Aún no tiene rostro registrado.'}
            </Text>
            <View style={styles.fila}>
              <Switch value={consentimiento} onValueChange={setConsentimiento} trackColor={{ true: colors.primary }} />
              <Text style={styles.consentimiento}>El colaborador autoriza el tratamiento de su dato biométrico (huella facial) para registrar su asistencia.</Text>
            </View>
          </>
        )}
      </View>

      {colaborador && consentimiento && (
        <View style={[styles.card, { marginTop: spacing.md }]}>
          {completo ? (
            <>
              <Text style={[styles.pose, { color: colors.success }]}>Listo: {POSES.length} capturas tomadas.</Text>
              <Button label={guardando ? 'Guardando...' : 'Guardar rostro'} onPress={guardar} loading={guardando} />
              <View style={{ height: spacing.sm }} />
              <Button label="Empezar de nuevo" variant="outline" onPress={() => setMuestras([])} />
            </>
          ) : (
            <>
              <Text style={styles.pose}>
                {muestras.length} de {POSES.length} capturas tomadas
              </Text>
              <Button label={muestras.length === 0 ? 'Iniciar captura' : 'Continuar captura'} onPress={abrirCaptura} />
            </>
          )}
        </View>
      )}

      {error && !abierto ? <Text style={styles.error}>{error}</Text> : null}

      <CapturaRostroModal
        visible={abierto}
        titulo={colaborador ? `Rostro de ${colaborador.nombre}` : 'Registrar rostro'}
        instruccion={poseActual?.texto}
        progreso={{ actual: muestras.length, total: POSES.length }}
        error={error}
        onFoto={alFoto}
        onClose={() => setAbierto(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  nota: { color: colors.textMuted, marginTop: spacing.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  consentimiento: { flex: 1, color: colors.text, fontSize: 13 },
  pose: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
