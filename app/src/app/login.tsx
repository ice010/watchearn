import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

export default function Login() {
  const { user, login, register } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.inner}>
        <Text style={styles.logo}>Watch<Text style={{ color: C.accent }}>Earn</Text></Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center' },
  inner: { padding: 24, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' },
  logo: { color: C.text, fontSize: 40, fontWeight: '900', textAlign: 'center' },
  tag: { color: C.muted, textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  error: { color: C.danger },
  cta: { backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16 },
  switch: { color: C.muted, textAlign: 'center', marginTop: 8 },
});
