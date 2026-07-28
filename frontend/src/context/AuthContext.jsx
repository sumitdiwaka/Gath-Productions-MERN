import { createContext, useContext, useState, useEffect } from 'react';
import axiosInstance, { setAccessToken } from '../api/axiosInstance';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until initial auth check finishes

  // --- Initial mount: silent refresh to check if a session already exists ---
  useEffect(() => {
    async function tryRestoreSession() {
      try {
        const { data } = await axiosInstance.post('/auth/refresh');
        setAccessToken(data.accessToken);

        const meRes = await axiosInstance.get('/auth/me');
        setUser(meRes.data.user);
      } catch (err) {
        // No valid cookie, or refresh failed — user simply isn't logged in.
        // Not an error state to surface to them, just the default state.
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    tryRestoreSession();
  }, []);

  // --- Listen for the axios interceptor telling us refresh failed mid-session ---
  useEffect(() => {
    function handleForcedLogout() {
      setUser(null);
      setAccessToken(null);
    }

    window.addEventListener('auth:logout', handleForcedLogout);
    return () => window.removeEventListener('auth:logout', handleForcedLogout);
  }, []);

  async function signup(email, password) {
    const { data } = await axiosInstance.post('/auth/signup', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }

  async function login(email, password) {
    const { data } = await axiosInstance.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }

  async function logout() {
    try {
      await axiosInstance.post('/auth/logout');
    } finally {
      // Clear client state regardless of whether the request succeeded —
      // if the network call failed, the user still expects to be logged out
      // locally. Worth noting: if the request truly never reached the
      // server, the refresh token in the DB stays valid until it naturally
      // expires (7 days) — a real edge case, not something to hide from
      // an interviewer if asked.
      setAccessToken(null);
      setUser(null);
    }
  }

  const value = { user, loading, signup, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Guard: if the request that just failed WAS the refresh call itself,
    // don't try to refresh again — that's the infinite loop. Just reject
    // and let AuthContext's own try/catch handle it (sets user to null).
    const isRefreshCall = originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axiosInstance(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axiosInstance.post('/auth/refresh');
        const newAccessToken = data.accessToken;

        setAccessToken(newAccessToken);
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);