CREATE TABLE IF NOT EXISTS study_flashcard_decks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_flashcards (
  id BIGSERIAL PRIMARY KEY,
  deck_id BIGINT NOT NULL REFERENCES study_flashcard_decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_quiz_attempts (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL DEFAULT '',
  question_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS study_flashcards_deck_idx ON study_flashcards(deck_id, position);
CREATE INDEX IF NOT EXISTS study_quiz_attempts_created_idx ON study_quiz_attempts(created_at DESC);
