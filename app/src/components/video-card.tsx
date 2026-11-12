import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Video } from '@/lib/api';
import { C } from '@/lib/theme';
import { fmtDuration } from '@/lib/videos';

export function VideoCard({ video, points, onPress, wide }: { video: Video; points?: number; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, wide ? styles.wide : styles.narrow, pressed && { opacity: 0.8 }]}>
      <View>
        <Image source={video.thumbnail} style={[styles.thumb, wide ? { aspectRatio: 16 / 9 } : { aspectRatio: 2 / 3 }]} contentFit="cover" />
        <View style={styles.duration}><Text style={styles.durationText}>{fmtDuration(video.duration)}</Text></View>
        {points ? (
          <View style={styles.earn}>
            <Ionicons name="cash" size={12} color="#000" />
            <Text style={styles.earnText}>+{points}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.title}>{video.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  narrow: { width: 130 },
  wide: { width: 240 },
  thumb: { width: '100%', borderRadius: 10, backgroundColor: C.card },
  duration: { position: 'absolute', right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  durationText: { color: '#fff', fontSize: 11 },
  earn: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  earnText: { color: '#000', fontWeight: '800', fontSize: 11 },
  title: { color: C.text, fontSize: 13, fontWeight: '600' },
});
