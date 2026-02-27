import { ReactNode, createContext, useContext, useMemo, useState } from "react";
import { User } from "../types";

type AuthState = {
  token: string | null;
  user: User | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "nagarseva_token";
const USER_KEY = "nagarseva_user";
const LEGACY_TOKEN_KEY = "token";
const LEGACY_USER_KEY = "user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    sessionStorage.getItem(TOKEN_KEY) ??
      localStorage.getItem(TOKEN_KEY) ??
      localStorage.getItem(LEGACY_TOKEN_KEY)
  );
  const [user, setUser] = useState<User | null>(() => {
    const raw =
      sessionStorage.getItem(USER_KEY) ??
      localStorage.getItem(USER_KEY) ??
      localStorage.getItem(LEGACY_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      signIn(nextToken, nextUser) {
        // Use sessionStorage so each tab/window can hold a different login.
        sessionStorage.setItem(TOKEN_KEY, nextToken);
        sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));

        // Clear shared keys to avoid cross-tab session override.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        setToken(nextToken);
        setUser(nextUser);
      },
      signOut() {
        const currentToken =
          token ??
          sessionStorage.getItem(TOKEN_KEY) ??
          localStorage.getItem(TOKEN_KEY) ??
          localStorage.getItem(LEGACY_TOKEN_KEY);
        if (currentToken) {
          void fetch("/api/auth/logout", {
            method: "POST",
            headers: { Authorization: `Bearer ${currentToken}` }
          }).catch(() => undefined);
        }
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        setToken(null);
        setUser(null);
      }
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used under AuthProvider");
  return context;
}
