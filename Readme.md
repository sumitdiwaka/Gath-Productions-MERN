# MERN Auth — Two-Token Authentication System

A MERN stack application implementing signup, login, and a protected dashboard using a short-lived access token + long-lived, rotating refresh token.

**Live app:** https://gath-productions-mern.vercel.app
**Backend API:** https://gath-productions-mern.onrender.com/api

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) + Tailwind CSS |
| Backend | Node.js + Express |
| Database | MongoDB (Mongoose) |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Database hosting | MongoDB Atlas |

---

## Architecture overview

### The two tokens

- **Access token** — a JWT, signed with `ACCESS_TOKEN_SECRET`, expires in **15 minutes**. Sent in the JSON response body on login/signup/refresh, kept in memory on the frontend (never localStorage), and attached to API calls via `Authorization: Bearer <token>`. Verified statelessly (no DB lookup) on every request.
- **Refresh token** — a random opaque string (`crypto.randomBytes`), **not** a JWT. Its hash is stored server-side in a `RefreshToken` collection with an expiry (7 days) and a `revoked` flag. The raw value is sent to the browser as an **httpOnly cookie**, so client-side JS can never read it.

### Why httpOnly cookie over localStorage

Anything in localStorage is readable by any JS running on the page — including injected scripts from an XSS vulnerability. An httpOnly cookie can't be read by JS at all, even if the page is compromised. The tradeoff is CSRF exposure, mitigated here via `SameSite` cookie attributes and the fact that the refresh token itself must match a live, unguessable server-side record to be useful.

### Refresh token rotation

Every time `/api/auth/refresh` is called, the old refresh token is marked `revoked` and a brand new one is issued (new cookie set). This limits the damage of a stolen refresh token — it's single-use before being replaced. Reuse of an already-revoked token is a strong signal of token theft.

### Request flow (happy path)

1. User logs in → backend returns access token (body) + sets refresh token (httpOnly cookie)
2. Frontend attaches access token to every request via an axios request interceptor
3. Access token expires (15 min) → next request gets `401`
4. Axios **response interceptor** catches the `401`, calls `/api/auth/refresh` (cookie sent automatically), gets a new access token, retries the original request — transparent to the user
5. Concurrent requests that 401 around the same time are queued so only **one** refresh call fires, avoiding a race against the rotation logic
6. On page reload, the in-memory access token is gone — `AuthContext` immediately calls `/api/auth/refresh` on mount to silently restore the session if the cookie is still valid

### Logout

Calls `/api/auth/logout`, which looks up the refresh token by its hash and sets `revoked: true` in the database — a real server-side invalidation, not just clearing the cookie client-side. A copy of the raw token (e.g. from a compromised device) is unusable after this.

---

## Folder structure

```
mern-auth/
├── backend/
│   └── src/
│       ├── config/db.js
│       ├── models/{User.js, RefreshToken.js}
│       ├── controllers/authController.js
│       ├── routes/{authRoutes.js, dashboardRoutes.js}
│       ├── middleware/authMiddleware.js
│       ├── utils/tokens.js
│       └── app.js
├── frontend/
│   └── src/
│       ├── api/axiosInstance.js
│       ├── context/AuthContext.jsx
│       ├── components/ProtectedRoute.jsx
│       ├── pages/{Login.jsx, Signup.jsx, Dashboard.jsx}
│       └── App.jsx
```

---

## Environment variables

### Backend (`backend/.env` locally, Render dashboard in production)

```env
PORT=5000
NODE_ENV=production          # REQUIRED on Render — not set automatically
MONGO_URI=<Atlas connection string>
ACCESS_TOKEN_SECRET=<long random string>
CLIENT_URL=<exact deployed frontend URL, no trailing slash>
```

### Frontend (`frontend/.env` locally, Vercel dashboard in production)

```env
VITE_API_URL=<backend URL + /api>   # e.g. https://your-api.onrender.com/api
```

> Vite bakes `VITE_*` variables into the build at **build time**. Changing them in Vercel's dashboard requires a redeploy to take effect.

---

## Local setup

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

---

## Cookie & CORS config: local vs production

Cross-domain deployment (Vercel + Render) requires different cookie attributes than localhost:

| Setting | Local dev | Production (cross-domain) |
|---|---|---|
| `secure` | `false` | `true` |
| `sameSite` | `lax` | `none` |
| CORS `origin` | `http://localhost:5173` | exact frontend URL, never `*` |
| CORS `credentials` | `true` | `true` |

`SameSite=None` requires `secure: true` or browsers reject the cookie outright. `NODE_ENV=production` must be explicitly set on Render — it is **not** inferred automatically — since both `secure` and `sameSite` are derived from it in `authController.js`.

---

## AI tool usage

Built with assistance from Claude (Anthropic), used for architecture planning, code generation, and debugging deployment issues (CORS, cookie cross-domain behavior, an axios interceptor infinite-loop bug on refresh failure).

---

## Known next steps / possible improvements

- Detect reuse of an already-revoked refresh token specifically, and respond by revoking *all* sessions for that user (stronger theft response than a generic 401)
- Add CSRF token defense as a second layer alongside `SameSite=None`
- Rate limiting on `/signup` and `/login`