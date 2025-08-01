const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DB_FILE = 'leaderboard.json';

// Helper: Read data from file
function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
// Helper: Save data to file
function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Zapisywanie transakcji po zakupie
app.post('/buy', (req, res) => {
  const { address, tokens, usd } = req.body;
  if (!address || !tokens || !usd) return res.status(400).json({ ok: false, error: "Brak wymaganych danych" });
  let db = readDB();

  // Dodaj nową transakcję
  db.push({ address, tokens, usd, time: Date.now() });
  saveDB(db);
  res.json({ ok: true });
});

// Całkowity balans (ile kto ma tokenów razem)
app.get('/balances', (req, res) => {
  let db = readDB();
  const balances = {};
  db.forEach(t => {
    if (!balances[t.address]) balances[t.address] = 0;
    balances[t.address] += t.tokens;
  });
  res.json(balances);
});

// Leaderboard – TOP 10 osób z największą ilością tokenów
app.get('/leaderboard', (req, res) => {
  let db = readDB();
  const totals = {};
  db.forEach(t => {
    if (!totals[t.address]) totals[t.address] = 0;
    totals[t.address] += t.tokens;
  });
  const top = Object.entries(totals)
    .map(([address, tokens]) => ({ address, tokens }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 10);
  res.json(top);
});

// Lista wszystkich transakcji (opcjonalnie)
app.get('/transactions', (req, res) => {
  let db = readDB();
  res.json(db);
});

app.listen(PORT, () => {
  console.log("API running at port", PORT);
});
