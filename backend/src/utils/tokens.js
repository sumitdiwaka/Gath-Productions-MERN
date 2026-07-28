const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken() {
  // random opaque token — not a JWT. We don't need it to carry claims,
  // it's just a lookup key into the RefreshToken collection.
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, generateRefreshToken, hashToken };