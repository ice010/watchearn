import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

export default function Account() {
  const { user, config, logout } = useSession();
  const perAdUsd = config ? config.pointsPerAd / config.pointsPerUsd : 0;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={styles.card}>
          <Text style={styles.name}>{user?.name || 'Viewer'}</Text>
          <Text style={styles.muted}>{user?.email} · {user?.email_verified ? 'verified' : 'not verified'}</Text>
          <Text style={styles.muted}>Identity: {user?.kyc_status === 'approved' ? 'verified' : user?.kyc_status === 'pending' ? 'in review' : 'not verified'}</Text>
          <Text style={styles.muted}>Phone: {user?.phone_verified ? `${user.phone} · verified` : 'not verified (needed to cash out)'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.h2}>How you earn</Text>
          <Text style={styles.p}>• Watch a full rewarded ad: +{config?.pointsPerAd} points (${perAdUsd.toFixed(3)})</Text>
          <Text style={styles.p}>• Every trailer, movie and short starts with a rewarded ad</Text>
          <Text style={styles.p}>• Up to {config?.maxAdsPerDay} rewarded ads per day</Text>
          <Text style={styles.p}>• Cash out from ${config?.minWithdrawUsd} via mobile money, bank transfer or PayPal</Text>
          <Text style={styles.p}>• No surveys, no offers, no tasks</Text>
        </View>
        {(config?.sandboxRewards || config?.payoutMode !== 'live') && (
          <View style={[styles.card, { borderColor: C.gold }]}>
            <Text style={[styles.h2, { color: C.gold }]}>Sandbox mode</Text>
            <Text style={styles.p}>Ads: {config?.sandboxRewards ? 'simulated' : 'AdMob'} · Payouts: {config?.payoutMode}. No real money moves until the server is switched to live.</Text>
          </View>
        )}
        <Pressable style={styles.logout} onPress={logout}><Text style={{ color: C.danger, fontWeight: '700' }}>Sign out</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: C.border },
  name: { color: C.text, fontSize: 22, fontWeight: '800' },
  muted: { color: C.muted },
  h2: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  p: { color: C.text, lineHeight: 22 },
  logout: { padding: 16, alignItems: 'center' },
});
