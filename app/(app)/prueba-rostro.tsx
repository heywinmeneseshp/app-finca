import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { FincaAsistencia, ResultadoPrueba } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { CapturaRostroModal } from '@/components/CapturaRostroModal';
import { SelectField } from '@/components/SelectField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { obtenerDescriptor, useMotorFacial } from '@/face/motor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ETIQUETA: Record<ResultadoPrueba['estado'], { texto: string; color: string }> = {
  VERIFICADA: { texto: 'Reconocido', color: colors.success },
  NO_RECONOCIDA: { texto: 'No reconocido', color: colors.danger },
  AMBIGUA: { texto: 'Ambiguo (parecido a otra persona)', color: colors.warning },
  SIN_ENROLADOS: { texto: 'No hay colaboradores con rostro en esta finca', color: colors.warning },
};

// Piloto de precisión: reconoce un rostro y muestra las distancias al mejor y al segundo candidato, SIN guardar
// ninguna marcación. Sirve para fijar el umbral con trabajadores reales.
export default function PruebaRostroScreen() {
  const insets = useSafeAreaInsets();
  const [fincas, setFincas] = useState<FincaAsistencia[]>([]);
  const [fincaUuid, setFincaUuid] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPrueba | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [diagnostico, setDiagnostico] = useState('');
  const motor = useMotorFacial((s) => s.estado);

  useFocusEffect(
    useCallback(() => {
      asistenciaApi
        .rostrosEstado()
        .then(({ fincas: lista }) => {
          setFincas(lista);
          if (lista.length === 1) setFincaUuid(lista[0].uuid);
        })
        .catch((e: Error) => setError(e.message));
    }, []),
  );

  const alFoto = async (base64: string) => {
    if (!fincaUuid) return;
    setError('');
    setResultado(null);
    try {
      const { descriptor, backend, ms } = await obtenerDescriptor(base64);
      setDiagnostico(`Motor ${backend ?? '?'} · ${ms ?? '?'} ms`);
      setResultado(await asistenciaApi.probar(fincaUuid, descriptor));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer la prueba.');
    }
  };

  const etiqueta = resultado ? ETIQUETA[resultado.estado] : null;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]}>
      <Text style={styles.intro}>Prueba de reconocimiento: no guarda marcaciones. Úsala para medir qué tan bien reconoce a tus trabajadores.</Text>
      <View style={styles.card}>
        <SelectField label="Finca" value={fincaUuid} options={fincas.map((f) => ({ value: f.uuid, label: f.nombre }))} onChange={setFincaUuid} />
      </View>
      <View style={{ marginTop: spacing.md }}>
        <Button label="Abrir cámara" onPress={() => { setError(''); setResultado(null); setAbierto(true); }} disabled={!fincaUuid || motor !== 'listo'} />
        {motor !== 'listo' && <Text style={styles.nota}>Preparando el reconocimiento facial...</Text>}
      </View>

      <CapturaRostroModal
        visible={abierto}
        titulo="Prueba de reconocimiento"
        instruccion="Mira de frente a la cámara"
        etiquetaBoton="Probar"
        error={error}
        onFoto={alFoto}
        onClose={() => setAbierto(false)}
      >
        {resultado && etiqueta && (
          <View style={[styles.card, { marginTop: spacing.md }]}>
            <Text style={[styles.estado, { color: etiqueta.color }]}>{etiqueta.texto}</Text>
            {resultado.mejor && (
              <Text style={styles.linea}>
                1.º {resultado.mejor.nombre} · distancia <Text style={styles.num}>{resultado.mejor.distancia.toFixed(3)}</Text>
              </Text>
            )}
            {resultado.segundo && (
              <Text style={styles.linea}>
                2.º {resultado.segundo.nombre} · distancia <Text style={styles.num}>{resultado.segundo.distancia.toFixed(3)}</Text>
              </Text>
            )}
            <Text style={styles.nota}>
              Umbral: {resultado.umbral}
              {resultado.margen ? ` · margen mínimo entre 1.º y 2.º: ${resultado.margen}` : ''}. Menor distancia = más parecido.
            </Text>
            {diagnostico ? <Text style={styles.nota}>{diagnostico}</Text> : null}
          </View>
        )}
      </CapturaRostroModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  intro: { color: colors.textMuted, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  estado: { fontSize: 20, fontWeight: '800', marginBottom: spacing.sm },
  linea: { color: colors.text, marginTop: 2 },
  num: { fontWeight: '700' },
  nota: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 },
  error: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
});
