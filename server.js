import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---- Database ----
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new Database(join(dataDir, 'rc.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    UNIQUE NOT NULL,
    layout     TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS calibration (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    data       TEXT    NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

// Prepared statements
const stmts = {
  allTracks:    db.prepare('SELECT id, name, layout FROM tracks ORDER BY updated_at DESC'),
  upsertTrack:  db.prepare(`
    INSERT INTO tracks (name, layout, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET layout=excluded.layout, updated_at=excluded.updated_at
  `),
  trackByName:  db.prepare('SELECT id FROM tracks WHERE name=?'),
  deleteTrack:  db.prepare('DELETE FROM tracks WHERE id=?'),
  getCalib:     db.prepare('SELECT data FROM calibration WHERE id=1'),
  upsertCalib:  db.prepare(`
    INSERT INTO calibration (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
  `),
};

// ---- Server ----
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));   // serves index.html, css/, js/

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Tracks ---
app.get('/api/tracks', (_req, res) => {
  const rows = stmts.allTracks.all();
  res.json(rows.map(r => ({ id: r.id, name: r.name, layout: JSON.parse(r.layout) })));
});

app.post('/api/tracks', (req, res) => {
  const { name, layout } = req.body ?? {};
  if (!name || !layout) return res.status(400).json({ error: 'name and layout required' });
  const now = Math.floor(Date.now() / 1000);
  stmts.upsertTrack.run(name, JSON.stringify(layout), now, now);
  const { id } = stmts.trackByName.get(name);
  res.json({ id, name, layout });
});

app.delete('/api/tracks/:id', (req, res) => {
  stmts.deleteTrack.run(req.params.id);
  res.json({ ok: true });
});

// --- Calibration ---
app.get('/api/calibration', (_req, res) => {
  const row = stmts.getCalib.get();
  res.json(row ? JSON.parse(row.data) : null);
});

app.post('/api/calibration', (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid data' });
  stmts.upsertCalib.run(JSON.stringify(data), Math.floor(Date.now() / 1000));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`RC Sim Pro → http://localhost:${PORT}`);
});
