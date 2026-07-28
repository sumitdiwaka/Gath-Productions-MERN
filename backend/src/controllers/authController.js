const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} = require('../utils/tokens');

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Central place for cookie settings so they don't drift between routes.
// NOTE (flagged for production): secure:true requires HTTPS. In local dev
// over http://localhost this must be false or the cookie won't be set at all.
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

async function issueTokens(user, res) {
  const accessToken = signAccessToken(user._id);
  const refreshToken = generateRefreshToken();

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  res.cookie('refreshToken', refreshToken, refreshCookieOptions);
  return accessToken;
}

// POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const user = await User.create({ email, password }); // hashing happens in pre-save hook
    const accessToken = await issueTokens(user, res);

    res.status(201).json({ accessToken, user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Signup failed' });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    // Deliberately vague error message — "Invalid credentials" for both
    // "no such user" and "wrong password". Being specific here (e.g. "no
    // account with that email") lets attackers enumerate valid emails.
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const accessToken = await issueTokens(user, res);
    res.json({ accessToken, user: { id: user._id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res) => {
  try {
    const incomingToken = req.cookies.refreshToken;
    if (!incomingToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const tokenHash = hashToken(incomingToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    // Covers: token never existed, was already used/rotated away, or DB TTL expired it
    if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // --- Rotation ---
    // Instead of just handing back a new access token, we also issue a brand
    // new refresh token and revoke the old one. This is "refresh token rotation".
    // Why: a refresh token is long-lived, so if one ever gets stolen (e.g. from
    // a leaked log, a compromised device), rotation limits the damage — a stolen
    // token is single-use before it's replaced. If someone tries to reuse a
    // revoked token, that's a strong signal of theft (see below).
    storedToken.revoked = true;
    await storedToken.save();

    const user = await User.findById(storedToken.user);
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    const accessToken = await issueTokens(user, res);
    res.json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not refresh token' });
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    const incomingToken = req.cookies.refreshToken;
    if (incomingToken) {
      const tokenHash = hashToken(incomingToken);
      // Actually invalidate it server-side — this is the part a lot of
      // tutorials skip, just clearing the cookie and calling it "logout".
      // If we only cleared the cookie, the token itself would still be
      // valid until it expired naturally — anyone who'd copied it
      // (e.g. via a proxy log) could keep using it after "logout".
      await RefreshToken.updateOne({ tokenHash }, { revoked: true });
    }

    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Logout failed' });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
};