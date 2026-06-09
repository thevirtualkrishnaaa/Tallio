import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AuthPage: React.FC = () => {
  const { login, register, startDemo } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const tryDemo = async () => {
    setError('');
    setDemoBusy(true);
    try {
      await startDemo();
    } catch (err: any) {
      setError(err.message || 'Could not start demo');
      setDemoBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Tallio</h1>
        <p className="text-sm text-gray-500 mb-6">Universal billing & analytics for retail and wholesale</p>

        <div className="flex mb-6 border rounded-lg overflow-hidden text-sm">
          <button
            className={`flex-1 py-2 ${mode === 'login' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            className={`flex-1 py-2 ${mode === 'register' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600'}`}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="you@business.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy || demoBusy}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          onClick={tryDemo}
          disabled={busy || demoBusy}
          className="w-full border border-gray-300 text-gray-800 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {demoBusy ? 'Setting up your demo…' : '✨ Try the 1-day demo — no sign-up'}
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          Explore Tallio with sample data. Expires after 24 hours.
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
