const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization; // "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token missing' });
  }

  try {
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    // Expired or tampered token — frontend should catch this 401 specifically
    // and attempt a silent refresh before giving up (we'll build that interceptor
    // on the frontend side).
    return res.status(401).json({ message: 'Invalid or expired access token' });
  }
};