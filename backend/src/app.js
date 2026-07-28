const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

app.use(express.json());
app.use(cookieParser());

// PRODUCTION FLAG: credentials:true + an explicit origin (not '*') are both
// required for cookies to work cross-origin. If frontend and backend are on
// different domains after deployment (e.g. Vercel + Render), this origin
// must exactly match your deployed frontend URL, and axios must set
// withCredentials:true on the client (we'll do that in the frontend piece).
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

module.exports = app;