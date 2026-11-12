import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { BalancePill } from '@/components/balance-pill';
import type { Video } from '@/lib/api';
import { useWatchAd } from '@/lib/reward';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';
import { useVideos } from '@/lib/videos';

const AD_EVERY = 3;

export default function Shorts() {
  const { videos } = useVideos();
  const shorts = videos.filter((v) => v.type === 'short' || v.type === 'trailer');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const focused = useIsFocused();
  const watchAd = useWatchAd();
  const { config } = useSession();

  const watchAdRef = useRef(watchAd);
  useEffect(() => { watchAdRef.current = watchAd; }, [watchAd]);
  // FlatList requires a stable onViewableItemsChanged.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const i = viewableItems[0]?.index;
    if (i == null) return;
    setActive(i);
    if (i > 0 && i % AD_EVERY === 0) watchAdRef.current(`shorts-${i}`);
  });

  return (
    <View style={styles.wrap} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && (
        <FlatList
          data={shorts}
          keyExtractor={(v) => v.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          renderItem={({ item, index }) => (
            <ShortItem video={item} height={height} playing={focused && index === active} onEarn={() => watchAd(item.id)} points={config?.pointsPerAd} />
          )}
        />
      )}
      <View style={styles.top}><BalancePill /></View>
    </View>
  );
}

function ShortItem({ video, height, playing, onEarn, points }: { video: Video; height: number; playing: boolean; onEarn: () => void; points?: number }) {
  const player = useVideoPlayer(video.url, (p) => { p.loop = true; });
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      <View style={styles.meta}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.sub}>Swipe up for more · a rewarded ad plays every {AD_EVERY} videos</Text>
      </View>
      <Pressable style={styles.earn} onPress={onEarn}>
        <Ionicons name="cash" size={26} color="#000" />
        <Text style={styles.earnText}>+{points ?? 5}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 50, right: 16 },
  meta: { position: 'absolute', left: 16, right: 90, bottom: 24 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sub: { color: '#ddd', fontSize: 12, marginTop: 4 },
  earn: { position: 'absolute', right: 16, bottom: 32, width: 64, height: 64, borderRadius: 32, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  earnText: { color: '#000', fontWeight: '900', fontSize: 12 },
});
