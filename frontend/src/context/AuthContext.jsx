import React, { createContext, useContext, useEffect, useState } from 'react';
import api, { isTokenExpired } from '../api';
import { clearAuthSession, getAccessToken, getStoredUser, setAuthSession } from '../utils/authSession';

const AuthContext = createContext();

function loadStoredUser() {
  return getStoredUser();
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadStoredUser);
  const [accessToken, setAccessToken] = useState(getAccessToken);
  const [isRestoring, setIsRestoring] = useState(Boolean(loadStoredUser() && !getAccessToken()));

  useEffect(() => {
    let cancelled = false;
    if (!user || accessToken) {
      setIsRestoring(false);
      return () => {
        cancelled = true;
      };
    }

    api.refreshSession().then((session) => {
      if (cancelled) return;
      if (session?.user && session?.accessToken) {
        setUser(session.user);
        setAccessToken(session.accessToken);
      } else {
        setUser(null);
      }
      setIsRestoring(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user, accessToken]);

  const login = (userData) => {
    const token = userData.access_token || userData.token || '';
    const userWithExpiry = {
      ...userData,
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
    };
    const safeUser = setAuthSession(userWithExpiry, token);
    setUser(safeUser);
    setAccessToken(token);
  };

  const logout = () => {
    setUser(null);
    setAccessToken('');
    clearAuthSession();
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const sessionExpired = Boolean(accessToken && isTokenExpired(accessToken));

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, isAdmin, isRestoring, sessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
