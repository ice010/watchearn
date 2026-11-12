import { Platform } from 'react-native';
import { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT =
  (Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS : process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID) ||
  TestIds.REWARDED;

// Shows a real AdMob rewarded ad. The reward is credited by our server when AdMob calls
// the SSV callback with this userId; the promise resolves true if the user earned it.
export function showNativeRewardedAd(userId: number, videoId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const ad = RewardedAd.createForAdRequest(AD_UNIT, {
      serverSideVerificationOptions: { userId: String(userId), customData: videoId },
    });
    let earned = false;
    const subs = [
      ad.addAdEventListener(RewardedAdEventType.LOADED, () => ad.show()),
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; }),
      ad.addAdEventListener(AdEventType.CLOSED, () => { subs.forEach((u) => u()); resolve(earned); }),
      ad.addAdEventListener(AdEventType.ERROR, (e) => { subs.forEach((u) => u()); reject(e); }),
    ];
    ad.load();
  });
}

export const hasNativeAds = true;
