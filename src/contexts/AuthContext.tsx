import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** false → текущий аккаунт отключён администратором. UI должен показать заглушку. */
  isActive: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// Период polling'а собственного profile.is_active. Делает realtime-проверку
// деактивации без зависимости от Supabase realtime подписок.
const ACTIVE_CHECK_INTERVAL_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isActive, setIsActive] = useState<boolean>(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // When the user changes (logout / different account), drop cached data so we don't
      // briefly show another user's content.
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        queryClient.clear();
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  /**
   * Periodically check own profile.is_active. Если админ отключил
   * текущий аккаунт — выставляем isActive=false, UI покажет заглушку.
   * Sign-out не делаем автоматически: пусть пользователь сам выйдет.
   * Это вернее, чем дёргать signOut и оставлять blank-страницу.
   *
   * Если profile удалён вообще (deleted user) — getUserById вернёт null
   * на запросе, всё равно ставим isActive=false. Любая операция всё
   * равно зарежется RLS.
   */
  useEffect(() => {
    if (!user) {
      setIsActive(true);
      return;
    }
    let cancelled = false;

    const check = async () => {
      const { data, error } = await supabase
        .from("profiles" as any)
        .select("is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        // Профиль не найден → считаем неактивным (deleted-кейс).
        setIsActive(false);
        return;
      }
      const active = (data as any).is_active !== false;
      setIsActive(active);
    };

    check();
    intervalRef.current = setInterval(check, ACTIVE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isActive, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
