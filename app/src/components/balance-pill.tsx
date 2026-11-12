import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

export function BalancePill() {
  const { wallet } = useSession();
  return (
    <Pressable style={styles.pill} onPress={() => router.navigate('/wallet')}>
      <Ionicons name="logo-usd" size={14} color={C.gold} />
      <Text style={styles.text}>{(wallet?.usd ?? 0).toFixed(2)}</Text>
      <Text style={styles.pts}>{wallet?.points ?? 0} pts</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  text: { color: C.text, fontWeight: '800' },
  pts: { color: C.muted, fontSize: 12 },
});
