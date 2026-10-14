import { Stack } from 'expo-router';
import { FaceEngine } from '@/components/FaceEngine';
import { colors } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';

export default function AppLayout() {
  const hasPermission = useSessionStore((s) => s.hasPermission);
  // El motor facial solo se carga para quien usa funciones de rostro (consume memoria al iniciar).
  const usaRostro = hasPermission('asistencia.marcar') || hasPermission('asistencia.marcar_cuadrilla') || hasPermission('colaborador.editar');
  return (
    <>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primaryDarker },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Corbana Finca' }} />
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
