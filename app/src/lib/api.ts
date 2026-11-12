import { Platform } from 'react-native';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? '/api' : 'http://localhost:4000/api');

export type Video = {
  id: string;
  type: 'movie' | 'trailer' | 'short';
  title: string;
  duration: number;
  url: string;
  thumbnail: string;
};
export type User = { id: number; email: string; name: string | null; country: string | null };
export type Wallet = { points: number; usd: number; adsToday: number; maxAdsPerDay: number };
export type AppConfig = {
  pointsPerAd: number;
  pointsPerUsd: number;
  minWithdrawUsd: number;
  maxAdsPerDay: number;
  sandboxRewards: boolean;
  payoutMode: string;
};
export type LedgerEntry = { delta: number; kind: string; note: string | null; created_at: string };
export type Withdrawal = { id: number; amount_usd: number; method: string; status: string; error: string | null; created_at: string };

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method || (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}
