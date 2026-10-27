import { Image, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FaceEngine } from '@/components/FaceEngine';
import { colors } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';

export default function AppLayout() {
  const hasPermission = useSessionStore((s) => s.hasPermission);
  const router = useRouter();
  // El motor facial solo se carga para quien usa funciones de rostro (consume memoria al iniciar).
  const usaRostro = hasPermission('asistencia.marcar') || hasPermission('asistencia.marcar_cuadrilla') || hasPermission('colaborador.editar');
  return (
    <>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primaryDarker },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        // Icono de perfil a la derecha en todas las pantallas.
        headerRight: () => (
          <Pressable onPress={() => router.push('/perfil')} hitSlop={10} accessibilityLabel="Perfil">
            <Feather name="user" size={22} color="#fff" />
          </Pressable>
        ),
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'BR Fincas',
          headerLeft: () => <Image source={require('../../assets/icon.png')} style={{ width: 30, height: 30, borderRadius: 6, marginRight: 4 }} />,
        }}
      />
      <Stack.Screen name="perfil" options={{ title: 'Perfil' }} />
      <Stack.Screen name="precalibrador" options={{ title: 'Precalibrador' }} />
      <Stack.Screen name="colaboradores" options={{ title: 'Colaboradores' }} />
      <Stack.Screen name="crear-colaborador" options={{ title: 'Nuevo colaborador' }} />
      <Stack.Screen name="asistencia" options={{ title: 'Asistencia' }} />
      <Stack.Screen name="enrolar-rostro" options={{ title: 'Registrar rostro' }} />
      <Stack.Screen name="prueba-rostro" options={{ title: 'Prueba de reconocimiento' }} />
    </Stack>
    {usaRostro && <FaceEngine />}
    </>
  );
}
