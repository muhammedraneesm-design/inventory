import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

export function Login() {
  const { user, login, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;
  if (user) return <Navigate to="/" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl">
            <LogIn size={40} />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 tracking-tight">FixIt</h1>
          <p className="text-zinc-500 font-medium">Maintenance Inventory Management</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-xl space-y-6">
          <p className="text-sm text-zinc-600">Sign in with your corporate account to access the inventory system.</p>
          <button
            onClick={login}
            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Sign in with Google
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          Secure enterprise access. Authorized personnel only.
        </p>
      </div>
    </div>
  );
}
