// AdMob has no web SDK; the web preview uses the simulated ad in RewardProvider.
export function showNativeRewardedAd(_userId: number, _videoId: string): Promise<boolean> {
  return Promise.resolve(false);
}
export const hasNativeAds = false;
