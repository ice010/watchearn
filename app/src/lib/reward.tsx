import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { api, type Wallet } from './api';
import { hasNativeAds, showNativeRewardedAd } from './native-ad';
import { useSession } from './session';
import { C } from './theme';

const SIM_AD_SECONDS = 15;
const SIM_AD_URL = 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4';

type Result = { earned: boolean; message: string };
const Ctx = createContext<((videoId: string) => Promise<Result>) | null>(null);

export function RewardProvider({ children }: { children: ReactNode }) {
  const { user, config, setWallet, refresh } = useSession();
  const [simVisible, setSimVisible] = useState(false);
  const simResolve = useRef<(earned: boolean) => void>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const show = useCallback((r: Result) => {
    setToast(r.message);
    return r;
  }, []);

  const watchAd = useCallback(async (videoId: string): Promise<Result> => {
    if (!user) return { earned: false, message: 'Sign in first' };
    let earned = false;
    try {
      earned = hasNativeAds
        ? await showNativeRewardedAd(user.id, videoId)
        : await new Promise<boolean>((resolve) => { simResolve.current = resolve; setSimVisible(true); });
    } catch {
      return show({ earned: false, message: 'No ad available right now, try again shortly' });
    }
    if (!earned) return show({ earned: false, message: 'Watch the full ad to earn' });

    try {
      if (config?.sandboxRewards) {
        const r = await api<{ credited: boolean; reason?: string; wallet: Wallet }>('/rewards/sandbox', { body: { videoId } });
        setWallet(r.wallet);
        if (!r.credited) return show({ earned: false, message: r.reason === 'daily_limit' ? 'Daily earning limit reached' : 'Not credited' });
      } else {
        // Production: AdMob's server-side callback credits the reward; give it a moment to arrive.
        await new Promise((r) => setTimeout(r, 2000));
        await refresh();
      }
    } catch (e) {
      return show({ earned: false, message: (e as Error).message });
    }
    return show({ earned: true, message: `+${config?.pointsPerAd ?? ''} points earned!` });
  }, [user, config, setWallet, refresh, show]);

  const finishSim = (earned: boolean) => {
    setSimVisible(false);
    simResolve.current?.(earned);
    simResolve.current = null;
  };

  return (
    <Ctx.Provider value={watchAd}>
      {children}
      {simVisible && <SimulatedAd onDone={finishSim} />}
      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </Ctx.Provider>
  );
}

function SimulatedAd({ onDone }: { onDone: (earned: boolean) => void }) {
  const [left, setLeft] = useState(SIM_AD_SECONDS);
  const player = useVideoPlayer(SIM_AD_URL, (p) => { p.loop = true; p.muted = true; p.play(); });
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Modal visible animationType="fade" transparent={false}>
      <View style={styles.adWrap}>
        <Text style={styles.adLabel}>Sponsored · Sandbox ad</Text>
        <VideoView player={player} style={styles.adVideo} nativeControls={false} contentFit="contain" />
        {left > 0 ? (
          <View style={styles.adFooter}>
            <Text style={styles.adCount}>Reward in {left}s</Text>
            <Pressable onPress={() => onDone(false)}><Text style={styles.adSkip}>Close (no reward)</Text></Pressable>
          </View>
        ) : (
          <Pressable style={styles.adClaim} onPress={() => onDone(true)}>
            <Text style={styles.adClaimText}>Claim reward</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

export function useWatchAd() {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useWatchAd outside RewardProvider');
  return fn;
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: C.accentDark, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  toastText: { color: '#fff', fontWeight: '700' },
  adWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'center', padding: 16, gap: 16 },
  adLabel: { color: C.muted, textAlign: 'center' },
  adVideo: { width: '100%', aspectRatio: 16 / 9 },
  adFooter: { alignItems: 'center', gap: 12 },
  adCount: { color: C.gold, fontSize: 18, fontWeight: '700' },
  adSkip: { color: C.muted, textDecorationLine: 'underline' },
  adClaim: { backgroundColor: C.accent, padding: 16, borderRadius: 12, alignItems: 'center' },
  adClaimText: { color: '#000', fontWeight: '800', fontSize: 18 },
});
