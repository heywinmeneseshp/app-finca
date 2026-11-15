import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { asistenciaApi } from '@/api/asistencia.api';
import type { FincaAsistencia, LugarAsistencia, UsuarioBasico } from '@/api/asistencia.api';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/SelectField';
import { CargoSelectField } from '@/components/CargoSelectField';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Crea un colaborador: nombre, apellido, identificación y lugar predeterminado (finca u oficina). Es solo el habitual: el
// colaborador puede marcar asistencia en cualquier otro lugar. Con fincas asignadas, la API exige una de esas fincas.
export default function CrearColaboradorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fincas, setFincas] = useState<FincaAsistencia[]>([]);
  const [lugares, setLugares] = useState<LugarAsistencia[]>([]);
  const puedeUsuarios = useSessionStore((s) => s.hasPermission)('menu.maestros.usuarios');
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [cargo, setCargo] = useState('');
  const [sitio, setSitio] = useState<string | null>(null); // "f:<uuid>" finca o "l:<uuid>" oficina
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      asistenciaApi
        .rostrosEstado()
        .then((r) => {
          setFincas(r.fincas);
          setLugares(r.lugares ?? []);
          // Usuarios que todavía no están vinculados a un colaborador.
          if (puedeUsuarios) {
            const vinculados = new Set(r.colaboradores.map((c) => c.userUuid).filter(Boolean));
            asistenciaApi
              .listarUsuarios()
              .then((u) => setUsuarios(u.items.filter((x) => !vinculados.has(x.uuid))))
              .catch(() => {});
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las fincas. Se necesita conexión.'));
    }, [puedeUsuarios]),
  );

  // Al elegir un usuario se copian sus datos; el colaborador queda vinculado a él.
  const elegirUsuario = (uuid: string) => {
    setUserUuid(uuid);
    const u = usuarios.find((x) => x.uuid === uuid);
    if (!u) return;
    setNombre(u.nombre);
    setApellido(u.apellido ?? '');
    setEmail(u.email ?? '');
    setCargo(u.cargo ?? '');
  };

  const guardar = async () => {
    if (!nombre.trim() || !apellido.trim() || !documento.trim() || !telefono.trim() || !email.trim() || !cargo.trim()) {
      setError('Completa nombre, apellido, identificación, cargo, número y correo.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await asistenciaApi.crearColaborador({ nombre: nombre.trim(), apellido: apellido.trim(), documento: documento.trim(), telefono: telefono.trim(), email: email.trim(), cargo: cargo.trim(), ...(sitio ? (sitio.startsWith('l:') ? { lugarUuid: sitio.slice(2) } : { fincaUuid: sitio.slice(2) }) : {}), ...(userUuid ? { userUuid } : {}) });
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
        {puedeUsuarios && usuarios.length > 0 ? (
          <>
            <SelectField
              label="Crear a partir de un usuario (opcional)"
              value={userUuid}
              options={usuarios.map((u) => ({ value: u.uuid, label: `${u.nombre} ${u.apellido} · ${u.usuario}` }))}
              placeholder="Sin usuario"
              onChange={elegirUsuario}
            />
            {userUuid ? (
              <Text style={styles.ayuda} onPress={() => setUserUuid(null)}>
                Quitar el usuario seleccionado
              </Text>
            ) : null}
          </>
        ) : null}
        <TextField label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
        <TextField label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" />
        <TextField label="Identificación" value={documento} onChangeText={setDocumento} keyboardType="number-pad" />
        <CargoSelectField value={cargo} onChange={setCargo} permitirNuevo />
        <TextField label="Número de teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
        <TextField label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <SelectField
          label="Lugar predeterminado (opcional)"
          value={sitio}
          options={[...fincas.map((f) => ({ value: `f:${f.uuid}`, label: f.nombre })), ...lugares.map((l) => ({ value: `l:${l.uuid}`, label: `${l.nombre} · oficina/otro` }))]}
          onChange={setSitio}
        />
        <Text style={styles.ayuda}>Es la finca u oficina habitual del colaborador; puede marcar asistencia en cualquier otro lugar.</Text>
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
