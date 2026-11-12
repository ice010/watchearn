import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setToken, type AppConfig, type CodeSent, type User, type Wallet } from './api';
import { storage } from './storage';

type Session = {
  ready: boolean;
  user: User | null;
  wallet: Wallet | null;
  config: AppConfig | null;
  /** Resolves to a CodeSent when the email still needs verifying. */
  login: (email: string, password: string) => Promise<CodeSent | null>;
  register: (email: string, password: string, name?: string) => Promise<CodeSent>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<CodeSent>;
  setUser: (u: User) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setWallet: (w: Wallet) => void;
};

const Ctx = createContext<Session | null>(null);
const KEY = 'watchearn.token';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const refresh = useCallback(async () => {
    const me = await api<{ user: User; wallet: Wallet }>('/me');
    setUser(me.user);
    setWallet(me.wallet);
  }, []);

  useEffect(() => {
    (async () => {
      api<AppConfig>('/config').then(setConfig).catch(() => {});
      const t = await storage.get(KEY);
      if (t) {
        setToken(t);
        await refresh().catch(async () => {
          setToken(null);
          await storage.remove(KEY);
        });
      }
      setReady(true);
    })();
  }, [refresh]);

  const start = async (path: string, body: object) => {
    const r = await api<{ token: string; user: User }>(path, { body });
    setToken(r.token);
    await storage.set(KEY, r.token);
    setUser(r.user);
    await refresh();
  };

  const value: Session = {
    ready,
    user,
    wallet,
    config,
    setWallet,
    setUser,
    refresh,
    login: async (email, password) => {
      try {
        await start('/auth/login', { email, password });
        return null;
      } catch (e) {
        if (e instanceof ApiError && e.data.verificationRequired) return e.data as unknown as CodeSent;
        throw e;
      }
    },
    register: (email, password, name) => api<CodeSent>('/auth/register', { body: { email, password, name } }),
    verifyEmail: (email, code) => start('/auth/verify-email', { email, code }),
    resendCode: (email) => api<CodeSent>('/auth/resend-code', { body: { email } }),
    logout: async () => {
      setToken(null);
      await storage.remove(KEY);
      setUser(null);
      setWallet(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
