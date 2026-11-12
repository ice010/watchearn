import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CodeSent } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

export default function Login() {
  const { user, login, register, verifyEmail, resendCode } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => run(async () => {
    const sent = mode === 'login' ? await login(email.trim(), password) : await register(email.trim(), password, name.trim() || undefined);
    if (sent) {
      setPending(sent);
      setCode('');
    }
  });

  const verify = () => run(() => verifyEmail(pending!.sentTo, code.trim()));
  const resend = () => run(async () => {
    const sent = await resendCode(pending!.sentTo);
    setPending({ ...pending!, ...sent });
    setInfo('A new code is on its way.');
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.inner}>
        <Text style={styles.logo}>Watch<Text style={{ color: C.accent }}>Earn</Text></Text>
        {pending ? (
          <>
            <Text style={styles.h1}>Check your email</Text>
            <Text style={styles.tag}>Enter the 6-digit code we sent to {pending.sentTo}.</Text>
            {pending.devCode && <Text style={styles.sandbox}>Sandbox mode, no email sent. Your code: {pending.devCode}</Text>}
            <TextInput
              style={[styles.input, styles.code]}
              placeholder="000000"
              placeholderTextColor="#444"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={verify}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            {info && <Text style={styles.info}>{info}</Text>}
            <Pressable style={[styles.cta, code.trim().length !== 6 && { opacity: 0.5 }]} onPress={verify} disabled={busy || code.trim().length !== 6}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Verify email</Text>}
            </Pressable>
            <Pressable onPress={resend} disabled={busy}><Text style={styles.switch}>Resend code</Text></Pressable>
            <Pressable onPress={() => setPending(null)}><Text style={styles.switch}>Use a different email</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={styles.tag}>Watch trailers, movies and shorts. Get paid to mobile money, bank or PayPal.</Text>
            {mode === 'register' && <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#666" value={name} onChangeText={setName} />}
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#666" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={styles.input} placeholder="Password (8+ characters)" placeholderTextColor="#666" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.cta} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>{mode === 'login' ? 'Sign in' : 'Create account'}</Text>}
            </Pressable>
            <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
              <Text style={styles.switch}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center' },
  inner: { padding: 24, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' },
  logo: { color: C.text, fontSize: 40, fontWeight: '900', textAlign: 'center' },
  h1: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  tag: { color: C.muted, textAlign: 'center', marginBottom: 16 },
  sandbox: { color: C.gold, textAlign: 'center', borderWidth: 1, borderColor: C.gold, borderRadius: 10, padding: 10 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  code: { fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: '800' },
  error: { color: C.danger },
  info: { color: C.accent },
  cta: { backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16 },
  switch: { color: C.muted, textAlign: 'center', marginTop: 8 },
});
