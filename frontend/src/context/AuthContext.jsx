import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

function loadStoredUser() {
  try {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  } catch (err) {
    console.error('[JAYA_DEBUG] Caught error in AuthContext user restore:', err);
    localStorage.removeItem('user');
    localStorage.removeItem('admin_token');
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadStoredUser);

  const login = (userData) => {
    const userWithExpiry = {
      ...userData,
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
    };
    setUser(userWithExpiry);
    localStorage.setItem('user', JSON.stringify(userWithExpiry));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
