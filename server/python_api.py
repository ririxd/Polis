from __future__ import annotations

import os
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import File, UploadFile
from openai import OpenAI
import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
DIRECT_DATABASE_URL = os.getenv("DATABASE_URL_UNPOOLED") or DATABASE_URL
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required to start the Python API")

pool: ConnectionPool


def initialize_schema() -> None:
    if not DIRECT_DATABASE_URL:
        raise RuntimeError("DATABASE_URL_UNPOOLED or DATABASE_URL is required for schema setup")
    schema = (ROOT / "server" / "schema.sql").read_text(encoding="utf-8")
    with psycopg.connect(DIRECT_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema)


def rows(query: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with pool.connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, parameters)
            return list(cursor.fetchall())


def one(query: str, parameters: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    result = rows(query, parameters)
    return result[0] if result else None


def required_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=400, detail=f"{field} is required")
    return value.strip()


def ai_client() -> tuple[OpenAI, str]:
    if os.getenv("GROQ_API_KEY"):
        return (
            OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1"),
            os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        )
    if os.getenv("OPENAI_API_KEY"):
        return OpenAI(api_key=os.environ["OPENAI_API_KEY"]), os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    raise HTTPException(503, "GROQ_API_KEY or OPENAI_API_KEY is not configured")


def json_output(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError as error:
        raise HTTPException(502, "The AI returned an invalid structured response") from error
    if not isinstance(value, dict):
        raise HTTPException(502, "The AI returned an invalid response shape")
    return value


def ai_json(prompt: str) -> dict[str, Any]:
    client, model = ai_client()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "Return only valid JSON. Do not use markdown fences."},
            {"role": "user", "content": prompt},
        ],
    )
    content = response.choices[0].message.content
    if not content:
        raise HTTPException(502, "The AI returned an empty response")
    return json_output(content)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pool
    if os.getenv("POLIS_AUTO_MIGRATE", "").lower() == "true":
        initialize_schema()
    pool = ConnectionPool(DATABASE_URL, kwargs={"row_factory": dict_row}, min_size=1, max_size=5, open=True)
    yield
    pool.close()


app = FastAPI(title="Polis Python API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/health")
def health() -> dict[str, Any]:
    database_ok = one("SELECT 1 AS ok") == {"ok": 1}
    return {"ok": database_ok, "database": {"ok": database_ok}, "realtime": {"configured": bool(os.getenv("NEON_REALTIME_URL"))}}


@app.get("/api/materials")
def list_materials(subject_id: int = Query(alias="subjectId")):
    return rows("SELECT * FROM materials WHERE subject_id = %s ORDER BY favorite DESC, created_at DESC", (subject_id,))


@app.post("/api/materials", status_code=201)
def create_material(body: dict[str, Any]):
    subject_id = body.get("subjectId")
    title = required_text(body.get("title"), "subjectId and title")
    if not subject_id:
        raise HTTPException(400, "subjectId and title are required")
    return one(
        """INSERT INTO materials (subject_id, title, kind, url, folder, tags, favorite)
           VALUES (%s, %s, %s, %s, %s, %s, %s)
           RETURNING *""",
        (subject_id, title, body.get("kind", "link"), body.get("url", ""), body.get("folder", ""), body.get("tags", ""), int(bool(body.get("favorite")))),
    )


@app.patch("/api/materials/{item_id}")
def update_material(item_id: int, body: dict[str, Any]):
    return one(
        """UPDATE materials SET favorite = COALESCE(%s, favorite), folder = COALESCE(%s, folder),
           tags = COALESCE(%s, tags) WHERE id = %s RETURNING *""",
        (None if "favorite" not in body else int(bool(body["favorite"])), body.get("folder"), body.get("tags"), item_id),
    )


@app.get("/api/notes")
def list_notes(subject_id: int = Query(alias="subjectId")):
    return rows("SELECT * FROM notes WHERE subject_id = %s ORDER BY favorite DESC, updated_at DESC", (subject_id,))


