import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiUrl } from '../../lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  user: { name: string; email: string } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  completeOAuth: (payload: { token: string; name: string; email: string }) => void;
  updateUser: (updates: { name?: string; email?: string }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEY = 'alignai.auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { token?: string; user?: { name: string; email: string } };
      if (parsed?.token && parsed?.user?.email) {
        setToken(parsed.token);
        setUser(parsed.user);
        setIsAuthenticated(true);
      }
    } catch (_err) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  const persistSession = useCallback((nextToken: string, nextUser: { name: string; email: string }) => {
    setToken(nextToken);
    setUser(nextUser);
    setIsAuthenticated(true);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Login failed');
      persistSession(String(data.token || ''), { name: data.name || email.split('@')[0], email });
    },
    [persistSession]
  );

  const signup = useCallback(
    async (username: string, email: string, password: string) => {
      const res = await fetch(apiUrl('/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Signup failed');
      persistSession(String(data.token || ''), { name: data.name || username, email: data.email || email });
    },
    [persistSession]
  );

  const completeOAuth = useCallback(
    (payload: { token: string; name: string; email: string }) => {
      persistSession(payload.token, { name: payload.name, email: payload.email });
    },
    [persistSession]
  );

  const updateUser = useCallback(
    (updates: { name?: string; email?: string }) => {
      if (!user) return;
      const nextUser = { ...user, ...updates };
      setUser(nextUser);
      if (token) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user: nextUser }));
      }
    },
    [user, token]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated,
      user,
      token,
      login,
      signup,
      completeOAuth,
      updateUser,
      logout,
    }),
    [isAuthenticated, user, token, login, signup, completeOAuth, updateUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}