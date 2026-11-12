import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type CodeSent, type User } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

type Channel = 'whatsapp' | 'sms';

export function PhoneVerify() {
  const { setUser } = useSession();
  const [phone, setPhone] = useState('+');
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = () => run(async () => {
    setSent(await api<CodeSent>('/phone/start', { body: { phone: phone.trim(), channel } }));
    setCode('');
  });
  const verify = () => run(async () => {
    const r = await api<{ user: User }>('/phone/verify', { body: { code: code.trim() } });
    setUser(r.user);
  });

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>Verify your phone to cash out</Text>
      <Text style={styles.muted}>We send a 6-digit code by WhatsApp or SMS. Mobile money payouts go to this number.</Text>
      {!sent ? (
        <>
          <View style={styles.row}>
            {(['whatsapp', 'sms'] as const).map((c) => (
              <Pressable key={c} onPress={() => setChannel(c)} style={[styles.chip, channel === c && styles.chipOn]}>
                <Text style={[styles.chipText, channel === c && { color: '#000' }]}>{c === 'whatsapp' ? 'WhatsApp' : 'SMS'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+255712345678"
            placeholderTextColor="#555"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
          />
          <Pressable style={styles.cta} onPress={send} disabled={busy}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Send code via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.muted}>Code sent to {sent.sentTo} via {sent.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.</Text>
          {sent.devCode && <Text style={styles.sandbox}>Sandbox mode, nothing sent. Your code: {sent.devCode}</Text>}
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            placeholderTextColor="#444"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            onSubmitEditing={verify}
          />
          <Pressable style={[styles.cta, code.trim().length !== 6 && { opacity: 0.5 }]} onPress={verify} disabled={busy || code.trim().length !== 6}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Verify phone</Text>}
          </Pressable>
          <View style={styles.row}>
            <Pressable onPress={send} disabled={busy}><Text style={styles.link}>Resend</Text></Pressable>
            <Pressable onPress={() => setSent(null)}><Text style={styles.link}>Change number</Text></Pressable>
          </View>
        </>
      )}
      {error && <Text style={{ color: C.danger }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: C.gold },
  h2: { color: C.text, fontSize: 16, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13 },
  sandbox: { color: C.gold, borderWidth: 1, borderColor: C.gold, borderRadius: 10, padding: 10, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontWeight: '700' },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  code: { fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  cta: { backgroundColor: C.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  ctaText: { color: '#000', fontWeight: '900' },
  link: { color: C.accent, fontWeight: '700', padding: 4 },
});
