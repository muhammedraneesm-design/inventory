import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const loadProfile = async (retryCount = 0) => {
          const docRef = doc(db, 'users', user.uid);
          try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              const isAdmin = data.username === "muhammedraneesm" || data.username === "admin" || data.email === "muhammedraneesm@gmail.com";
              let updatedProfile = data;
              if (isAdmin && data.role !== 'admin') {
                updatedProfile = { ...data, role: 'admin' as const };
                await setDoc(docRef, updatedProfile, { merge: true });
              }
              setProfile(updatedProfile);
              localStorage.setItem('user_profile', JSON.stringify(updatedProfile));
            } else {
              const email = user.email || '';
              const username = email.split('@')[0];
              const isAdmin = email === "muhammedraneesm@gmail.com";
              const newProfile: UserProfile = {
                uid: user.uid,
                email: email,
                username: username,
                name: user.displayName || username,
                role: isAdmin ? 'admin' : 'technician'
              };
              await setDoc(docRef, newProfile);
              setProfile(newProfile);
              localStorage.setItem('user_profile', JSON.stringify(newProfile));
            }
          } catch (error: any) {
            console.warn(`Profile load attempt ${retryCount + 1} failed:`, error.message);
            if (retryCount < 3) {
              const delay = Math.pow(2, retryCount) * 1000;
              setTimeout(() => loadProfile(retryCount + 1), delay);
            } else {
              console.error("Max retries reached for profile loading:", error);
            }
          }
        };
        loadProfile();
      } else {
        setProfile(null);
        localStorage.removeItem('user_profile');
      }
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, logout, isAuthReady }}>
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
