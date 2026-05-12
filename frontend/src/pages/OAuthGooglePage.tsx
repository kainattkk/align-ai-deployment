import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../app/context/AuthContext';

function safeNextPath(raw: string) {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export default function OAuthGooglePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();
  const [error, setError] = useState('');

  const payload = useMemo(() => {
    const token = String(searchParams.get('token') || '');
    const email = String(searchParams.get('email') || '');
    const name = String(searchParams.get('name') || '');
    const next = String(searchParams.get('next') || '/dashboard');
    return { token, email, name, next };
  }, [searchParams]);

  useEffect(() => {
    if (!payload.token || !payload.email) {
      setError('Google sign-in failed. Please try again.');
      return;
    }
    try {
      flushSync(() => {
        completeOAuth({
          token: payload.token,
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
        });
      });
      navigate(safeNextPath(payload.next), { replace: true });
    } catch {
      setError('Google sign-in failed. Please try again.');
    }
  }, [completeOAuth, navigate, payload.email, payload.name, payload.next, payload.token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card rounded-2xl border border-border p-6 text-center w-full max-w-md">
        {!error ? (
          <>
            <p className="text-foreground font-semibold">Finishing Google sign-in…</p>
            <p className="text-sm text-muted-foreground mt-2">You’ll be redirected automatically.</p>
          </>
        ) : (
          <>
            <p className="text-destructive font-semibold">{error}</p>
            <button
              className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

