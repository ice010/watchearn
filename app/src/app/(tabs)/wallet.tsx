import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type LedgerEntry, type Wallet, type Withdrawal } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

type Method = 'mobile_money' | 'bank' | 'paypal';
const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: 'mobile_money', label: 'Mobile money', hint: 'M-Pesa, Airtel, MTN, Tigo… via Flutterwave' },
  { key: 'bank', label: 'Bank transfer', hint: 'Local bank account via Flutterwave' },
  { key: 'paypal', label: 'PayPal', hint: 'Any PayPal account worldwide' },
];

export default function WalletScreen() {
  const { wallet, config, setWallet } = useSession();
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [method, setMethod] = useState<Method>('mobile_money');
  const [form, setForm] = useState({ amount: '', email: '', accountName: '', accountNumber: '', bankCode: '', currency: 'USD' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const cashOut = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const amountUsd = Number(form.amount);
      const details = method === 'paypal'
        ? { email: form.email.trim() }
        : { accountName: form.accountName.trim(), accountNumber: form.accountNumber.trim(), bankCode: form.bankCode.trim().toUpperCase(), currency: form.currency.trim().toUpperCase() };
      const r = await api<{ withdrawal: Withdrawal; wallet: Wallet }>('/withdrawals', { body: { method, amountUsd, details } });
      setWallet(r.wallet);
      setMsg({ ok: true, text: `Withdrawal of $${r.withdrawal.amount_usd.toFixed(2)} ${r.withdrawal.status.replace('_', ' ')}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

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
            <Field
              label={method === 'mobile_money' ? 'Phone number (with country code)' : 'Account number'}
              value={form.accountNumber}
              onChangeText={set('accountNumber')}
              keyboardType="number-pad"
              placeholder={method === 'mobile_money' ? '255712345678' : '0123456789'}
            />
            <Field
              label={method === 'mobile_money' ? 'Network code (e.g. MPS for M-Pesa)' : 'Bank code'}
              value={form.bankCode}
              onChangeText={set('bankCode')}
              placeholder={method === 'mobile_money' ? 'MPS' : '044'}
            />
            <Field label="Payout currency" value={form.currency} onChangeText={set('currency')} placeholder="TZS, KES, NGN, GHS, UGX, USD…" />
          </>
        )}
        <Pressable style={[styles.cta, (busy || usd < min) && { opacity: 0.5 }]} disabled={busy || usd < min} onPress={cashOut}>
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>Request payout</Text>}
        </Pressable>
        {msg && <Text style={{ color: msg.ok ? C.accent : C.danger, marginTop: 8 }}>{msg.text}</Text>}

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
      <TextInput {...props} autoCapitalize="none" placeholderTextColor="#555" style={styles.input} />
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
