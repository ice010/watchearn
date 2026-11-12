import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, type AppConfig, type User, type Wallet } from './api';
import { storage } from './storage';

type Session = {
  ready: boolean;
  user: User | null;
  wallet: Wallet | null;
  config: AppConfig | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
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
    refresh,
    login: (email, password) => start('/auth/login', { email, password }),
    register: (email, password, name) => start('/auth/register', { email, password, name }),
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
