'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, ShieldCheck, ArrowRight, Eye, EyeOff, Sparkles, Flame } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || 'Authentication failed. Please verify credentials.');
        setLoading(false);
        return;
      }

      // Check redirect param
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get('redirect') || '/dashboard';
      router.push(redirectUrl);
      router.refresh();
    } catch {
      setErrorMessage('Network connection error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian text-text-primary flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Volcanic Ambient Dual-Radial Lighting */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 50% 15%, rgba(232, 75, 44, 0.12), transparent 50%),
            radial-gradient(ellipse at 85% 85%, rgba(200, 105, 56, 0.08), transparent 45%)
          `,
        }}
      />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E87A38] text-[10px] font-mono uppercase tracking-widest font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shadow-[0_0_8px_#E84B2C]"></span>
            Administrative Gateway
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <img
              src="/arenova.png"
              alt="ARENOVA"
              width={42}
              height={42}
              className="w-11 h-11 object-contain filter drop-shadow-[0_0_18px_rgba(232,75,44,0.45)]"
            />
            <span className="font-syne font-extrabold text-3xl tracking-[-0.025em] text-text-primary">
              ARENOVA
            </span>
          </div>

          <p className="text-xs text-text-muted font-cinzel tracking-wider uppercase">
            Autonomous Cold Outreach Agent
          </p>
        </div>

        {/* Login Panel Card */}
        <div className="p-8 rounded-[14px] bg-surface-elevated border border-border-subtle card-volcanic space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold font-syne text-text-primary tracking-tight">
              Single-Owner Sign In
            </h2>
            <p className="text-xs text-text-muted">
              Administrative authorization required to access outreach pipelines & dispatch queues.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-[10px] bg-[#E84B2C]/10 border border-[#E84B2C]/30 text-[#E84B2C] text-xs flex items-center gap-2 animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E84B2C] shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-text-secondary font-medium mb-1.5">
                Admin Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-[10px] bg-surface-secondary border border-border-standard text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#E84B2C] focus:ring-2 focus:ring-[#E84B2C]/20 text-xs font-mono transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-text-secondary font-medium mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-[10px] bg-surface-secondary border border-border-standard text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#E84B2C] focus:ring-2 focus:ring-[#E84B2C]/20 text-xs font-mono transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-[10px] text-xs font-bold font-syne tracking-wide text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(232,75,44,0.35)]"
              style={{
                background: 'linear-gradient(135deg, #E84B2C 0%, #C86938 100%)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
              }}
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to ARENOVA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security Badge */}
          <div className="pt-2 border-t border-border-subtle flex items-center justify-center gap-2 text-[11px] text-text-muted">
            <ShieldCheck className="w-4 h-4 text-[#63C7A2]" />
            <span>Single-Account Cryptographic Gate</span>
          </div>
        </div>

        {/* Footer Notice */}
        <p className="text-center text-[10px] text-text-muted font-mono">
          Strictly authorized: avi@arenova.in • Protected by AES-256 HMAC
        </p>
      </div>
    </div>
  );
}
