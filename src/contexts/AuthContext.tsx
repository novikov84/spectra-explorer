import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '@/api/client';

export interface User {
  username: string;
  role: string;
}


interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  guestLogin: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      // Optimistically assume valid (or verify with /me endpoint if strictly needed)
      // For now just set authenticated. User info depends on login response, 
      // we might parse JWT here to restore username? 
      // Let's decode simply if needed, or just persist generic state.
      setIsAuthenticated(true);
      // We'll set a generic user for now until we add a /me endpoint or persist user info
      setUser({ username: 'User', role: 'user' });
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await api.login(username, password);
      setIsAuthenticated(true);
      if (result.username) setUser({ username: result.username, role: result.role || 'user' });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      await api.register(username, password);
      // Auto login after register? Or ask to login. 
      // Let's ask to login for security flow, or auto login. 
      // User requested "enter using...". 
      // Let's just return success and let user click login.
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const guestLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.guestLogin();
      setIsAuthenticated(true);
      setUser({ username: 'Guest', role: 'guest' });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, register, guestLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
