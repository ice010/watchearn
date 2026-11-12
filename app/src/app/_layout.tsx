import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { RewardProvider } from '@/lib/reward';
import { SessionProvider } from '@/lib/session';
import { C } from '@/lib/theme';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <SessionProvider>
        <RewardProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" />
            <Stack.Screen name="kyc" />
            <Stack.Screen name="watch/[id]" options={{ presentation: 'fullScreenModal' }} />
          </Stack>
        </RewardProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
