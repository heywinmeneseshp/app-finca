import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { ColaboradorRostro } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { CapturaRostroModal } from '@/components/CapturaRostroModal';
import { SelectField } from '@/components/SelectField';
import { useSessionStore } from '@/stores/useSessionStore';
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
const MAX_MUESTRAS = 8; // mismo tope que la API

// Registra el rostro de un colaborador (5 capturas guiadas). No se guardan fotos: solo los vectores (números).
// Si ya tiene rostro: «Reforzar» agrega capturas sin aprobación; «Volver a registrar» queda pendiente hasta que otro usuario
// con permiso lo apruebe (mientras tanto el rostro actual sigue funcionando). Quien solo marca asistencia ve únicamente su ficha.
export default function EnrolarRostroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [colaboradores, setColaboradores] = useState<ColaboradorRostro[]>([]);
  const [colaboradorUuid, setColaboradorUuid] = useState<string | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [muestras, setMuestras] = useState<{ pose: string; descriptor: number[] }[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'nuevo' | 'reforzar' | 'reemplazar'>('nuevo');
  const hasPermission = useSessionStore((st) => st.hasPermission);
  // Quien solo registra asistencia enrola únicamente a colaboradores nuevos (sin rostro).
  const soloNuevos =
    hasPermission('asistencia.registrar') &&
    !['colaborador.crear', 'colaborador.editar', 'sanidad_vegetal.colaboradores.crear', 'sanidad_vegetal.colaboradores.editar'].some((p) => hasPermission(p));

  const cargar = useCallback(async () => {
    try {
      const { colaboradores: todos } = await asistenciaApi.rostrosEstado();
      const lista = soloNuevos ? todos.filter((c) => !c.enrolado) : todos;
      setColaboradores(lista);
      // Quien solo marca su asistencia recibe únicamente su ficha: se elige sola.
      if (lista.length === 1) {
        setColaboradorUuid(lista[0].uuid);
        setConsentimiento(Boolean(lista[0].consentimiento));
        setModo(lista[0].enrolado ? (MAX_MUESTRAS - lista[0].muestras > 0 ? 'reforzar' : 'reemplazar') : 'nuevo');
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista. Se necesita conexión.');
    } finally {
      setCargando(false);
    }
  }, [soloNuevos]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const colaborador = useMemo(() => colaboradores.find((c) => c.uuid === colaboradorUuid) ?? null, [colaboradores, colaboradorUuid]);
  const libres = colaborador ? Math.max(0, MAX_MUESTRAS - colaborador.muestras) : 0;
  const poses = modo === 'reforzar' ? POSES.slice(0, Math.min(POSES.length, libres)) : POSES;
  const poseActual = poses[muestras.length];
  const completo = poses.length > 0 && muestras.length === poses.length;

  const elegir = (uuid: string) => {
    const c = colaboradores.find((x) => x.uuid === uuid);
    setColaboradorUuid(uuid);
    setMuestras([]);
    setError('');
    setConsentimiento(Boolean(c?.consentimiento));
    setModo(c?.enrolado ? (MAX_MUESTRAS - c.muestras > 0 ? 'reforzar' : 'reemplazar') : 'nuevo');
  };
  const cambiarModo = (m: 'reforzar' | 'reemplazar') => {
    setModo(m);
    setMuestras([]);
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
      if (muestras.length + 1 >= poses.length) setAbierto(false); // última pose: se cierra solo
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar la captura.');
    }
  };

  const guardar = async () => {
    if (!colaborador) return;
    setGuardando(true);
    setError('');
    try {
      const r = await asistenciaApi.enrolar(colaborador.uuid, muestras, consentimiento, modo === 'reforzar');
      Alert.alert(
        r.solicitud ? 'Enviado para aprobación' : 'Listo',
        r.solicitud
          ? 'El nuevo registro queda pendiente hasta que otro usuario con permiso lo apruebe. Mientras tanto el rostro actual sigue funcionando.'
          : modo === 'reforzar'
            ? `Se agregaron ${muestras.length} capturas al rostro de ${colaborador.nombre}.`
            : `El rostro de ${colaborador.nombre} quedó registrado.`,
      );
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

  if (colaboradores.length === 0 && !error) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
        <View style={styles.card}>
          <Text style={styles.pose}>Aún no tienes ficha de colaborador</Text>
          <Text style={[styles.nota, { marginBottom: spacing.md }]}>Créala primero; luego vuelve aquí para registrar tu rostro.</Text>
          <Button label="Crear mi ficha" onPress={() => router.push('/mi-ficha')} />
        </View>
      </ScrollView>
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
              {!colaborador.enrolado
                ? 'Aún no tiene rostro registrado.'
                : modo === 'reforzar'
                  ? `Ya tiene ${colaborador.muestras} captura(s): se agregan ${poses.length} más, sin aprobación.`
                  : 'Las capturas nuevas reemplazarán el rostro cuando otro usuario con permiso las apruebe.'}
            </Text>
            {colaborador.enrolado && (
              <View style={[styles.fila, { marginTop: spacing.sm }]}>
                <View style={{ flex: 1 }}>
                  <Button label="Reforzar" variant={modo === 'reforzar' ? undefined : 'outline'} disabled={libres === 0} onPress={() => cambiarModo('reforzar')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Volver a registrar" variant={modo === 'reemplazar' ? undefined : 'outline'} onPress={() => cambiarModo('reemplazar')} />
                </View>
              </View>
            )}
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
              <Text style={[styles.pose, { color: colors.success }]}>Listo: {poses.length} capturas tomadas.</Text>
              <Button
                label={guardando ? 'Guardando...' : modo === 'reforzar' ? 'Agregar capturas' : modo === 'reemplazar' ? 'Enviar para aprobación' : 'Guardar rostro'}
                onPress={guardar}
                loading={guardando}
              />
              <View style={{ height: spacing.sm }} />
              <Button label="Empezar de nuevo" variant="outline" onPress={() => setMuestras([])} />
            </>
          ) : (
            <>
              <Text style={styles.pose}>
                {muestras.length} de {poses.length} capturas tomadas
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
        progreso={{ actual: muestras.length, total: poses.length }}
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
