import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { LogIn, Mail, Lock, User as UserIcon, ArrowRight, Loader2, ShieldCheck, Chrome } from 'lucide-react';
import { toast } from 'sonner';

export function Login() {
  const { user, signInWithGoogle, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  if (user) return <Navigate to="/" />;

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
      toast.success('Welcome back!');
    } catch (error: any) {
      console.error("Auth Error:", error.code, error.message);
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('SignIn cancelled');
      } else {
        toast.error(error.message || 'Authentication failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl active:scale-95 transition-transform">
            <ShieldCheck size={40} />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 tracking-tight italic">FixIt</h1>
          <p className="text-zinc-500 font-medium tracking-tight">Maintenance Cloud System</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-zinc-200 shadow-2xl space-y-6">
          <div className="space-y-4">
            <p className="text-center text-zinc-600 font-medium">Please sign in to access your account</p>
            
            <button
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="w-full bg-white border-2 border-zinc-900 text-zinc-900 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-zinc-50 transition-all shadow-lg active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  <Chrome size={20} />
                  Continue with Google
                </>
              )}
            </button>
          </div>
        </div>

        <div className="text-center space-y-4">
          <p className="text-xs text-zinc-400 font-medium">
            Authorized personnel only. Access strictly monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
