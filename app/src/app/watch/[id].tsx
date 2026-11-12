import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Video } from '@/lib/api';
import { C } from '@/lib/theme';
import { fmtDuration, useVideos } from '@/lib/videos';

export default function Watch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { videos } = useVideos();
  const video = videos.find((v) => v.id === id);
  return (
    <SafeAreaView style={styles.safe}>
      <Pressable style={styles.close} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <Ionicons name="close" size={28} color="#fff" />
      </Pressable>
      {video ? <Player video={video} /> : <Text style={styles.muted}>Loading…</Text>}
    </SafeAreaView>
  );
}

function Player({ video }: { video: Video }) {
  const player = useVideoPlayer(video.url, (p) => p.play());
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} allowsPictureInPicture />
      <View style={{ padding: 16 }}>
        <Text style={styles.title}>{video.title}</Text>
        <Text style={styles.muted}>{video.type} · {fmtDuration(video.duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', top: 50, left: 16, zIndex: 10, padding: 6 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  title: { color: C.text, fontSize: 20, fontWeight: '800' },
  muted: { color: C.muted, textTransform: 'capitalize', marginTop: 4 },
});