@app.post("/api/notes", status_code=201)
def create_note(body: dict[str, Any]):
    subject_id = body.get("subjectId")
    if not subject_id:
        raise HTTPException(400, "subjectId is required")
    return one(
        """INSERT INTO notes (subject_id, title, content, format, folder, tags)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
        (subject_id, body.get("title", "Untitled note"), body.get("content", ""), body.get("format", "markdown"), body.get("folder", ""), body.get("tags", "")),
    )


@app.patch("/api/notes/{item_id}")
def update_note(item_id: int, body: dict[str, Any]):
    return one(
        """UPDATE notes SET title = COALESCE(%s, title), content = COALESCE(%s, content),
           format = COALESCE(%s, format), folder = COALESCE(%s, folder), tags = COALESCE(%s, tags),
           favorite = COALESCE(%s, favorite), updated_at = CURRENT_TIMESTAMP
           WHERE id = %s RETURNING *""",
        (body.get("title"), body.get("content"), body.get("format"), body.get("folder"), body.get("tags"), None if "favorite" not in body else int(bool(body["favorite"])), item_id),
    )


@app.get("/api/annotations")
def list_annotations(subject_id: int = Query(alias="subjectId")):
    return rows("SELECT * FROM annotations WHERE subject_id = %s ORDER BY created_at DESC", (subject_id,))


@app.post("/api/annotations", status_code=201)
def create_annotation(body: dict[str, Any]):
    subject_id = body.get("subjectId")
    quote = required_text(body.get("quote"), "subjectId and quote")
    if not subject_id:
        raise HTTPException(400, "subjectId and quote are required")
    return one(
        """INSERT INTO annotations (subject_id, note_id, quote, comment, color)
           VALUES (%s, %s, %s, %s, %s) RETURNING *""",
        (subject_id, body.get("noteId"), quote, body.get("comment", ""), body.get("color", "yellow")),
    )


@app.get("/api/documents")
def list_documents(subject_id: int | None = Query(default=None, alias="subjectId")):
    return rows("SELECT * FROM documents WHERE subject_id IS NOT DISTINCT FROM %s ORDER BY created_at DESC", (subject_id,))


@app.post("/api/documents", status_code=201)
def create_document(body: dict[str, Any]):
    name = required_text(body.get("name"), "name")
    file_type = required_text(body.get("fileType"), "fileType")
    return one(
        """INSERT INTO documents (subject_id, name, file_type, size, extracted_text, folder, tags)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
        (body.get("subjectId"), name, file_type, body.get("size", 0), body.get("extractedText", ""), body.get("folder", ""), body.get("tags", "")),
    )


@app.get("/api/profile")
def get_profile():
    return one("SELECT name, term, year FROM profile WHERE id = 1") or {"name": "", "term": "", "year": ""}


@app.put("/api/profile")
def save_profile(body: dict[str, Any]):
    return one(
        """INSERT INTO profile (id, name, term, year) VALUES (1, %s, %s, %s)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, term = EXCLUDED.term, year = EXCLUDED.year
           RETURNING name, term, year""",
        (str(body.get("name", "")).strip(), str(body.get("term", "")).strip(), str(body.get("year", "")).strip()),
    )


@app.get("/api/goals")
def list_goals():
    return rows("SELECT id, title, completed FROM goals ORDER BY id")


