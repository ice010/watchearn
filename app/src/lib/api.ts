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
export type User = {
  id: number;
  email: string;
  name: string | null;
  country: string | null;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
};
export type CodeSent = { sentTo: string; channel: 'email' | 'sms' | 'whatsapp'; devCode?: string };
export type Wallet = { points: number; usd: number; adsToday: number; maxAdsPerDay: number };
export type AppConfig = {
  pointsPerAd: number;
  pointsPerUsd: number;
  minWithdrawUsd: number;
  maxAdsPerDay: number;
  sandboxRewards: boolean;
  payoutMode: string;
  messagingMode: string;
};
export type LedgerEntry = { delta: number; kind: string; note: string | null; created_at: string };
export type Withdrawal = { id: number; amount_usd: number; method: string; status: string; error: string | null; created_at: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: Record<string, unknown>) {
    super(message);
  }
}

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
  if (!res.ok) throw new ApiError(json.error || `Request failed (${res.status})`, res.status, json);
  return json as T;
}
