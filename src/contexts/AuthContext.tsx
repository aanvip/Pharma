import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { resolveAccessibleModules } from '../utils/permissions';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  accessibleModules: Set<string>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isSupabaseAuthStorageKey(key: string) {
  return (key.startsWith('sb-') && key.endsWith('-auth-token')) || key.includes('supabase.auth.token');
}

function getStorageKeys(storage: Storage | undefined) {
  if (!storage) return [];

  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && isSupabaseAuthStorageKey(key)) keys.push(key);
  }
  return keys;
}

function removeSupabaseAuthStorage() {
  if (typeof window === 'undefined') return { localStorageKeys: [], sessionStorageKeys: [] };

  const localStorageKeys = getStorageKeys(window.localStorage);
  const sessionStorageKeys = getStorageKeys(window.sessionStorage);

  localStorageKeys.forEach(key => window.localStorage.removeItem(key));
  sessionStorageKeys.forEach(key => window.sessionStorage.removeItem(key));

  return { localStorageKeys, sessionStorageKeys };
}

function expireSupabaseAuthCookies() {
  if (typeof document === 'undefined') return [];

  const cookieNames = document.cookie
    .split(';')
    .map(cookie => cookie.split('=')[0]?.trim())
    .filter(Boolean)
    .filter(name => name.startsWith('sb-') || name.includes('supabase'));

  const domainParts = window.location.hostname.split('.');
  const domains = domainParts.length > 1
    ? [window.location.hostname, `.${window.location.hostname}`, `.${domainParts.slice(-2).join('.')}`]
    : [window.location.hostname];

  cookieNames.forEach(name => {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    domains.forEach(domain => {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
    });
  });

  return cookieNames;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessibleModules, setAccessibleModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfileAndPermissions(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfileAndPermissions(session.user.id);
      } else {
        setProfile(null);
        setAccessibleModules(new Set());
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfileAndPermissions = async (userId: string) => {
    try {
      const [profileResult, permissionsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_permissions').select('module, can_access').eq('user_id', userId),
      ]);

      if (profileResult.error) throw profileResult.error;

      const profileData = profileResult.data as UserProfile | null;
      setProfile(profileData);

      if (profileData) {
        const modules = resolveAccessibleModules(
          profileData.role,
          permissionsResult.data ?? null
        );
        setAccessibleModules(modules);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshPermissions = async () => {
    if (!user) return;
    await loadProfileAndPermissions(user.id);
  };

  const signIn = async (usernameOrEmail: string, password: string) => {
    let email = usernameOrEmail;

    if (!usernameOrEmail.includes('@')) {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('email, username, is_active')
        .eq('username', usernameOrEmail.toLowerCase())
        .maybeSingle();

      if (error) throw new Error('Invalid username or password');
      if (!data) throw new Error('Invalid username or password');
      if (!data.is_active) throw new Error('Account is inactive. Please contact administrator.');

      email = data.email;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string, role: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: data.user.id,
          email,
          full_name: fullName,
          role,
          language: 'en',
          is_active: true,
        });

      if (profileError) throw profileError;
    }
  };

  const clearAuthState = () => {
    setUser(null);
    setProfile(null);
    setAccessibleModules(new Set());
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    console.groupCollapsed('[auth-debug] Logout');

    try {
      const beforeSession = await supabase.auth.getSession();
      console.log('[auth-debug] getSession before signOut', {
        hasSession: Boolean(beforeSession.data.session),
        userId: beforeSession.data.session?.user?.id || null,
        error: beforeSession.error?.message || null,
      });
      console.log('[auth-debug] auth storage before signOut', {
        localStorageKeys: getStorageKeys(window.localStorage),
        sessionStorageKeys: getStorageKeys(window.sessionStorage),
        cookies: document.cookie
          .split(';')
          .map(cookie => cookie.split('=')[0]?.trim())
          .filter(Boolean)
          .filter(name => name.startsWith('sb-') || name.includes('supabase')),
      });

      const signOutResponse = await supabase.auth.signOut({ scope: 'global' });
      console.log('[auth-debug] supabase.auth.signOut response', {
        error: signOutResponse.error?.message || null,
      });

      if (signOutResponse.error) {
        console.error('[auth-debug] supabase.auth.signOut error', signOutResponse.error);
        const localSignOutResponse = await supabase.auth.signOut({ scope: 'local' });
        console.log('[auth-debug] fallback local signOut response', {
          error: localSignOutResponse.error?.message || null,
        });
      }

      const removedStorage = removeSupabaseAuthStorage();
      const removedCookies = expireSupabaseAuthCookies();
      console.log('[auth-debug] removed auth storage/cookies', {
        ...removedStorage,
        cookies: removedCookies,
      });

      const afterSession = await supabase.auth.getSession();
      console.log('[auth-debug] getSession after signOut', {
        hasSession: Boolean(afterSession.data.session),
        session: afterSession.data.session,
        error: afterSession.error?.message || null,
      });

      if (afterSession.data.session) {
        throw new Error('Logout failed: Supabase session still exists after signOut.');
      }

      clearAuthState();
    } catch (error) {
      console.error('[auth-debug] logout failed', error);
      clearAuthState();
    } finally {
      console.groupEnd();
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, accessibleModules, loading, signIn, signUp, signOut, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
