import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import type { OpcionCinta, OpcionesPrecalibracion } from '@/api/precalibracion.api';
import { Button } from '@/components/Button';
import { EstadoChip } from '@/components/EstadoChip';
import { SelectField } from '@/components/SelectField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cargarOpciones,
  deshacerRegistro,
  registrarRacimo,
  resumenPendientes,
  sincronizarCola,
} from '@/services/precalibracion.service';

const SYNC_CADA = 25; // registros nuevos entre envíos automáticos (si hay conexión)

// Color de texto legible sobre el fondo de la cinta.
const textoSobre = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111827' : '#ffffff';
};

export default function PrecalibradorScreen() {
  const insets = useSafeAreaInsets();
  const [opciones, setOpciones] = useState<OpcionesPrecalibracion | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [fincaId, setFincaId] = useState<string | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [valor, setValor] = useState<string | null>(null);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [historial, setHistorial] = useState<{ uuid: string; cintaId: string }[]>([]);
  const [pendientes, setPendientes] = useState({ total: 0, conError: 0 });
  const [enLinea, setEnLinea] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [gps, setGps] = useState<'buscando' | 'ok' | 'sin-permiso'>('buscando');
  const ubicacion = useRef<{ lat: number; lng: number } | null>(null);
  const sincronizandoRef = useRef(false);
  const desdeUltimoSync = useRef(0);

  const refrescarPendientes = useCallback(async () => setPendientes(await resumenPendientes()), []);

  // Catálogos: se piden cada vez que se abre la pantalla (si no hay red, se usa lo último guardado).
  useFocusEffect(
    useCallback(() => {
      let activo = true;
      cargarOpciones().then(({ opciones: o, desdeCache: c }) => {
        if (!activo) return;
        setOpciones(o);
        setDesdeCache(c);
        setCargando(false);
      });
      refrescarPendientes();
      return () => {
        activo = false;
      };
    }, [refrescarPendientes]),
  );

  // GPS: se mantiene la última posición para que cada toque la use sin esperar.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelado = false;
    (async () => {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        if (!cancelado) setGps('sin-permiso');
        return;
      }
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima && !cancelado) {
        ubicacion.current = { lat: ultima.coords.latitude, lng: ultima.coords.longitude };
        setGps('ok');
      }
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 2 }, (p) => {
        ubicacion.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        setGps('ok');
      });
    })();
    return () => {
      cancelado = true;
      sub?.remove();
    };
  }, []);

  const sincronizar = useCallback(
    async (manual: boolean) => {
      if (sincronizandoRef.current) return;
      sincronizandoRef.current = true;
      setSincronizando(true);
      try {
        const r = await sincronizarCola();
        desdeUltimoSync.current = 0;
        // Lo ya enviado no se puede deshacer: se limpia el historial de deshacer.
        setHistorial([]);
        if (manual) {
          Alert.alert(
            'Sincronización',
            r.errores > 0
              ? `Enviados: ${r.enviados}. ${r.errores} registro(s) fueron rechazados por el servidor.`
              : `Enviados: ${r.enviados}. Todo está al día.`,
          );
        }
      } catch {
        if (manual) Alert.alert('Sin conexión', 'No se pudo enviar. Los registros siguen guardados en el dispositivo.');
      } finally {
        sincronizandoRef.current = false;
        setSincronizando(false);
        refrescarPendientes();
      }
    },
    [refrescarPendientes],
  );

  // Al recuperar la conexión se envía lo pendiente.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((estado) => {
      const conectado = Boolean(estado.isConnected && estado.isInternetReachable !== false);
      setEnLinea(conectado);
      if (conectado) sincronizar(false);
    });
    return unsub;
  }, [sincronizar]);

  const lotes = useMemo(() => (opciones && fincaId ? opciones.lotes.filter((l) => l.fincaId === fincaId) : []), [opciones, fincaId]);
  // Solo las cintas y calibres habilitados para la finca elegida (configuración de la web); sin config, todos.
  const configFinca = fincaId ? opciones?.configPorFinca?.[fincaId] : undefined;
  const cintas = useMemo(
    () => (opciones?.cintas ?? []).filter((c) => c.semanaEmbolseUuid && (!configFinca || configFinca.edades.includes(c.edad))),
    [opciones, configFinca],
  );
  const valoresFinca = useMemo(
    () => (opciones?.valores ?? []).filter((v) => !configFinca || configFinca.valores.includes(v.id)),
    [opciones, configFinca],
  );
  const listo = Boolean(fincaId && loteId && valor);
  const totalSesion = Object.values(conteo).reduce((a, b) => a + b, 0);

  const tocarCinta = async (cinta: OpcionCinta) => {
    if (!listo || !cinta.semanaEmbolseUuid) return;
    const uuid = await registrarRacimo({
      fincaUuid: fincaId!,
      loteUuid: loteId!,
      semanaEmbolseUuid: cinta.semanaEmbolseUuid,
      valor: valor!,
      lat: ubicacion.current?.lat ?? null,
      lng: ubicacion.current?.lng ?? null,
    });
    Vibration.vibrate(30);
    setConteo((c) => ({ ...c, [cinta.id]: (c[cinta.id] ?? 0) + 1 }));
    setHistorial((h) => [...h, { uuid, cintaId: cinta.id }]);
    setPendientes((p) => ({ ...p, total: p.total + 1 }));
    desdeUltimoSync.current += 1;
    if (enLinea && desdeUltimoSync.current >= SYNC_CADA) sincronizar(false);
  };

  const deshacer = async () => {
    const ultimo = historial[historial.length - 1];
    if (!ultimo) return;
    const quitado = await deshacerRegistro(ultimo.uuid);
    if (!quitado) {
      Alert.alert('Ya enviado', 'Ese registro ya se envió al servidor y no se puede deshacer desde la app.');
      setHistorial([]);
      return;
    }
    setConteo((c) => ({ ...c, [ultimo.cintaId]: Math.max(0, (c[ultimo.cintaId] ?? 0) - 1) }));
    setHistorial((h) => h.slice(0, -1));
    refrescarPendientes();
  };

  if (cargando) {
    return (
      <View style={styles.centro}>
        <Text style={{ color: colors.textMuted }}>Cargando...</Text>
      </View>
    );
  }

  if (!opciones) {
    return (
      <View style={styles.centro}>
        <Text style={styles.sinDatos}>No hay datos guardados. Conéctate a internet una vez para descargar las fincas y los lotes.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.xl + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <View style={styles.estado}>
        <EstadoChip icono={enLinea ? 'wifi' : 'wifi-off'} texto={enLinea ? 'En línea' : 'Sin conexión'} color={enLinea ? colors.success : colors.warning} />
        <EstadoChip
          icono="map-pin"
          texto={gps === 'ok' ? 'GPS' : gps === 'buscando' ? 'Buscando GPS...' : 'GPS sin permiso'}
          color={gps === 'ok' ? colors.success : colors.warning}
        />
        {desdeCache && <EstadoChip icono="database" texto="Catálogos guardados" color={colors.textMuted} />}
      </View>

      <View style={styles.card}>
        <SelectField
          label="Finca"
          value={fincaId}
          options={opciones.fincas.map((f) => ({ value: f.id, label: f.nombre }))}
          onChange={(v) => {
            setFincaId(v);
            setValor((actual) => (actual && opciones.configPorFinca?.[v] && !opciones.configPorFinca[v].valores.includes(actual) ? null : actual));
            setLoteId(null);
          }}
        />
        <SelectField
          label="Lote"
          value={loteId}
          disabled={!fincaId}
          placeholder={fincaId ? 'Selecciona' : 'Primero elige la finca'}
          options={lotes.map((l) => ({ value: l.id, label: l.nombre }))}
          onChange={setLoteId}
        />
        <Text style={styles.label}>Valor del calibrador</Text>
        <View style={styles.chips}>
          {valoresFinca.map((v) => (
            <Pressable key={v.id} style={[styles.valorChip, valor === v.id && styles.valorChipActivo]} onPress={() => setValor(v.id)}>
              <Text style={[styles.valorTexto, valor === v.id && { color: '#fff' }]}>{v.codigo}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.seccion}>Toca la cinta del racimo apto</Text>
      <View style={styles.grid}>
        {cintas.map((c, i) => (
          <Pressable
            key={c.id}
            disabled={!listo}
            onPress={() => tocarCinta(c)}
            style={({ pressed }) => [styles.cinta, cintas.length % 2 === 1 && i === cintas.length - 1 && styles.cintaAncha, { backgroundColor: c.color }, !listo && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={[styles.cintaNombre, { color: textoSobre(c.color) }]}>{c.nombre.toUpperCase()}</Text>
            <Text style={[styles.cintaDetalle, { color: textoSobre(c.color) }]}>
              {c.embolseCodigo} · Edad {c.edad}
            </Text>
            <Text style={[styles.cintaConteo, { color: textoSobre(c.color) }]}>{conteo[c.id] ?? 0}</Text>
          </Pressable>
        ))}
      </View>
      {!listo && <Text style={styles.ayuda}>Elige finca, lote y valor del calibrador para empezar.</Text>}

      <View style={styles.resumen}>
        <Text style={styles.resumenTexto}>
          En esta sesión: <Text style={styles.resumenNum}>{totalSesion}</Text> · Sin enviar: <Text style={styles.resumenNum}>{pendientes.total}</Text>
          {pendientes.conError > 0 ? ` (${pendientes.conError} con error)` : ''}
        </Text>
      </View>

      <View style={styles.acciones}>
        <View style={{ flex: 1 }}>
          <Button label="Deshacer último" variant="outline" onPress={deshacer} disabled={historial.length === 0} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={sincronizando ? 'Enviando...' : 'Sincronizar'} onPress={() => sincronizar(true)} loading={sincronizando} disabled={pendientes.total === 0} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sinDatos: { color: colors.textMuted, textAlign: 'center' },
  estado: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm },
  valorChip: { flex: 1, minHeight: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  valorChipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  valorTexto: { fontSize: 18, fontWeight: '700', color: colors.text },
  seccion: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Con cantidad impar de cintas (hasta 5 edades), la última ocupa todo el ancho.
  cintaAncha: { width: '100%', minHeight: 100 },
  cinta: { width: '47.5%', minHeight: 130, borderRadius: radius.lg, padding: spacing.md, justifyContent: 'space-between', ...shadow.sm },
  cintaNombre: { fontSize: 16, fontWeight: '800' },
  cintaDetalle: { fontSize: 12, opacity: 0.9 },
  cintaConteo: { fontSize: 34, fontWeight: '800', textAlign: 'right' },
  ayuda: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  resumen: { marginTop: spacing.lg, alignItems: 'center' },
  resumenTexto: { color: colors.textMuted },
  resumenNum: { color: colors.text, fontWeight: '700' },
  acciones: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
