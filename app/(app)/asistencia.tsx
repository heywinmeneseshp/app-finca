import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import type { FincaAsistencia, ResultadoMarcacion, TipoMarcacion } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { EstadoChip } from '@/components/EstadoChip';
import { CapturaRostroModal } from '@/components/CapturaRostroModal';
import { SelectField } from '@/components/SelectField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { obtenerDescriptor, useMotorFacial } from '@/face/motor';
import { useUbicacion } from '@/hooks/useUbicacion';
import { cargarFincas, descartarConError, encolarMarcacion, resumenPendientes, sincronizarCola } from '@/services/asistencia.service';
import { kvGet, kvSet } from '@/services/db';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FINCA_KEY = 'asistencia.fincaSeleccionada';

interface Reciente {
  id: string;
  texto: string;
  ok: boolean;
}

// Marcar entrada/salida con el rostro. Funciona sin internet: el vector facial (números, no la foto) queda en el
// celular y se envía al servidor cuando hay señal; ahí se identifica a la persona.
export default function AsistenciaScreen() {
  const insets = useSafeAreaInsets();
  const [fincas, setFincas] = useState<FincaAsistencia[]>([]);
  const [fincaUuid, setFincaUuid] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoMarcacion>('ENTRADA');
  const [enLinea, setEnLinea] = useState(true);
  const [pendientes, setPendientes] = useState({ total: 0, conError: 0 });
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const sincronizando = useRef(false);
  const { ubicacion, gps } = useUbicacion();
  const motor = useMotorFacial((s) => s.estado);
  const motorMensaje = useMotorFacial((s) => s.mensaje);

  const refrescar = useCallback(async () => setPendientes(await resumenPendientes()), []);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      cargarFincas().then(async (lista) => {
        if (!activo) return;
        setFincas(lista);
        const guardada = await kvGet(FINCA_KEY);
        if (guardada && lista.some((f) => f.uuid === guardada)) setFincaUuid(guardada);
        else if (lista.length === 1) setFincaUuid(lista[0].uuid);
      });
      refrescar();
      return () => {
        activo = false;
      };
    }, [refrescar]),
  );

  const registrarReciente = (texto: string, ok: boolean) => setRecientes((r) => [{ id: `${Date.now()}`, texto, ok }, ...r].slice(0, 8));

  const sincronizar = useCallback(async (): Promise<Map<string, ResultadoMarcacion> | null> => {
    if (sincronizando.current) return null;
    sincronizando.current = true;
    try {
      return await sincronizarCola();
    } catch {
      return null; // sin conexión: todo sigue guardado en el celular
    } finally {
      sincronizando.current = false;
      refrescar();
    }
  }, [refrescar]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((estado) => {
      const conectado = Boolean(estado.isConnected && estado.isInternetReachable !== false);
      setEnLinea(conectado);
      if (conectado) sincronizar();
    });
    return unsub;
  }, [sincronizar]);

  const alFoto = async (base64: string) => {
    if (!fincaUuid) return;
    setMensaje(null);
    try {
      const { descriptor } = await obtenerDescriptor(base64);
      const uuid = await encolarMarcacion({
        fincaUuid,
        tipo,
        lat: ubicacion.current?.lat ?? null,
        lng: ubicacion.current?.lng ?? null,
        descriptor,
      });
      await kvSet(FINCA_KEY, fincaUuid);
      const resultados = await sincronizar();
      const r = resultados?.get(uuid);
      const etiqueta = tipo === 'ENTRADA' ? 'Entrada' : 'Salida';
      if (!r) {
        setMensaje({ texto: `${etiqueta} guardada. Se verificará al tener conexión.`, ok: true });
        registrarReciente(`${etiqueta} · pendiente de verificar`, true);
      } else if (r.estado === 'CREADA' && r.colaborador) {
        setMensaje({ texto: `${etiqueta} registrada: ${r.colaborador.nombre}`, ok: true });
        registrarReciente(`${etiqueta} · ${r.colaborador.nombre}`, true);
      } else if (r.estado === 'DUPLICADA') {
        setMensaje({ texto: `${r.colaborador?.nombre ?? 'Esta persona'} ya marcó hace un momento.`, ok: true });
      } else {
        const texto = r.estado === 'NO_RECONOCIDA' ? 'No se reconoció el rostro. Intenta de nuevo con más luz.' : r.estado === 'AMBIGUA' ? 'El rostro se parece a más de una persona. Intenta de nuevo.' : r.mensaje ?? 'No se pudo registrar.';
        setMensaje({ texto, ok: false });
        registrarReciente(`${etiqueta} · no registrada`, false);
      }
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo procesar el rostro.', ok: false });
    } finally {
      refrescar();
    }
  };

  const descartar = () =>
    Alert.alert('Descartar', `¿Descartar las ${pendientes.conError} marcación(es) que no se pudieron verificar?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: async () => {
          await descartarConError();
          refrescar();
        },
      },
    ]);

  const motorListo = motor === 'listo';

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={styles.estado}>
        <EstadoChip icono={enLinea ? 'wifi' : 'wifi-off'} texto={enLinea ? 'En línea' : 'Sin conexión'} color={enLinea ? colors.success : colors.warning} />
        <EstadoChip
          icono="map-pin"
          texto={gps === 'ok' ? 'GPS' : gps === 'buscando' ? 'Buscando GPS...' : 'GPS sin permiso'}
          color={gps === 'ok' ? colors.success : colors.warning}
        />
        <EstadoChip
          icono="user-check"
          texto={motorListo ? 'Reconocimiento listo' : motor === 'error' ? motorMensaje || 'Error del motor facial' : 'Preparando reconocimiento...'}
          color={motorListo ? colors.success : motor === 'error' ? colors.danger : colors.warning}
        />
      </View>

      <View style={styles.card}>
        <SelectField label="Finca" value={fincaUuid} options={fincas.map((f) => ({ value: f.uuid, label: f.nombre }))} onChange={setFincaUuid} />
        <Text style={styles.label}>Tipo de marcación</Text>
        <View style={styles.tipos}>
          {(['ENTRADA', 'SALIDA'] as const).map((t) => (
            <Pressable key={t} style={[styles.tipo, tipo === t && styles.tipoActivo]} onPress={() => setTipo(t)}>
              <Text style={[styles.tipoTexto, tipo === t && { color: '#fff' }]}>{t === 'ENTRADA' ? 'Entrada' : 'Salida'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Button label={`Abrir cámara para marcar ${tipo === 'ENTRADA' ? 'entrada' : 'salida'}`} onPress={() => { setMensaje(null); setAbierto(true); }} disabled={!fincaUuid || !motorListo} />
      </View>
      {!fincaUuid && <Text style={styles.ayuda}>Elige la finca para empezar.</Text>}

      <View style={styles.resumen}>
        <Text style={styles.resumenTexto}>
          Sin enviar: <Text style={styles.resumenNum}>{pendientes.total}</Text>
          {pendientes.conError > 0 ? ` (${pendientes.conError} con error)` : ''}
        </Text>
      </View>
      {pendientes.conError > 0 && <Button label="Descartar las que fallaron" variant="outline" onPress={descartar} />}

      {recientes.length > 0 && (
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.label}>Últimas marcaciones</Text>
          {recientes.map((r) => (
            <Text key={r.id} style={{ color: r.ok ? colors.text : colors.danger, paddingVertical: 2 }}>
              {r.texto}
            </Text>
          ))}
        </View>
      )}
      <CapturaRostroModal
        visible={abierto}
        titulo={tipo === 'ENTRADA' ? 'Marcar entrada' : 'Marcar salida'}
        instruccion="Mira de frente a la cámara"
        etiquetaBoton={tipo === 'ENTRADA' ? 'Marcar entrada' : 'Marcar salida'}
        onFoto={alFoto}
        onClose={() => setAbierto(false)}
      >
        {mensaje && (
          <View style={[styles.resultado, { backgroundColor: mensaje.ok ? '#e8f6ee' : '#fdecea' }]}>
            <Text style={{ color: mensaje.ok ? colors.primaryDark : colors.danger, fontWeight: '600' }}>{mensaje.texto}</Text>
          </View>
        )}
      </CapturaRostroModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  estado: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  tipos: { flexDirection: 'row', gap: spacing.sm },
  tipo: { flex: 1, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  tipoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  tipoTexto: { fontSize: 16, fontWeight: '700', color: colors.text },
  ayuda: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  resultado: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  resumen: { marginVertical: spacing.md, alignItems: 'center' },
  resumenTexto: { color: colors.textMuted },
  resumenNum: { color: colors.text, fontWeight: '700' },
});
