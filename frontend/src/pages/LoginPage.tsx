import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Brain, Sparkles, Mail, Lock } from 'lucide-react';
import { useAuth } from '../app/context/AuthContext';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { apiUrl } from '../lib/api';

const GOOGLE_OAUTH_ERROR_HINTS: Record<string, string> = {
  config:
    'Server configuration: set JWT_SECRET on Render (Environment). Also set GOOGLE_CALLBACK_URL to exactly the redirect URI registered in Google Cloud.',
  oauth:
    'Google rejected the callback. In Google Cloud → Credentials → your OAuth client, add this Authorized redirect URI exactly: https://align-ai-deployment.onrender.com/api/auth/google/callback — and set the same value as GOOGLE_CALLBACK_URL on Render if you use that variable.',
  denied: 'Google sign-in was cancelled.',
  missing: 'Sign-in did not return a valid code. Please try again.',
  server: 'Sign-in failed on the server. Open Render logs and look for [Google OAuth login callback].',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('google') !== 'error') return;
    const reason = searchParams.get('reason') || 'server';
    setError(GOOGLE_OAUTH_ERROR_HINTS[reason] ?? GOOGLE_OAUTH_ERROR_HINTS.server);
    const next = new URLSearchParams(searchParams);
    next.delete('google');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/auth/google/start?next=/dashboard'));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to start Google login');
      if (data?.auth_url) window.location.href = data.auth_url;
    } catch (err: any) {
      setError(err.message || 'Google login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full mix-blend-normal filter blur-xl opacity-30 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-primary/80/20 rounded-full mix-blend-normal filter blur-xl opacity-30 animate-pulse delay-1000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-primary/20 rounded-full mix-blend-normal filter blur-xl opacity-30 animate-pulse delay-500"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-card backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-border">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 rounded-2xl blur-md opacity-50"></div>
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-4 rounded-2xl">
                <Brain className="w-10 h-10 text-white" />
                <Sparkles className="w-4 h-4 text-yellow-300 absolute -top-1 -right-1" />
              </div>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              AllignAI
            </h1>
            <p className="text-muted-foreground mt-2">Welcome back! Please login to your account</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-foreground block">
                Email / Username
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="pl-10 h-12 bg-background border-border text-foreground rounded-xl focus:border-primary focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-foreground block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pl-10 h-12 bg-background border-border text-foreground rounded-xl focus:border-primary focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                  Remember Me
                </label>
              </div>
              <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/80">
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white font-semibold shadow-lg hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] transition-all"
            >
              {submitting ? 'Logging in...' : 'Login'}
            </button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>

          {/* Divider */}
          <div className="mt-8 mb-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm text-muted-foreground">OR</span>
            <div className="flex-1 h-px bg-border"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-background text-foreground border border-border hover:bg-card transition-all disabled:opacity-60"
          >
            Continue with Google
          </button>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-semibold hover:text-primary/80">
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-6">
          <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
