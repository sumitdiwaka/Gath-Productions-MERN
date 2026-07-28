import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axiosInstance from '../api/axiosInstance';

const ACCESS_TOKEN_LIFETIME = 15 * 60; // seconds, matches backend's 15m expiry

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(ACCESS_TOKEN_LIFETIME);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data } = await axiosInstance.get('/dashboard');
        setMessage(data.message);
      } catch (err) {
        setMessage('Could not load dashboard data.');
      }
    }
    fetchDashboardData();
  }, []);

  // Purely a UI countdown of the access token's known lifetime — not a real
  // decode of the JWT. Resets on refresh page load; good enough to visualize
  // the "short-lived" half of the two-token system for the dashboard.
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="font-mono text-xs tracking-widest text-accent uppercase mb-2">
              Authenticated
            </p>
            <h1 className="font-display font-bold text-3xl text-text">Dashboard</h1>
            <p className="text-muted mt-1">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="text-sm border border-border rounded-lg px-4 py-2 text-muted hover:text-text hover:border-accent/50 transition"
          >
            Log out
          </button>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <p className="text-text">{message}</p>
        </div>

        {/* Signature element: live session status, mirroring the two-token architecture */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="font-mono text-xs tracking-widest text-muted uppercase mb-4">
            Session status
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between font-mono text-sm">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                ACCESS
              </span>
              <span className="text-muted">expires in {mm}:{ss}</span>
            </div>
            <div className="flex items-center justify-between font-mono text-sm">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/40" />
                REFRESH
              </span>
              <span className="text-muted">httpOnly · rotates on use</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}