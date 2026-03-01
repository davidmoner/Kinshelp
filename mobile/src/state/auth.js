import React from 'react';
import { getToken as loadToken, setToken as persistToken } from '../api/khApi';

const AuthCtx = React.createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = React.useState(null);
  const [booted, setBooted] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const t = await loadToken();
      setToken(t);
      setBooted(true);
    })();
  }, []);

  const value = React.useMemo(() => ({
    token,
    booted,
    signIn: async (t) => {
      await persistToken(t);
      setToken(t);
    },
    signOut: async () => {
      await persistToken(null);
      setToken(null);
    },
  }), [token, booted]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
