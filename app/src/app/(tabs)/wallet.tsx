import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhoneVerify } from '@/components/phone-verify';
import { api, type CodeSent, type LedgerEntry, type Wallet, type Withdrawal } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

type Method = 'mobile_money' | 'bank' | 'paypal';
const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: 'mobile_money', label: 'Mobile money', hint: 'M-Pesa, Airtel, MTN, Tigo… via Flutterwave' },
  { key: 'bank', label: 'Bank transfer', hint: 'Local bank account via Flutterwave' },
  { key: 'paypal', label: 'PayPal', hint: 'Any PayPal account worldwide' },
];

export default function WalletScreen() {
  const { user, wallet, config, setWallet } = useSession();
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [method, setMethod] = useState<Method>('mobile_money');
  const [form, setForm] = useState({ amount: '', email: '', accountName: '', accountNumber: '', bankCode: '', currency: 'USD' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [otp, setOtp] = useState<{ body: object; sent: CodeSent } | null>(null);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ wallet: Wallet; history: LedgerEntry[]; withdrawals: Withdrawal[] }>('/wallet');
    setWallet(r.wallet);
    setHistory(r.history);
    setWithdrawals(r.withdrawals);
  }, [setWallet]);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const min = config?.minWithdrawUsd ?? 5;
  const usd = wallet?.usd ?? 0;
  const progress = Math.min(1, usd / min);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Step 1: send a one-time code to the verified phone for this exact payout.
  const requestCode = (body?: object) => run(async () => {
    const amountUsd = Number(form.amount);
    const accountNumber = method === 'mobile_money' ? (user?.phone ?? '').replace(/\D/g, '') : form.accountNumber.trim();
    const details = method === 'paypal'
      ? { email: form.email.trim() }
      : { accountName: form.accountName.trim(), accountNumber, bankCode: form.bankCode.trim().toUpperCase(), currency: form.currency.trim().toUpperCase() };
    const b = body ?? { method, amountUsd, details };
    const sent = await api<CodeSent>('/withdrawals', { body: { ...b, channel } });
    setOtp({ body: b, sent });
    setCode('');
  });

  // Step 2: confirm with the code; the payout is sent immediately.
  const confirm = () => run(async () => {
    const r = await api<{ withdrawal: Withdrawal; wallet: Wallet }>('/withdrawals', { body: { ...otp!.body, code: code.trim() } });
    setOtp(null);
    setWallet(r.wallet);
    setMsg({ ok: r.withdrawal.status !== 'failed', text: `Withdrawal of $${r.withdrawal.amount_usd.toFixed(2)}: ${r.withdrawal.status.replace('_', ' ')}${r.withdrawal.error ? ` (${r.withdrawal.error}, points refunded)` : ''}` });
    await load();
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.balanceCard}>
          <Text style={styles.label}>Available balance</Text>
          <Text style={styles.balance}>${usd.toFixed(2)}</Text>
          <Text style={styles.muted}>{wallet?.points ?? 0} points · {config?.pointsPerUsd ?? 1000} points = $1</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${progress * 100}%` }]} /></View>
          <Text style={styles.muted}>{usd >= min ? 'You can cash out now' : `$${(min - usd).toFixed(2)} more to reach the $${min} minimum`}</Text>
        </View>

        <Text style={styles.h2}>Cash out</Text>
        {user?.kyc_status !== 'approved' ? (
          <View style={[styles.balanceCard, { borderColor: C.gold }]}>
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>Identity verification {user?.kyc_status === 'pending' ? 'in review' : 'required'}</Text>
            <Text style={styles.muted}>
              {user?.kyc_status === 'pending'
                ? 'We are checking your ID and selfie. Cash out unlocks once you are approved. You can keep watching and earning meanwhile.'
                : 'Verify your identity with an ID and a selfie to unlock cash out.'}
            </Text>
          </View>
        ) : !user?.phone_verified ? <PhoneVerify /> : (<>
        <Text style={[styles.muted, { marginBottom: 10 }]}>Verified phone: {user.phone}</Text>
        <View style={styles.methods}>
          {METHODS.map((m) => (
            <Pressable key={m.key} onPress={() => setMethod(m.key)} style={[styles.method, method === m.key && styles.methodOn]}>
              <Text style={[styles.methodText, method === m.key && { color: '#000' }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>{METHODS.find((m) => m.key === method)?.hint}</Text>

        <Field label="Amount (USD)" value={form.amount} onChangeText={set('amount')} keyboardType="decimal-pad" placeholder={`${min}.00`} />
        {method === 'paypal' ? (
          <Field label="PayPal email" value={form.email} onChangeText={set('email')} keyboardType="email-address" placeholder="you@example.com" />
        ) : (
          <>
            <Field label="Account holder name" value={form.accountName} onChangeText={set('accountName')} placeholder="Jane Doe" />
            {method === 'mobile_money' ? (
              <Field label="Mobile money number (your verified phone)" value={user.phone ?? ''} editable={false} style={[styles.input, { opacity: 0.6 }]} />
            ) : (
              <Field label="Account number" value={form.accountNumber} onChangeText={set('accountNumber')} keyboardType="number-pad" placeholder="0123456789" />
            )}
            <Field
              label={method === 'mobile_money' ? 'Network code (e.g. MPS for M-Pesa)' : 'Bank code'}
              value={form.bankCode}
              onChangeText={set('bankCode')}
              placeholder={method === 'mobile_money' ? 'MPS' : '044'}
            />
            <Field label="Payout currency" value={form.currency} onChangeText={set('currency')} placeholder="TZS, KES, NGN, GHS, UGX, USD…" />
          </>
        )}
        {!otp ? (
          <>
            <Text style={[styles.label, { marginTop: 16 }]}>Send confirmation code by</Text>
            <View style={styles.methods}>
              {(['whatsapp', 'sms'] as const).map((c) => (
                <Pressable key={c} onPress={() => setChannel(c)} style={[styles.method, channel === c && styles.methodOn]}>
                  <Text style={[styles.methodText, channel === c && { color: '#000' }]}>{c === 'whatsapp' ? 'WhatsApp' : 'SMS'}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.cta, (busy || usd < min) && { opacity: 0.5 }]} disabled={busy || usd < min} onPress={() => requestCode()}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Cash out</Text>}
            </Pressable>
          </>
        ) : (
          <View style={[styles.balanceCard, { marginTop: 16 }]}>
            <Text style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>Confirm your payout</Text>
            <Text style={styles.muted}>Enter the 6-digit code sent by {otp.sent.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to {otp.sent.sentTo}.</Text>
            {otp.sent.devCode && <Text style={{ color: C.gold }}>Sandbox mode, no message sent. Your code: {otp.sent.devCode}</Text>}
            <TextInput
              style={[styles.input, { fontSize: 22, letterSpacing: 8, textAlign: 'center' }]}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              maxLength={6}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
            />
            <Pressable style={[styles.cta, (busy || code.trim().length !== 6) && { opacity: 0.5 }]} disabled={busy || code.trim().length !== 6} onPress={confirm}>
              {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Confirm and send money</Text>}
            </Pressable>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Pressable onPress={() => requestCode(otp.body)} disabled={busy}><Text style={{ color: C.accent, fontWeight: '700' }}>Resend code</Text></Pressable>
              <Pressable onPress={() => setOtp(null)} disabled={busy}><Text style={styles.muted}>Cancel</Text></Pressable>
            </View>
          </View>
        )}
        {msg && <Text style={{ color: msg.ok ? C.accent : C.danger, marginTop: 8 }}>{msg.text}</Text>}
        </>)}

        {withdrawals.length > 0 && (
          <>
            <Text style={styles.h2}>Payouts</Text>
            {withdrawals.map((w) => (
              <Row key={w.id} left={`$${w.amount_usd.toFixed(2)} · ${w.method.replace('_', ' ')}`} sub={w.error || w.created_at} right={w.status.replace('_', ' ')} color={w.status === 'paid' ? C.accent : w.status === 'failed' ? C.danger : C.gold} />
            ))}
          </>
        )}

        <Text style={styles.h2}>Activity</Text>
        {history.length === 0 && <Text style={styles.muted}>Watch an ad to earn your first points.</Text>}
        {history.map((h, i) => (
          <Row key={i} left={h.note || h.kind} sub={h.created_at} right={`${h.delta > 0 ? '+' : ''}${h.delta}`} color={h.delta > 0 ? C.accent : C.text} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput autoCapitalize="none" placeholderTextColor="#555" style={styles.input} {...props} />
    </View>
  );
}

function Row({ left, sub, right, color }: { left: string; sub: string; right: string; color: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text }}>{left}</Text>
        <Text style={[styles.muted, { fontSize: 11 }]}>{sub}</Text>
      </View>
      <Text style={{ color, fontWeight: '800', textTransform: 'capitalize' }}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  balanceCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, gap: 6, borderWidth: 1, borderColor: C.border },
  label: { color: C.muted, fontSize: 13, marginBottom: 4 },
  balance: { color: C.text, fontSize: 44, fontWeight: '900' },
  muted: { color: C.muted, fontSize: 13 },
  bar: { height: 8, backgroundColor: C.cardAlt, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  barFill: { height: 8, backgroundColor: C.accent },
  h2: { color: C.text, fontSize: 18, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  methods: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  method: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.card },
  methodOn: { backgroundColor: C.accent, borderColor: C.accent },
  methodText: { color: C.text, fontWeight: '700', fontSize: 13 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  cta: { backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 18 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
});
