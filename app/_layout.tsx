import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setUnauthorizedHandler } from '@/api/client';
import { colors } from '@/constants/theme';
import { useSessionStore } from '@/stores/useSessionStore';

export default function RootLayout() {
  const status = useSessionStore((s) => s.status);
  const user = useSessionStore((s) => s.user);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const clearLocalSession = useSessionStore((s) => s.clearLocalSession);

  useEffect(() => {
    setUnauthorizedHandler(clearLocalSession);
    bootstrap();
  }, [bootstrap, clearLocalSession]);

  if (status !== 'ready') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
