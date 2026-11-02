CREATE TABLE IF NOT EXISTS subjects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  grade TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  next TEXT NOT NULL DEFAULT 'Set your next milestone'
);

CREATE TABLE IF NOT EXISTS deadlines (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'normal'
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id BIGSERIAL PRIMARY KEY,
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
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS materials (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled note',
  content TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'markdown',
  folder TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS annotations (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL,
  note_id BIGINT,
  quote TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  extracted_text TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS materials_subject_idx ON materials(subject_id);
CREATE INDEX IF NOT EXISTS notes_subject_idx ON notes(subject_id);
CREATE INDEX IF NOT EXISTS annotations_subject_idx ON annotations(subject_id);
CREATE INDEX IF NOT EXISTS documents_subject_idx ON documents(subject_id);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('thinker', 'theory', 'ideology', 'concept', 'event', 'institution')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id BIGSERIAL PRIMARY KEY,
  from_entity_id BIGINT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  to_entity_id BIGINT NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  UNIQUE (from_entity_id, to_entity_id, relationship)
);

CREATE TABLE IF NOT EXISTS recitation_sessions (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'written',
  score NUMERIC(5, 2),
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recitation_questions (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES recitation_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  answer_mode TEXT NOT NULL DEFAULT 'written',
  evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS debates (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  position TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  score NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debate_arguments (
  id BIGSERIAL PRIMARY KEY,
  debate_id BIGINT NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('user', 'ai')),
  content TEXT NOT NULL,
  evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS research_projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  research_question TEXT NOT NULL DEFAULT '',
  thesis TEXT NOT NULL DEFAULT '',
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_sources (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES research_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  doi TEXT NOT NULL DEFAULT '',
  citation TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  minutes INTEGER NOT NULL DEFAULT 0,
  topic TEXT NOT NULL DEFAULT '',
  completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS knowledge_entities_type_idx ON knowledge_entities(entity_type);
CREATE INDEX IF NOT EXISTS recitation_questions_session_idx ON recitation_questions(session_id);
CREATE INDEX IF NOT EXISTS debate_arguments_debate_idx ON debate_arguments(debate_id);
CREATE INDEX IF NOT EXISTS research_sources_project_idx ON research_sources(project_id);
CREATE INDEX IF NOT EXISTS study_sessions_subject_idx ON study_sessions(subject_id);
