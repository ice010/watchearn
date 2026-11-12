export const storage = {
  get: async (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
  set: async (k: string, v: string) => localStorage.setItem(k, v),
  remove: async (k: string) => localStorage.removeItem(k),
};
