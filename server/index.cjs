const path = require('node:path')
const dotenv = require('dotenv')
const express = require('express')
const cors = require('cors')
const Database = require('better-sqlite3')

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const app = express()
const port = 3001
const database = new Database(path.join(__dirname, '..', 'polis.db'))

database.pragma('journal_mode = WAL')
database.exec(`
  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    grade TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    next TEXT NOT NULL DEFAULT 'Set your next milestone'
  );
  CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    date TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'normal'
  );
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date INTEGER NOT NULL,
    type TEXT NOT NULL,
    time TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    term TEXT NOT NULL DEFAULT '',
    year TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'Untitled note',
    content TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT 'markdown',
    folder TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL,
    note_id INTEGER,
    quote TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    extracted_text TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

app.use(cors())
app.use(express.json())

app.get('/api/materials', (request, response) => response.json(database.prepare('SELECT * FROM materials WHERE subject_id = ? ORDER BY favorite DESC, created_at DESC').all(request.query.subjectId)))
app.post('/api/materials', (request, response) => {
  const { subjectId, title, kind = 'link', url = '', folder = '', tags = '', favorite = 0 } = request.body
  if (!subjectId || !title) return response.status(400).json({ error: 'subjectId and title are required' })
  const result = database.prepare('INSERT INTO materials (subject_id, title, kind, url, folder, tags, favorite) VALUES (?, ?, ?, ?, ?, ?, ?)').run(subjectId, title.trim(), kind, url, folder, tags, favorite ? 1 : 0)
  response.status(201).json(database.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/materials/:id', (request, response) => {
  database.prepare('UPDATE materials SET favorite = COALESCE(?, favorite), folder = COALESCE(?, folder), tags = COALESCE(?, tags) WHERE id = ?').run(request.body.favorite === undefined ? null : (request.body.favorite ? 1 : 0), request.body.folder, request.body.tags, request.params.id)
  response.json(database.prepare('SELECT * FROM materials WHERE id = ?').get(request.params.id))
})

app.get('/api/notes', (request, response) => response.json(database.prepare('SELECT * FROM notes WHERE subject_id = ? ORDER BY favorite DESC, updated_at DESC').all(request.query.subjectId)))
app.post('/api/notes', (request, response) => {
  const { subjectId, title = 'Untitled note', content = '', format = 'markdown', folder = '', tags = '' } = request.body
  if (!subjectId) return response.status(400).json({ error: 'subjectId is required' })
  const result = database.prepare('INSERT INTO notes (subject_id, title, content, format, folder, tags) VALUES (?, ?, ?, ?, ?, ?)').run(subjectId, title, content, format, folder, tags)
  response.status(201).json(database.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/notes/:id', (request, response) => {
  database.prepare('UPDATE notes SET title = COALESCE(?, title), content = COALESCE(?, content), format = COALESCE(?, format), folder = COALESCE(?, folder), tags = COALESCE(?, tags), favorite = COALESCE(?, favorite), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(request.body.title, request.body.content, request.body.format, request.body.folder, request.body.tags, request.body.favorite === undefined ? null : (request.body.favorite ? 1 : 0), request.params.id)
  response.json(database.prepare('SELECT * FROM notes WHERE id = ?').get(request.params.id))
})

app.get('/api/annotations', (request, response) => response.json(database.prepare('SELECT * FROM annotations WHERE subject_id = ? ORDER BY created_at DESC').all(request.query.subjectId)))
app.post('/api/annotations', (request, response) => {
  const { subjectId, noteId = null, quote, comment = '', color = 'yellow' } = request.body
  if (!subjectId || !quote) return response.status(400).json({ error: 'subjectId and quote are required' })
  const result = database.prepare('INSERT INTO annotations (subject_id, note_id, quote, comment, color) VALUES (?, ?, ?, ?, ?)').run(subjectId, noteId, quote, comment, color)
  response.status(201).json(database.prepare('SELECT * FROM annotations WHERE id = ?').get(result.lastInsertRowid))
})

app.get('/api/documents', (request, response) => response.json(database.prepare('SELECT * FROM documents WHERE subject_id IS ? ORDER BY created_at DESC').all(request.query.subjectId || null)))
app.post('/api/documents', (request, response) => {
  const { subjectId = null, name, fileType, size = 0, extractedText = '', folder = '', tags = '' } = request.body
  if (!name || !fileType) return response.status(400).json({ error: 'name and fileType are required' })
  const result = database.prepare('INSERT INTO documents (subject_id, name, file_type, size, extracted_text, folder, tags) VALUES (?, ?, ?, ?, ?, ?, ?)').run(subjectId, name, fileType, size, extractedText, folder, tags)
  response.status(201).json(database.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid))
})

app.get('/api/profile', (_request, response) => response.json(database.prepare('SELECT name, term, year FROM profile WHERE id = 1').get() || { name: '', term: '', year: '' }))
app.put('/api/profile', (request, response) => {
  const { name = '', term = '', year = '' } = request.body
  database.prepare('INSERT INTO profile (id, name, term, year) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, term = excluded.term, year = excluded.year').run(name.trim(), term.trim(), year.trim())
  response.json(database.prepare('SELECT name, term, year FROM profile WHERE id = 1').get())
})

app.get('/api/goals', (_request, response) => response.json(database.prepare('SELECT id, title, completed FROM goals ORDER BY id').all()))
app.post('/api/goals', (request, response) => {
  const { title } = request.body
  if (!title || !title.trim()) return response.status(400).json({ error: 'title is required' })
  const result = database.prepare('INSERT INTO goals (title) VALUES (?)').run(title.trim())
  response.status(201).json(database.prepare('SELECT id, title, completed FROM goals WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/goals/:id', (request, response) => {
  database.prepare('UPDATE goals SET completed = ? WHERE id = ?').run(request.body.completed ? 1 : 0, request.params.id)
  response.json(database.prepare('SELECT id, title, completed FROM goals WHERE id = ?').get(request.params.id))
})
app.delete('/api/goals/:id', (request, response) => {
  database.prepare('DELETE FROM goals WHERE id = ?').run(request.params.id)
  response.status(204).end()
})

app.get('/api/subjects', (_request, response) => response.json(database.prepare('SELECT * FROM subjects ORDER BY id').all()))
app.post('/api/subjects', (request, response) => {
  const { name, code, grade = 'A', progress = 0, color = 'violet', next = 'Set your next milestone' } = request.body
  if (!name || !code) return response.status(400).json({ error: 'name and code are required' })
  const result = database.prepare('INSERT INTO subjects (name, code, grade, progress, color, next) VALUES (?, ?, ?, ?, ?, ?)').run(name, code, grade, progress, color, next)
  response.status(201).json(database.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid))
})
app.patch('/api/subjects/:id', (request, response) => {
  const { progress, grade, next } = request.body
  database.prepare('UPDATE subjects SET progress = COALESCE(?, progress), grade = COALESCE(?, grade), next = COALESCE(?, next) WHERE id = ?').run(progress, grade, next, request.params.id)
  response.json(database.prepare('SELECT * FROM subjects WHERE id = ?').get(request.params.id))
})

app.get('/api/deadlines', (_request, response) => response.json(database.prepare('SELECT * FROM deadlines ORDER BY id').all()))
app.post('/api/deadlines', (request, response) => {
  const { title, subject, date, tone = 'normal' } = request.body
  if (!title || !subject || !date) return response.status(400).json({ error: 'title, subject, and date are required' })
  const result = database.prepare('INSERT INTO deadlines (title, subject, date, tone) VALUES (?, ?, ?, ?)').run(title, subject, date, tone)
  response.status(201).json(database.prepare('SELECT * FROM deadlines WHERE id = ?').get(result.lastInsertRowid))
})

app.get('/api/calendar-events', (_request, response) => response.json(database.prepare('SELECT * FROM calendar_events ORDER BY date, time').all()))
app.post('/api/calendar-events', (request, response) => {
  const { title, date, type, time } = request.body
  if (!title || !date || !type || !time) return response.status(400).json({ error: 'title, date, type, and time are required' })
  const result = database.prepare('INSERT INTO calendar_events (title, date, type, time) VALUES (?, ?, ?, ?)').run(title, date, type, time)
  response.status(201).json(database.prepare('SELECT * FROM calendar_events WHERE id = ?').get(result.lastInsertRowid))
})

app.get('/api/neon/health', async (_request, response) => {
  const functionUrl = process.env.NEON_FUNCTION_HEALTH_BASE_URL
  if (!functionUrl) return response.status(503).json({ ok: false, error: 'Neon health function is not configured' })
  try {
    const healthResponse = await fetch(functionUrl)
    const payload = await healthResponse.json()
    response.status(healthResponse.status).json(payload)
  } catch (error) {
    console.error('[neon-health] function request failed', error)
    response.status(502).json({ ok: false, error: 'Neon health function is unavailable' })
  }
})

app.listen(port, () => console.log(`Polis API listening on http://localhost:${port}`))