@app.post("/api/goals", status_code=201)
def create_goal(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")
    return one("INSERT INTO goals (title) VALUES (%s) RETURNING id, title, completed", (title,))


@app.patch("/api/goals/{item_id}")
def update_goal(item_id: int, body: dict[str, Any]):
    return one("UPDATE goals SET completed = %s WHERE id = %s RETURNING id, title, completed", (int(bool(body.get("completed"))), item_id))


@app.delete("/api/goals/{item_id}", status_code=204)
def delete_goal(item_id: int):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM goals WHERE id = %s", (item_id,))


DIST_DIR = ROOT / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def frontend() -> FileResponse:
    return FileResponse(DIST_DIR / "index.html")


@app.get("/api/subjects")
def list_subjects():
    return rows("SELECT * FROM subjects ORDER BY id")


@app.post("/api/subjects", status_code=201)
def create_subject(body: dict[str, Any]):
    name = required_text(body.get("name"), "name")
    code = required_text(body.get("code"), "code")
    return one(
        """INSERT INTO subjects (name, code, grade, progress, color, next)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
        (name, code, body.get("grade", "A"), body.get("progress", 0), body.get("color", "violet"), body.get("next", "Set your next milestone")),
    )


@app.patch("/api/subjects/{item_id}")
def update_subject(item_id: int, body: dict[str, Any]):
    return one(
        """UPDATE subjects SET progress = COALESCE(%s, progress), grade = COALESCE(%s, grade),
           next = COALESCE(%s, next) WHERE id = %s RETURNING *""",
        (body.get("progress"), body.get("grade"), body.get("next"), item_id),
    )


@app.delete("/api/subjects/{item_id}", status_code=204)
def delete_subject(item_id: int):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM annotations WHERE subject_id = %s", (item_id,))
            cursor.execute("DELETE FROM notes WHERE subject_id = %s", (item_id,))
            cursor.execute("DELETE FROM materials WHERE subject_id = %s", (item_id,))
            cursor.execute("DELETE FROM documents WHERE subject_id = %s", (item_id,))
            cursor.execute("DELETE FROM subjects WHERE id = %s", (item_id,))


@app.get("/api/recitations")
def list_recitations():
    return rows(
        """SELECT id, title, mode, score, summary, created_at
           FROM recitation_sessions ORDER BY created_at DESC LIMIT 20"""
    )


@app.post("/api/recitations", status_code=201)
def create_recitation(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")
    subject_id = body.get("subjectId")
    session = one(
        """INSERT INTO recitation_sessions (subject_id, title, mode)
           VALUES (%s, %s, %s) RETURNING id, subject_id, title, mode, score, summary, created_at""",
        (subject_id, title, body.get("mode", "written")),
    )
    if not session:
        raise HTTPException(500, "Could not create recitation session")
    try:
        generated = ai_json(f"""Create one oral recitation question for a political science student.
Topic: {title}
Return only JSON with this shape: {{"prompt":"...", "follow_up":"..."}}.
The question must require explanation, not a yes/no answer.""")
        question = one(
            """INSERT INTO recitation_questions (session_id, prompt, position)
               VALUES (%s, %s, 1) RETURNING id, session_id, prompt, answer, answer_mode, evaluation, position""",
            (session["id"], required_text(generated.get("prompt"), "prompt")),
        )
        return {"session": session, "question": question, "followUp": generated.get("follow_up", "")}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "Could not generate an AI recitation question") from error


@app.post("/api/recitations/questions/{question_id}/answer")
def answer_recitation(question_id: int, body: dict[str, Any]):
    answer = required_text(body.get("answer"), "answer")
    question = one(
        """SELECT q.id, q.prompt, q.session_id, s.title
           FROM recitation_questions q JOIN recitation_sessions s ON s.id = q.session_id
           WHERE q.id = %s""",
        (question_id,),
    )
    if not question:
        raise HTTPException(404, "Recitation question not found")
    try:
        evaluation = ai_json(f"""Evaluate this political science oral recitation answer.
Topic: {question["title"]}
Question: {question["prompt"]}
Answer: {answer}
Return only JSON with keys: score (number 0-100), accuracy (one sentence), strengths (array of strings), improvements (array of strings), follow_up (string).""")
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "Could not evaluate the recitation answer") from error
    saved = one(
        """UPDATE recitation_questions
           SET answer = %s, answer_mode = %s, evaluation = %s
           WHERE id = %s
           RETURNING id, session_id, prompt, answer, answer_mode, evaluation, position""",
        (answer, body.get("answerMode", "written"), json.dumps(evaluation), question_id),
    )
    score = evaluation.get("score")
    if isinstance(score, (int, float)):
        one("UPDATE recitation_sessions SET score = %s, summary = %s WHERE id = %s RETURNING id", (score, str(evaluation.get("accuracy", "")), question["session_id"]))
    return saved


@app.post("/api/recitations/transcribe")
async def transcribe_recitation(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(400, "An audio file is required")
    content = await file.read()
    if not content:
        raise HTTPException(400, "The audio file is empty")
    try:
        client, _ = ai_client()
        transcript = client.audio.transcriptions.create(
            model=os.getenv("TRANSCRIBE_MODEL", "whisper-large-v3-turbo" if os.getenv("GROQ_API_KEY") else "gpt-4o-mini-transcribe"),
            file=(file.filename or "recitation.webm", content, file.content_type),
        )
        return {"text": transcript.text}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "Could not transcribe the audio answer") from error


@app.get("/api/knowledge/entities")
def list_knowledge_entities(search: str = ""):
    pattern = f"%{search.strip()}%"
    return rows(
        """SELECT id, entity_type, name, summary, details, created_at
           FROM knowledge_entities
           WHERE name ILIKE %s OR summary ILIKE %s
           ORDER BY name""",
        (pattern, pattern),
    )


@app.post("/api/knowledge/entities", status_code=201)
def create_knowledge_entity(body: dict[str, Any]):
    entity_type = required_text(body.get("entityType"), "entityType")
    if entity_type not in {"thinker", "theory", "ideology", "concept", "event", "institution"}:
        raise HTTPException(400, "Invalid knowledge entity type")
    name = required_text(body.get("name"), "name")
    return one(
        """INSERT INTO knowledge_entities (entity_type, name, summary, details)
           VALUES (%s, %s, %s, %s) RETURNING id, entity_type, name, summary, details, created_at""",
        (entity_type, name, body.get("summary", ""), json.dumps(body.get("details", {}))),
    )


@app.get("/api/knowledge/relationships")
def list_knowledge_relationships():
    return rows(
        """SELECT r.id, r.relationship, r.from_entity_id, r.to_entity_id,
                  f.name AS from_name, t.name AS to_name
           FROM knowledge_relationships r
           JOIN knowledge_entities f ON f.id = r.from_entity_id
           JOIN knowledge_entities t ON t.id = r.to_entity_id
           ORDER BY r.id DESC"""
    )


@app.post("/api/knowledge/relationships", status_code=201)
def create_knowledge_relationship(body: dict[str, Any]):
    from_id = body.get("fromEntityId")
    to_id = body.get("toEntityId")
    relationship = required_text(body.get("relationship"), "relationship")
    if not from_id or not to_id or from_id == to_id:
        raise HTTPException(400, "Two different entities are required")
    return one(
        """INSERT INTO knowledge_relationships (from_entity_id, to_entity_id, relationship)
           VALUES (%s, %s, %s)
           ON CONFLICT (from_entity_id, to_entity_id, relationship) DO UPDATE SET relationship = EXCLUDED.relationship
           RETURNING id, from_entity_id, to_entity_id, relationship""",
        (from_id, to_id, relationship),
    )


@app.get("/api/deadlines")
def list_deadlines():
    return rows("SELECT * FROM deadlines ORDER BY id")


@app.post("/api/deadlines", status_code=201)
def create_deadline(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")
    subject = required_text(body.get("subject"), "subject")
    date = required_text(body.get("date"), "date")
    return one("INSERT INTO deadlines (title, subject, date, tone) VALUES (%s, %s, %s, %s) RETURNING *", (title, subject, date, body.get("tone", "normal")))


@app.get("/api/calendar-events")
def list_calendar_events():
    return rows("SELECT * FROM calendar_events ORDER BY date, time")


@app.post("/api/calendar-events", status_code=201)
def create_calendar_event(body: dict[str, Any]):
    for field in ("title", "date", "type", "time"):
        if body.get(field) in (None, ""):
            raise HTTPException(400, "title, date, type, and time are required")
    return one("INSERT INTO calendar_events (title, date, type, time) VALUES (%s, %s, %s, %s) RETURNING *", (body["title"], body["date"], body["type"], body["time"]))
