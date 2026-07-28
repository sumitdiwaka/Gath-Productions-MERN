const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/authMiddleware');

router.get('/', requireAuth, (req, res) => {
  res.json({ message: `Welcome, user ${req.userId}` });
});

module.exports = router;