import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BalancePill } from '@/components/balance-pill';
import { VideoCard } from '@/components/video-card';
import type { Video } from '@/lib/api';
import { useWatchAd } from '@/lib/reward';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';
import { useVideos } from '@/lib/videos';

const SECTIONS: { type: Video['type']; title: string; wide?: boolean }[] = [
  { type: 'trailer', title: 'Trailers', wide: true },
  { type: 'movie', title: 'Movies' },
  { type: 'short', title: 'Short videos', wide: true },
];

export default function Home() {
  const { videos, error } = useVideos();
  const { wallet, config } = useSession();
  const watchAd = useWatchAd();

  const open = async (v: Video) => {
    await watchAd(v.id);
    router.push({ pathname: '/watch/[id]', params: { id: v.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo}>Watch<Text style={{ color: C.accent }}>Earn</Text></Text>
        <BalancePill />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Pressable style={styles.hero} onPress={() => watchAd('quick-earn')}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Watch an ad, earn {config?.pointsPerAd ?? 5} points</Text>
            <Text style={styles.heroSub}>
              No surveys, no tasks. {wallet?.adsToday ?? 0}/{wallet?.maxAdsPerDay ?? config?.maxAdsPerDay ?? 50} today
            </Text>
          </View>
          <Ionicons name="play" size={36} color="#000" />
        </Pressable>
        <Text style={styles.hint}>Every video starts with a short rewarded ad. Watch it to the end and the points go straight to your wallet.</Text>
        {error && <Text style={styles.error}>Cannot reach server: {error}</Text>}
        {SECTIONS.map((s) => (
          <View key={s.type} style={{ marginTop: 20 }}>
            <Text style={styles.section}>{s.title}</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={videos.filter((v) => v.type === s.type)}
              keyExtractor={(v) => v.id}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              renderItem={({ item }) => <VideoCard video={item} wide={s.wide} points={config?.pointsPerAd} onPress={() => open(item)} />}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  logo: { color: C.text, fontSize: 24, fontWeight: '900' },
  hero: { margin: 16, marginBottom: 8, padding: 18, borderRadius: 16, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center' },
  heroTitle: { color: '#000', fontSize: 18, fontWeight: '900' },
  heroSub: { color: '#063', marginTop: 4, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12, paddingHorizontal: 16 },
  section: { color: C.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, marginBottom: 10 },
  error: { color: C.danger, padding: 16 },
});
