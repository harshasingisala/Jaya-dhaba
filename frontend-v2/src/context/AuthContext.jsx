import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import api from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          
          // Sync with backend to get MongoDB user data
          const syncWithRetry = async (attempts = 1) => {
            try {
              const syncData = { 
                idToken, 
                email: firebaseUser.email, 
                name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                uid: firebaseUser.uid 
              };
              const response = await api.post('/api/auth/firebase', syncData);
              
              if (response.success) {
                  const userData = {
                    ...response.user,
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL
                  };
                  setUser(userData);
                  localStorage.setItem('user', JSON.stringify(userData));
                  localStorage.setItem('token', response.token);
              }
            } catch (syncErr) {
              console.error(`Backend sync attempt ${attempts} failed:`, syncErr);
              if (attempts < 3) {
                const delay = Math.pow(2, attempts) * 500; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                return syncWithRetry(attempts + 1);
              }
              
              // Final fallback after 3 attempts
              console.error(`❌ Backend Sync failed permanently after 3 attempts.`);
              
              if (import.meta.env.DEV) {
                const mockUser = {
                  name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
                  email: firebaseUser.email,
                  role: 'user',
                  uid: firebaseUser.uid,
                  isMock: true
                };
                setUser(mockUser);
                localStorage.setItem('user', JSON.stringify(mockUser));
              } else {
                // TERMINAL BREAK: Sign out of Firebase to prevent reload loops
                await signOut(auth);
                localStorage.clear();
                setUser(null);
              }
            }
          };

          await syncWithRetry();
        } catch (err) {
          console.error('Final Auth sync wrap failed:', err);
          await signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      setUser(null);
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
