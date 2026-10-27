import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as ScreenOrientation from 'expo-screen-orientation';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import type { ModalidadPrecalibracion, OpcionCinta, OpcionesPrecalibracion, SesionPrecalibracion } from '@/api/precalibracion.api';
import { detenerTrazaBackground, iniciarTrazaBackground } from '@/services/trazaBackground';
import { Button } from '@/components/Button';
import { EstadoChip } from '@/components/EstadoChip';
import { SelectField } from '@/components/SelectField';
import { colors, radius, shadow, spacing } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cargarOpciones,
  cargarSesionActiva,
  deshacerRegistro,
  finalizarSesion,
  guardarPuntoTraza,
  guardarSesionActiva,
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
  const { width: ancho, height: alto } = useWindowDimensions();
  const [opciones, setOpciones] = useState<OpcionesPrecalibracion | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [fincaId, setFincaId] = useState<string | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [valor, setValor] = useState<string | null>(null);
  const [sesion, setSesion] = useState<SesionPrecalibracion | null>(null);
  const [enConteo, setEnConteo] = useState(false); // pantalla completa de cintas mientras hay sesión
  // El conteo gira libremente (vertical u horizontal); el resto de la pantalla queda vertical.
  useEffect(() => {
    ScreenOrientation.lockAsync(enConteo ? ScreenOrientation.OrientationLock.DEFAULT : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [enConteo]);
  // Tras cada toque, todas las cintas quedan bloqueadas 10 s con cuenta regresiva (evita contar dos veces el mismo racimo).
  const [bloqueoHasta, setBloqueoHasta] = useState(0);
  const segundosEspera = (fincaId ? opciones?.configPorFinca?.[fincaId]?.segundosEspera : undefined) ?? 10;
  const [ahoraMs, setAhoraMs] = useState(Date.now());
  const restante = Math.max(0, Math.ceil((bloqueoHasta - ahoraMs) / 1000));
  useEffect(() => {
    if (bloqueoHasta <= Date.now()) return undefined;
    const id = setInterval(() => {
      setAhoraMs(Date.now());
      if (Date.now() >= bloqueoHasta) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [bloqueoHasta]);
  const sesionRef = useRef<SesionPrecalibracion | null>(null);
  sesionRef.current = sesion;
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

  // Si se cerró la app con una sesión abierta, se retoma tal cual estaba.
  useEffect(() => {
    cargarSesionActiva().then((activa) => {
      if (!activa) return;
      setSesion(activa.sesion);
      setEnConteo(true);
      setFincaId(activa.fincaId);
      setLoteId(activa.loteId);
      setValor(activa.valor);
    });
  }, []);

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
        if (sesionRef.current) guardarPuntoTraza(sesionRef.current.uuid, p.coords.latitude, p.coords.longitude, p.coords.accuracy ?? null).catch(() => {});
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

  // La modalidad no se elige aquí: la define la configuración de la finca en la web.
  const modalidad: ModalidadPrecalibracion = (fincaId ? opciones?.configPorFinca?.[fincaId]?.modalidad : undefined) ?? 'VIGENTE';
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
  const listo = Boolean(fincaId && loteId && valor && sesion);
  const puedeIniciar = Boolean(fincaId && loteId && valor && !sesion);
  const totalSesion = Object.values(conteo).reduce((a, b) => a + b, 0);

  const tocarCinta = async (cinta: OpcionCinta) => {
    if (!listo || !cinta.semanaEmbolseUuid || restante > 0) return;
    setAhoraMs(Date.now());
    if (segundosEspera > 0) setBloqueoHasta(Date.now() + segundosEspera * 1000);
    const uuid = await registrarRacimo({
      fincaUuid: fincaId!,
      loteUuid: loteId!,
      semanaEmbolseUuid: cinta.semanaEmbolseUuid,
      valor: valor!,
      sesion: sesion!,
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

  const iniciarSesion = async () => {
    if (!puedeIniciar) return;
    const nueva: SesionPrecalibracion = { uuid: Crypto.randomUUID(), tipo: modalidad, inicio: new Date().toISOString() };
    await guardarSesionActiva({ sesion: nueva, fincaId: fincaId!, loteId: loteId!, valor: valor! });
    setConteo({});
    setHistorial([]);
    setSesion(nueva);
    setEnConteo(true);
    iniciarTrazaBackground().then((ok) => {
      if (!ok) Alert.alert('Recorrido en segundo plano', 'Sin permiso de ubicación "Permitir siempre" (o sin build propia), el recorrido solo se guarda con la app abierta en pantalla.');
    });
  };

  const terminarSesion = () => {
    if (!sesion) return;
    Alert.alert('Finalizar sesión', `Llevas ${totalSesion} racimos. ¿Finalizar la sesión ${sesion.tipo === 'VIGENTE' ? 'vigente' : 'anticipada'}?`, [
      { text: 'Seguir', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          await finalizarSesion(sesion.uuid);
          await detenerTrazaBackground();
          setSesion(null);
          setEnConteo(false);
          if (enLinea) sincronizar(false);
        },
      },
    ]);
  };

  // Cada sesión es de un solo lote: al cambiar, se cierra la actual y se inicia otra en el lote elegido, sin salir del conteo.
  const [eligiendoLote, setEligiendoLote] = useState(false);
  const cambiarA = (nuevoLoteId: string) => {
    if (!sesion || !fincaId || !valor) return;
    const nombre = lotes.find((l) => l.id === nuevoLoteId)?.nombre ?? '';
    Alert.alert('Cambiar de lote', `Se cerrará la sesión actual (${totalSesion} racimos) y empezará otra en el lote ${nombre}.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cambiar',
        onPress: async () => {
          await finalizarSesion(sesion.uuid);
          const nueva: SesionPrecalibracion = { uuid: Crypto.randomUUID(), tipo: sesion.tipo, inicio: new Date().toISOString() };
          await guardarSesionActiva({ sesion: nueva, fincaId, loteId: nuevoLoteId, valor });
          setLoteId(nuevoLoteId);
          setConteo({});
          setHistorial([]);
          setSesion(nueva);
          setEligiendoLote(false);
          if (enLinea) sincronizar(false);
        },
      },
    ]);
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

  if (sesion && enConteo) {
    // Vertical: 2 cuadros por fila. Horizontal: caben más (hasta 3 en una sola fila; con más se reparten en dos filas).
    const horizontal = ancho > alto;
    const porFila = !horizontal ? 2 : cintas.length <= 3 ? cintas.length : Math.ceil(cintas.length / 2);
    const filas: typeof cintas[] = [];
    for (let i = 0; i < cintas.length; i += porFila) filas.push(cintas.slice(i, i + porFila));
    return (
      <View
        style={[
          styles.conteo,
          { paddingTop: spacing.md + insets.top, paddingBottom: spacing.md + insets.bottom, paddingLeft: spacing.md + insets.left, paddingRight: spacing.md + insets.right },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.conteoBarra}>
          <Pressable style={styles.barraIcono} onPress={() => setEnConteo(false)} hitSlop={8} accessibilityLabel="Regresar">
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.barraTitulo}>
            <Text style={styles.barraLote} numberOfLines={1}>
              Lote {lotes.find((l) => l.id === loteId)?.nombre ?? ''}
            </Text>
            <Text style={styles.barraSub} numberOfLines={1}>
              {opciones.fincas.find((f) => f.id === fincaId)?.nombre ?? ''} · {sesion.tipo === 'VIGENTE' ? 'Vigente' : 'Anticipada'}
            </Text>
          </View>
          <View style={styles.barraContador}>
            <Text style={styles.barraContadorNum}>{totalSesion}</Text>
            <Text style={styles.barraContadorEtq}>racimos</Text>
          </View>
          <Pressable style={styles.barraBoton} onPress={() => setEligiendoLote(true)}>
            <Feather name="repeat" size={16} color={colors.primary} />
            <Text style={styles.barraBotonTexto}>Cambiar lote</Text>
          </Pressable>
          <Pressable style={[styles.barraBoton, { marginLeft: 'auto' }, historial.length === 0 && { opacity: 0.4 }]} onPress={deshacer} disabled={historial.length === 0}>
            <Feather name="rotate-ccw" size={16} color={colors.primary} />
            <Text style={styles.barraBotonTexto}>Deshacer</Text>
          </Pressable>
        </View>
        {eligiendoLote && (
          <View style={styles.loteCapa}>
            <View style={styles.loteCapaCaja}>
              <Text style={styles.seccion}>Elige el nuevo lote</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.loteLista}>
                  {lotes
                    .filter((l) => l.id !== loteId)
                    .map((l) => (
                      <Pressable key={l.id} style={styles.valorChip} onPress={() => cambiarA(l.id)}>
                        <Text style={styles.valorTexto}>{l.nombre}</Text>
                      </Pressable>
                    ))}
                </View>
              </ScrollView>
              <Button label="Cancelar" variant="outline" onPress={() => setEligiendoLote(false)} />
            </View>
          </View>
        )}
        <View style={styles.conteoGrid}>
          {filas.map((fila, i) => (
            <View key={i} style={styles.conteoFila}>
              {fila.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => tocarCinta(c)}
                  disabled={restante > 0}
                  style={({ pressed }) => [styles.conteoCinta, { backgroundColor: c.color }, restante > 0 && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <Text style={[styles.cintaNombre, { color: textoSobre(c.color) }]}>{c.nombre.toUpperCase()}</Text>
                  <Text style={[styles.cintaDetalle, { color: textoSobre(c.color) }]}>
                    {c.embolseCodigo} · Edad {c.edad}
                  </Text>
                  <Text style={[styles.conteoNumero, { color: textoSobre(c.color) }]}>{restante > 0 ? `${restante} s` : (conteo[c.id] ?? 0)}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const nombreFinca = opciones.fincas.find((f) => f.id === fincaId)?.nombre ?? '';
  const nombreLote = lotes.find((l) => l.id === loteId)?.nombre ?? '';
  const faltante = !fincaId ? 'Elige la finca' : !loteId ? 'Elige el lote' : !valor ? 'Elige el valor del calibrador' : '';
  const horaInicio = sesion ? new Date(sesion.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: true }} />
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View style={styles.estado}>
          <EstadoChip icono={enLinea ? 'wifi' : 'wifi-off'} texto={enLinea ? 'En línea' : 'Sin conexión'} color={enLinea ? colors.success : colors.warning} />
          <EstadoChip
            icono="map-pin"
            texto={gps === 'ok' ? 'GPS listo' : gps === 'buscando' ? 'Buscando GPS...' : 'GPS sin permiso'}
            color={gps === 'ok' ? colors.success : colors.warning}
          />
          {desdeCache && <EstadoChip icono="database" texto="Catálogos guardados" color={colors.textMuted} />}
        </View>

        {sesion ? (
          <View style={styles.sesionCard}>
            <View style={styles.sesionPunto} />
            <Text style={styles.sesionEtiqueta}>SESIÓN EN CURSO · {sesion.tipo === 'VIGENTE' ? 'VIGENTE' : 'ANTICIPADA'}</Text>
            <Text style={styles.sesionLote}>Lote {nombreLote}</Text>
            <Text style={styles.sesionFinca}>
              {nombreFinca} · desde las {horaInicio}
            </Text>
            <Text style={styles.sesionNumero}>{totalSesion}</Text>
            <Text style={styles.sesionNumeroEtiqueta}>racimos aptos contados</Text>
          </View>
        ) : (
          <>
            <View style={styles.paso}>
              <View style={styles.pasoCabecera}>
                <View style={[styles.pasoNumero, fincaId && loteId && styles.pasoNumeroListo]}>
                  <Text style={styles.pasoNumeroTexto}>1</Text>
                </View>
                <Text style={styles.pasoTitulo}>¿Dónde vas a trabajar?</Text>
              </View>
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
            </View>

            <View style={styles.paso}>
              <View style={styles.pasoCabecera}>
                <View style={[styles.pasoNumero, Boolean(valor) && styles.pasoNumeroListo]}>
                  <Text style={styles.pasoNumeroTexto}>2</Text>
                </View>
                <Text style={styles.pasoTitulo}>Valor del calibrador</Text>
              </View>
              {fincaId ? (
                <View style={styles.chips}>
                  {valoresFinca.map((v) => (
                    <Pressable key={v.id} style={[styles.valorGrande, valor === v.id && styles.valorChipActivo]} onPress={() => setValor(v.id)}>
                      <Text style={[styles.valorGrandeTexto, valor === v.id && { color: '#fff' }]}>{v.codigo}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.pasoAyuda}>Elige primero la finca.</Text>
              )}
            </View>

            {Boolean(fincaId) && (
              <View style={styles.modalidadAviso}>
                <Feather name="info" size={16} color={colors.primary} />
                <Text style={styles.modalidadAvisoTexto}>
                  Modalidad <Text style={{ fontWeight: '800' }}>{modalidad === 'VIGENTE' ? 'vigente' : 'anticipada'}</Text>
                  {modalidad === 'VIGENTE' ? ': se cosecha esta semana.' : ': se cosecha la semana siguiente.'}
                </Text>
              </View>
            )}
          </>
        )}

        {(pendientes.total > 0 || sesion) && (
          <View style={styles.sync}>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncTitulo}>{pendientes.total > 0 ? `${pendientes.total} registro(s) sin enviar` : 'Todo enviado'}</Text>
              <Text style={styles.syncAyuda}>
                {pendientes.conError > 0 ? `${pendientes.conError} con error. ` : ''}
                {enLinea ? 'Se envían solos con conexión.' : 'Se enviarán al volver la conexión.'}
              </Text>
            </View>
            <View style={{ minWidth: 120 }}>
              <Button label={sincronizando ? 'Enviando...' : 'Sincronizar'} variant="outline" onPress={() => sincronizar(true)} loading={sincronizando} disabled={pendientes.total === 0} />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.pie, { paddingBottom: spacing.md + insets.bottom }]}>
        {sesion ? (
          <>
            <Pressable style={styles.cta} onPress={() => setEnConteo(true)}>
              <Text style={styles.ctaTexto}>Continuar contando</Text>
            </Pressable>
            <Pressable style={styles.ctaSecundario} onPress={terminarSesion} hitSlop={8}>
              <Text style={styles.ctaSecundarioTexto}>Finalizar sesión</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.cta, !puedeIniciar && { opacity: 0.45 }]} onPress={iniciarSesion} disabled={!puedeIniciar}>
              <Text style={styles.ctaTexto}>Iniciar sesión</Text>
            </Pressable>
            {Boolean(faltante) && <Text style={styles.pieAyuda}>{faltante} para empezar.</Text>}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalidadAviso: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.md },
  modalidadAvisoTexto: { flex: 1, color: colors.textMuted, fontSize: 13 },
  paso: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, ...shadow.sm },
  pasoCabecera: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  pasoNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  pasoNumeroListo: { backgroundColor: colors.primary },
  pasoNumeroTexto: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pasoTitulo: { fontSize: 16, fontWeight: '800', color: colors.text },
  pasoAyuda: { color: colors.textMuted, fontSize: 13 },
  valorGrande: { flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  valorGrandeTexto: { fontSize: 24, fontWeight: '800', color: colors.text },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, marginBottom: spacing.sm },
  opcionActiva: { borderColor: colors.primary, backgroundColor: '#ecfdf3' },
  opcionTitulo: { fontSize: 16, fontWeight: '700', color: colors.text },
  opcionAyuda: { fontSize: 13, color: colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActivo: { borderColor: colors.primary },
  radioPunto: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  sesionCard: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'center', ...shadow.sm },
  sesionPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80', marginBottom: spacing.sm },
  sesionEtiqueta: { color: '#bbf7d0', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  sesionLote: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: spacing.sm },
  sesionFinca: { color: '#d1fae5', fontSize: 14, marginTop: 2 },
  sesionNumero: { color: '#fff', fontSize: 64, fontWeight: '800', marginTop: spacing.md },
  sesionNumeroEtiqueta: { color: '#bbf7d0', fontSize: 13 },
  sync: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  syncTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  syncAyuda: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pie: { paddingHorizontal: spacing.md, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', gap: spacing.sm },
  pieAyuda: { color: colors.textMuted, fontSize: 13 },
  cta: { alignSelf: 'stretch', minHeight: 56, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaTexto: { color: '#fff', fontSize: 18, fontWeight: '800' },
  ctaSecundario: { paddingVertical: spacing.xs },
  ctaSecundarioTexto: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  conteoLote: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text, marginHorizontal: spacing.md },
  loteCapa: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  loteCapaCaja: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, width: '80%', maxHeight: '100%', gap: spacing.sm },
  loteLista: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  conteo: { flex: 1, padding: spacing.md, backgroundColor: colors.background },
  conteoBarra: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  barraIcono: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  barraTitulo: { flex: 1, minWidth: 120 },
  barraLote: { fontSize: 20, fontWeight: '800', color: colors.text },
  barraSub: { fontSize: 13, color: colors.textMuted },
  barraContador: { alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 4, minWidth: 72 },
  barraContadorNum: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 },
  barraContadorEtq: { color: '#bbf7d0', fontSize: 11, fontWeight: '600' },
  barraBoton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  barraBotonTexto: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  conteoVolver: { paddingVertical: spacing.xs },
  conteoVolverTexto: { fontSize: 16, fontWeight: '700', color: colors.primary },
  conteoGrid: { flex: 1, gap: spacing.md },
  conteoFila: { flex: 1, flexDirection: 'row', gap: spacing.md },
  conteoCinta: { flex: 1, borderRadius: radius.lg, padding: spacing.md, justifyContent: 'space-between', ...shadow.sm },
  conteoNumero: { fontSize: 48, fontWeight: '800', textAlign: 'right' },
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sinDatos: { color: colors.textMuted, textAlign: 'center' },
  estado: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm },
  valorChip: { flex: 1, minHeight: 38, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  valorChipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  valorTexto: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalidadTexto: { fontSize: 15, fontWeight: '700', color: colors.text },
  modalidadAyuda: { color: colors.textMuted, fontSize: 12, marginVertical: spacing.sm },
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
