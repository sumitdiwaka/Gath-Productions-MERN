import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // sends the httpOnly refreshToken cookie automatically
});

// The access token lives in memory, not in this file's state directly —
// we inject it via a setter so AuthContext (which owns the actual state)
// stays the single source of truth. This file just needs a way to read
// "whatever the current token is" at request time.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

// Attach the access token to every outgoing request
axiosInstance.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// --- The refresh-on-401 interceptor ---
//
// This needs to handle a subtlety: if 5 API calls fire around the same time
// and all get a 401 because the access token just expired, you don't want
// 5 separate refresh calls racing each other (the backend rotates the
// refresh token on use, so the 2nd-5th refresh attempts would fail against
// an already-revoked token). So we queue concurrent requests and let only
// ONE refresh call happen, then replay all the queued ones with the new token.

let isRefreshing = false;
let refreshQueue = []; // holds { resolve, reject } for requests waiting on refresh

function processQueue(error, token = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  refreshQueue = [];
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt this for 401s, and only once per request
    // (the _retry flag stops an infinite loop if refresh succeeds but the
    // retried request somehow 401s again)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // A refresh is already in flight — queue this request instead of
        // firing a second refresh call
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
        return axiosInstance(originalRequest); // retry the original failed request
      } catch (refreshError) {
        // Refresh itself failed — the refresh token is dead too.
        // Reject everything queued, and let AuthContext know to log out.
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

export default axiosInstance;