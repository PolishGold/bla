// server.js  — BabyBitcoin API (MongoDB)
// --------------------------------------

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;

// ---------- ENV VALIDATION ----------
if (!MONGO_URI) {
  console.error('❌ Missing MONGO_URI environment variable');
  process.exit(1);
}

// ---------- CORS ----------
const ALLOWED = [
  'https://www.bitcoin-baby.com',
  'https://bitcoin-baby.com',
  'https://babybitcoin.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
  })
);
app.use(express.json());

// ---------- DB ----------
mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// ---------- SCHEMA & MODEL ----------
const TxSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, index: true, lowercase: true, trim: true },
    tokens: { type: Number, required: true, min: 0 },
    usd: { type: Number, required: true, min: 0 },
    network: { type: String, enum: ['eth', 'bsc', 'other'], default: 'eth' },
  },
  { timestamps: true }
);
const Tx = mongoose.model('tx', TxSchema);

// ---------- ROUTES ----------

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Record a purchase
app.post('/buy', async (req, res, next) => {
  try {
    let { address, tokens, usd, network } = req.body || {};
    if (!address || typeof tokens !== 'number' || typeof usd !== 'number') {
      return res.status(400).json({ ok: false, error: 'Missing fields: address, tokens, usd' });
    }
    address = String(address).toLowerCase();

    await Tx.create({ address, tokens, usd, network: network || 'eth' });
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('POST /buy error:', e);
    next(e);
  }
});

// Total balances per address
app.get('/balances', async (req, res, next) => {
  try {
    const agg = await Tx.aggregate([
      { $group: { _id: '$address', tokens: { $sum: '$tokens' } } },
      { $project: { _id: 0, address: '$_id', tokens: 1 } },
    ]);
    const out = {};
    agg.forEach(r => (out[r.address] = r.tokens));
    return res.json({ ok: true, data: out });
  } catch (e) {
    console.error('GET /balances error:', e);
    next(e);
  }
});

// Leaderboard (all-time or daily)
app.get('/leaderboard', async (req, res, next) => {
  try {
    const range = req.query.range || 'all';
    let match = {};
    if (range === 'daily') {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
      match = { createdAt: { $gte: from } };
    }

    const top = await Tx.aggregate([
      { $match: match },
      { $group: { _id: '$address', tokens: { $sum: '$tokens' } } },
      { $project: { _id: 0, address: '$_id', tokens: 1 } },
      { $sort: { tokens: -1 } },
      { $limit: 10 },
    ]);
    return res.json({ ok: true, data: top });
  } catch (e) {
    console.error('GET /leaderboard error:', e);
    next(e);
  }
});

// Recent transactions
app.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
    const txs = await Tx.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({ ok: true, data: txs });
  } catch (e) {
    console.error('GET /transactions error:', e);
    next(e);
  }
});

// Stats: total USD raised, tokens sold, unique buyers
app.get('/stats', async (req, res, next) => {
  try {
    const [agg] = await Tx.aggregate([
      {
        $group: {
          _id: null,
          raised: { $sum: '$usd' },
          tokens: { $sum: '$tokens' },
          buyers: { $addToSet: '$address' },
        },
      },
      {
        $project: {
          _id: 0,
          raised: 1,
          tokens: 1,
          buyers: { $size: '$buyers' },
        },
      },
    ]);
    const data = agg || { raised: 0, tokens: 0, buyers: 0 };
    return res.json({ ok: true, data });
  } catch (e) {
    console.error('GET /stats error:', e);
    next(e);
  }
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ ok: false, error: 'Unexpected server error' });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

process.on('unhandledRejection', r => console.error('unhandledRejection', r));
process.on('uncaughtException', e => console.error('uncaughtException', e));
