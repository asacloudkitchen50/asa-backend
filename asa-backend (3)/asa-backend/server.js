require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const partnerRoutes = require('./routes/partners');
const restaurantRoutes = require('./routes/restaurants');
const { router: settlementRoutes } = require('./routes/settlement');
const { startScheduler } = require('./services/scheduler');
const { seedAdmin } = require('./db/seedAdmin');

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS: ' + origin));
  },
}));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/partners', partnerRoutes);
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/settlement', settlementRoutes);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;

const seedResult = seedAdmin();
console.log(`[startup] ${seedResult.error || seedResult.message}`);

app.listen(PORT, () => {
  console.log(`ASA Foods backend running on http://localhost:${PORT}`);
  startScheduler();
});
