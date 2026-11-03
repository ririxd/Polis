from __future__ import annotations

import os
import json
from contextlib import asynccontextmanager
from datetime import date as calendar_date_type
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
from psycopg.errors import UndefinedColumn
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


STUDY_TOOL_PROMPTS = {
    "simplify": "Explain the material in plain language for a student new to the topic. Keep important nuance and add a short example.",
    "writing": "Give academic writing assistance. Return a revised version that preserves the student's meaning, followed by concise notes on structure, clarity, and evidence. Do not invent facts or sources.",
    "summarize": "Summarize the supplied chapter or notes. Organize the summary by main argument, section or theme, supporting evidence, and takeaway. Do not add unsupported material.",
    "concepts": "Extract the key concepts. For each, give a concise definition and explain why it matters in this material. Return a JSON array of objects with concept and explanation.",
    "definitions": "Extract important terms and define them in the context of the supplied material. Return a JSON array of objects with term and definition.",
    "study-guide": "Create a structured study guide with learning objectives, key ideas, important terms, connections, and self-check questions. Ground it in the supplied material.",
    "reviewer": "Create a concise exam reviewer from the supplied material, with section headings, key facts, distinctions, and memory cues. Ground it in the source.",
    "source-answer": "Answer the student's question using only the supplied sources. Cite source labels such as [Source 1] next to supported claims, distinguish direct evidence from inference, and say when the sources do not establish an answer. Never invent citations.",
}


@app.post("/api/study/generate")
def generate_study_material(body: dict[str, Any]):
    kind = body.get("kind")
    if kind not in STUDY_TOOL_PROMPTS:
        raise HTTPException(400, "Unknown study tool")
    content = required_text(body.get("content"), "content")
    topic = str(body.get("topic", "")).strip()[:300]
    if len(content) > 24000:
        raise HTTPException(400, "Please keep source text under 24,000 characters")
    try:
        result = ai_json(f"""You are Polis, a careful academic study assistant.
Task: {STUDY_TOOL_PROMPTS[kind]}
Topic: {topic or 'Not specified'}
Student question or instruction: {str(body.get('question', '')).strip()[:3000] or 'Use the selected study tool.'}
Source material:
{content}
Return JSON with one string field named 'result'. For list-based tasks, put a readable numbered list in result. Keep the response useful and focused.""")
        return {"result": str(result.get("result", ""))}
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(502, "Could not generate study material") from error


@app.get("/api/study/decks")
def list_study_decks():
    return rows(
        """SELECT d.*, COUNT(c.id)::INTEGER AS card_count
           FROM study_flashcard_decks d LEFT JOIN study_flashcards c ON c.deck_id = d.id
           GROUP BY d.id ORDER BY d.created_at DESC, d.id DESC"""
    )


@app.get("/api/study/decks/{deck_id}/cards")
def list_study_cards(deck_id: int):
    return rows("SELECT * FROM study_flashcards WHERE deck_id = %s ORDER BY position, id", (deck_id,))


@app.post("/api/study/decks/{deck_id}/cards", status_code=201)
def add_study_card(deck_id: int, body: dict[str, Any]):
    front = required_text(body.get("front"), "front")[:1000]
    back = required_text(body.get("back"), "back")[:3000]
    deck = one("SELECT id FROM study_flashcard_decks WHERE id = %s", (deck_id,))
    if not deck:
        raise HTTPException(404, "Flashcard deck not found")
    return one(
        """INSERT INTO study_flashcards (deck_id, front, back, position)
           VALUES (%s, %s, %s, (SELECT COALESCE(MAX(position), -1) + 1 FROM study_flashcards WHERE deck_id = %s))
           RETURNING *""",
        (deck_id, front, back, deck_id),
    )


def save_study_deck(title: str, topic: str, source_text: str, cards: list[dict[str, Any]]):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO study_flashcard_decks (title, topic, source_text) VALUES (%s, %s, %s) RETURNING id, title, topic, source_text, created_at",
                (title, topic, source_text),
            )
            deck = cursor.fetchone()
            for position, card in enumerate(cards):
                front = required_text(card.get("front"), "card front")[:1000]
                back = required_text(card.get("back"), "card back")[:3000]
                cursor.execute(
                    "INSERT INTO study_flashcards (deck_id, front, back, position) VALUES (%s, %s, %s, %s)",
                    (deck["id"], front, back, position),
                )
    return {**deck, "card_count": len(cards)}


@app.post("/api/study/decks", status_code=201)
def create_study_deck(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")[:200]
    cards = body.get("cards", [])
    if not isinstance(cards, list) or len(cards) > 100:
        raise HTTPException(400, "cards must be a list of at most 100 cards")
    return save_study_deck(title, str(body.get("topic", ""))[:300], "", cards)


@app.post("/api/study/flashcards/generate", status_code=201)
def generate_study_flashcards(body: dict[str, Any]):
    content = required_text(body.get("content"), "content")
    count = max(2, min(int(body.get("count", 10)), 30))
    topic = str(body.get("topic", "")).strip()[:300]
    if len(content) > 24000:
        raise HTTPException(400, "Please keep source text under 24,000 characters")
    try:
        generated = ai_json(f"""Create exactly {count} useful study flashcards from the supplied material.
Group related cards under a concise topic for automatic deck organization. Make fronts answerable without context; make backs accurate and concise.
Topic hint: {topic or 'Infer from the material'}
Material:
{content}
Return JSON with title (short deck title), topic (subject/topic), cards (array of objects with front and back).""")
        cards = generated.get("cards")
        if not isinstance(cards, list) or not cards:
            raise HTTPException(502, "The AI did not return flashcards")
        deck = save_study_deck(str(generated.get("title") or topic or "Study deck")[:200], str(generated.get("topic") or topic)[:300], content[:24000], cards[:count])
        return {**deck, "cards": rows("SELECT * FROM study_flashcards WHERE deck_id = %s ORDER BY position, id", (deck["id"],))}
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(502, "Could not generate flashcards") from error


QUIZ_TYPES = {"multiple-choice", "true-false", "identification", "enumeration", "situational", "essay"}
QUIZ_DIFFICULTIES = {"beginner", "intermediate", "advanced"}


@app.post("/api/study/quizzes/generate")
def generate_study_quiz(body: dict[str, Any]):
    content = required_text(body.get("content"), "content")
    question_type = body.get("questionType")
    difficulty = body.get("difficulty")
    if question_type not in QUIZ_TYPES or difficulty not in QUIZ_DIFFICULTIES:
        raise HTTPException(400, "Choose a supported question type and difficulty")
    count = max(1, min(int(body.get("count", 10)), 30))
    if len(content) > 24000:
        raise HTTPException(400, "Please keep source text under 24,000 characters")
    shapes = {
        "multiple-choice": "options (array of 4 strings) and answer (exact option string)",
        "true-false": "options (array containing True and False) and answer (True or False)",
        "identification": "answer (short expected term or phrase)",
        "enumeration": "answer (array of required items)",
        "situational": "answer (concise expected reasoning or response)",
        "essay": "answer (a short scoring rubric with essential points)",
    }
    try:
        generated = ai_json(f"""Create exactly {count} {question_type} questions at {difficulty} difficulty from the supplied study material.
Every question must have prompt, answer, explanation, concept (a concise topic for performance analysis), and {shapes[question_type]}.
Questions must be answerable from the material and must not repeat.
Material:
{content}
Return JSON with questions as an array of objects.""")
        questions = generated.get("questions")
        if not isinstance(questions, list) or len(questions) < 1:
            raise HTTPException(502, "The AI did not return quiz questions")
        return {"topic": str(body.get("topic", "Study quiz"))[:300], "questionType": question_type, "difficulty": difficulty, "questions": questions[:count]}
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(502, "Could not generate quiz questions") from error


@app.get("/api/study/quizzes")
def list_study_quizzes():
    return rows("SELECT * FROM study_quiz_attempts ORDER BY created_at DESC, id DESC LIMIT 50")


@app.post("/api/study/quizzes/grade")
def grade_study_quiz(body: dict[str, Any]):
    questions = body.get("questions", [])
    answers = body.get("answers", [])
    if not isinstance(questions, list) or not isinstance(answers, list) or not questions or len(questions) != len(answers):
        raise HTTPException(400, "Provide one answer for each quiz question")
    try:
        result = ai_json(f"""Grade a student's quiz answers against the supplied questions and answer key.
Use partial credit for enumeration, situational, and essay responses. Be fair and concise. The score for each question must be an integer from 0 to 100; mark correct true only for a fully correct answer.
Questions and student answers:
{json.dumps([{ 'question': question, 'student_answer': answer } for question, answer in zip(questions, answers)], ensure_ascii=False)}
Return JSON with results as an array in the same order. Each result must contain score (0-100), correct (boolean), and feedback (one or two concise sentences).""")
        results = result.get("results")
        if not isinstance(results, list) or len(results) != len(questions):
            raise HTTPException(502, "The grader returned an incomplete result")
        normalized = []
        for item in results:
            normalized.append({
                "score": max(0, min(100, int(item.get("score", 0)))),
                "correct": bool(item.get("correct", False)),
                "feedback": str(item.get("feedback", ""))[:1000],
            })
        return {"results": normalized}
    except Exception as error:
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(502, "Could not grade this quiz") from error


@app.post("/api/study/quizzes/attempts", status_code=201)
def save_study_quiz_attempt(body: dict[str, Any]):
    questions = body.get("questions", [])
    answers = body.get("answers", [])
    results = body.get("results", [])
    if not isinstance(questions, list) or not isinstance(answers, list) or not questions:
        raise HTTPException(400, "Quiz questions and answers are required")
    total = len(questions)
    score = max(0, min(int(body.get("score", 0)), 100))
    return one(
        """INSERT INTO study_quiz_attempts (topic, question_type, difficulty, question_count, score, total, answers, results, questions, duration_seconds)
           VALUES (%s, %s, %s, %s, %s, 100, %s::jsonb, %s::jsonb, %s::jsonb, %s)
           RETURNING *""",
        (str(body.get("topic", "Study quiz"))[:300], str(body.get("questionType", "multiple-choice")), str(body.get("difficulty", "intermediate")), total, score, json.dumps(answers), json.dumps(results), json.dumps(questions), max(0, int(body.get("durationSeconds", 0)))),
    )


@app.get("/api/research/projects")
def list_research_projects():
    return rows("SELECT * FROM research_projects ORDER BY created_at DESC, id DESC")


@app.post("/api/research/projects", status_code=201)
def create_research_project(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")
    outline = body.get("outline", [])
    if not isinstance(outline, list):
        raise HTTPException(400, "outline must be a list")
    return one(
        """INSERT INTO research_projects (title, research_question, thesis, outline)
           VALUES (%s, %s, %s, %s::jsonb) RETURNING *""",
        (title, str(body.get("research_question", ""))[:2000], str(body.get("thesis", ""))[:4000], json.dumps(outline)),
    )


@app.patch("/api/research/projects/{project_id}")
def update_research_project(project_id: int, body: dict[str, Any]):
    if "outline" in body and not isinstance(body["outline"], list):
        raise HTTPException(400, "outline must be a list")
    title = required_text(body["title"], "title") if "title" in body else None
    outline = json.dumps(body["outline"]) if "outline" in body else None
    project = one(
        """UPDATE research_projects SET title = COALESCE(%s, title),
           research_question = COALESCE(%s, research_question), thesis = COALESCE(%s, thesis),
           outline = COALESCE(%s::jsonb, outline) WHERE id = %s RETURNING *""",
        (title, body.get("research_question"), body.get("thesis"), outline, project_id),
    )
    if not project:
        raise HTTPException(404, "Research project not found")
    return project


@app.delete("/api/research/projects/{project_id}", status_code=204)
def delete_research_project(project_id: int):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM research_projects WHERE id = %s", (project_id,))
            if cursor.rowcount == 0:
                raise HTTPException(404, "Research project not found")


@app.get("/api/research/sources")
def list_research_sources(project_id: int | None = Query(default=None, alias="projectId")):
    if project_id is None:
        return rows("SELECT * FROM research_sources ORDER BY created_at DESC, id DESC")
    return rows("SELECT * FROM research_sources WHERE project_id = %s ORDER BY created_at DESC, id DESC", (project_id,))


@app.post("/api/research/sources", status_code=201)
def create_research_source(body: dict[str, Any]):
    title = required_text(body.get("title"), "title")
    metadata = body.get("metadata", {})
    if not isinstance(metadata, dict):
        raise HTTPException(400, "metadata must be an object")
    return one(
        """INSERT INTO research_sources (project_id, title, url, doi, citation, notes, metadata)
           VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb) RETURNING *""",
        (body.get("project_id"), title, str(body.get("url", ""))[:2000], str(body.get("doi", ""))[:300],
         str(body.get("citation", ""))[:4000], str(body.get("notes", ""))[:8000], json.dumps(metadata)),
    )


@app.patch("/api/research/sources/{source_id}")
def update_research_source(source_id: int, body: dict[str, Any]):
    metadata = body.get("metadata")
    if metadata is not None and not isinstance(metadata, dict):
        raise HTTPException(400, "metadata must be an object")
    title = required_text(body["title"], "title") if "title" in body else None
    saved = one(
        """UPDATE research_sources SET project_id = COALESCE(%s, project_id),
           title = COALESCE(%s, title), url = COALESCE(%s, url), doi = COALESCE(%s, doi),
           citation = COALESCE(%s, citation), notes = COALESCE(%s, notes),
           metadata = COALESCE(%s::jsonb, metadata) WHERE id = %s RETURNING *""",
        (body.get("project_id"), title, body.get("url"), body.get("doi"), body.get("citation"),
         body.get("notes"), json.dumps(metadata) if metadata is not None else None, source_id),
    )
    if not saved:
        raise HTTPException(404, "Research source not found")
    return saved


@app.delete("/api/research/sources/{source_id}", status_code=204)
def delete_research_source(source_id: int):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM research_sources WHERE id = %s", (source_id,))
            if cursor.rowcount == 0:
                raise HTTPException(404, "Research source not found")


@app.post("/api/chat")
def chat_with_tutor(body: dict[str, Any]):
    raw_messages = body.get("messages")
    if not isinstance(raw_messages, list) or not raw_messages or len(raw_messages) > 20:
        raise HTTPException(400, "Send between 1 and 20 chat messages")

    messages: list[dict[str, str]] = []
    for item in raw_messages:
        if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
            raise HTTPException(400, "Each message needs a user or assistant role")
        content = required_text(item.get("content"), "message content")
        if len(content) > 4000:
            raise HTTPException(400, "Messages must be 4000 characters or fewer")
        messages.append({"role": item["role"], "content": content})

    client, model = ai_client()
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are Polis Study Assistant, a supportive academic tutor for a political science student. Help with concepts, study plans, writing feedback, and using the Polis app. Explain ideas clearly, ask useful follow-up questions, and be honest when uncertain. Do not invent citations or claim to have read materials the student has not shared. Keep answers focused and use plain language."},
                *messages,
            ],
        )
        answer = response.choices[0].message.content
        if not answer:
            raise HTTPException(502, "The AI returned an empty response")
        return {"answer": answer}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "Could not get a response from the study assistant") from error


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


def debate_payload(debate_id: int, report: dict[str, Any] | None = None) -> dict[str, Any]:
    debate = one("SELECT id, topic, position, summary, score, created_at FROM debates WHERE id = %s", (debate_id,))
    if not debate:
        raise HTTPException(404, "Debate not found")
    debate["turns"] = rows(
        "SELECT id, speaker, content, evaluation, position FROM debate_arguments WHERE debate_id = %s ORDER BY position",
        (debate_id,),
    )
    if report is None and debate["score"] is not None:
        final_turn = next((turn for turn in reversed(debate["turns"]) if turn["speaker"] == "user"), None)
        report = (final_turn or {}).get("evaluation", {}).get("report")
        if not report:
            report = {"score": debate["score"], "summary": debate["summary"]}
    if report:
        debate["report"] = report
    return debate


@app.get("/api/debates")
def list_debates():
    return rows("SELECT id, topic, position, summary, score, created_at FROM debates ORDER BY created_at DESC LIMIT 20")


@app.get("/api/debates/{debate_id}")
def get_debate(debate_id: int):
    return debate_payload(debate_id)


@app.post("/api/debates", status_code=201)
def create_debate(body: dict[str, Any]):
    topic = required_text(body.get("topic"), "topic")
    position = body.get("position")
    if position not in ("for", "against"):
        raise HTTPException(400, "position must be for or against")
    debate = one(
        "INSERT INTO debates (topic, position) VALUES (%s, %s) RETURNING id",
        (topic, position),
    )
    try:
        opening = ai_json(f"""You are a rigorous, respectful political debate partner.
Motion: {topic}
The student is arguing {position}. You argue the opposing side.
Give a concise opening statement with one clear claim and reasoning, ending with one direct question to the student.
Return JSON: {{"content":"..."}}.""")
        one(
            "INSERT INTO debate_arguments (debate_id, speaker, content, position) VALUES (%s, 'ai', %s, 1) RETURNING id",
            (debate["id"], required_text(opening.get("content"), "opening")),
        )
    except Exception as error:
        one("DELETE FROM debates WHERE id = %s RETURNING id", (debate["id"],))
        if isinstance(error, HTTPException):
            raise
        raise HTTPException(502, "Could not prepare the AI debate partner") from error
    return debate_payload(debate["id"])


@app.post("/api/debates/{debate_id}/arguments")
def submit_debate_argument(debate_id: int, body: dict[str, Any]):
    argument = required_text(body.get("argument"), "argument")
    debate = one("SELECT id, topic, position FROM debates WHERE id = %s", (debate_id,))
    if not debate:
        raise HTTPException(404, "Debate not found")
    history = rows("SELECT speaker, content FROM debate_arguments WHERE debate_id = %s ORDER BY position", (debate_id,))
    if not history or history[-1]["speaker"] != "ai":
        raise HTTPException(409, "Wait for the AI partner before submitting another argument")
    user_round = sum(1 for turn in history if turn["speaker"] == "user") + 1
    if user_round > 3:
        raise HTTPException(409, "This debate is complete")
    try:
        evaluation = ai_json(f"""Evaluate this argument in a political debate. Be constructive and identify fallacies only when clearly present.
Motion: {debate['topic']}
Student's side: {debate['position']}
Student argument: {argument}
Return JSON with score (0-100), feedback (one or two sentences), strengths (array), improvements (array), fallacies (array of fallacy names or empty).""")
        transcript = "\n".join(f"{turn['speaker']}: {turn['content']}" for turn in history[-5:])
        if user_round < 3:
            reply = ai_json(f"""Continue as a fair, challenging political debate opponent. Respond directly to the student's argument, identify the strongest counterpoint, and end with a focused question. Keep it under 120 words.
Motion: {debate['topic']}
Your side: {'against' if debate['position'] == 'for' else 'for'}
Recent debate:
{transcript}
student: {argument}
Return JSON: {{"content":"..."}}.""")
            partner_content = required_text(reply.get("content"), "reply")
            report = None
        else:
            report = ai_json(f"""Create a concise performance report for this political debate.
Motion: {debate['topic']}
Student's side: {debate['position']}
Student arguments:
{transcript}
student: {argument}
Return JSON with score (0-100), summary (2 sentences), strengths (array), improvements (array), fallacies (array; empty if none clearly present).""")
            partner_content = None

        if partner_content:
            one(
                "INSERT INTO debate_arguments (debate_id, speaker, content, evaluation, position) VALUES (%s, 'user', %s, %s, %s) RETURNING id",
                (debate_id, argument, json.dumps(evaluation), len(history) + 1),
            )
            one(
                "INSERT INTO debate_arguments (debate_id, speaker, content, position) VALUES (%s, 'ai', %s, %s) RETURNING id",
                (debate_id, partner_content, len(history) + 2),
            )
            return debate_payload(debate_id)

        evaluation["report"] = report
        score = report.get("score")
        one(
            "INSERT INTO debate_arguments (debate_id, speaker, content, evaluation, position) VALUES (%s, 'user', %s, %s, %s) RETURNING id",
            (debate_id, argument, json.dumps(evaluation), len(history) + 1),
        )
        one("UPDATE debates SET score = %s, summary = %s WHERE id = %s RETURNING id", (score, str(report.get("summary", "")), debate_id))
        return debate_payload(debate_id, report)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, "Could not evaluate the argument or generate the debate response") from error


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


@app.delete("/api/knowledge/entities/{entity_id}", status_code=204)
def delete_knowledge_entity(entity_id: int):
    with pool.connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM knowledge_entities WHERE id = %s", (entity_id,))


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
    try:
        return rows("""SELECT *, COALESCE(event_date, make_date(2026, 11, LEAST(GREATEST(date, 1), 30)))::text AS calendar_date
                      FROM calendar_events
                      ORDER BY COALESCE(event_date, make_date(2026, 11, LEAST(GREATEST(date, 1), 30))), time""")
    except UndefinedColumn:
        return rows("""SELECT *, make_date(2026, 11, LEAST(GREATEST(date, 1), 30))::text AS calendar_date
                      FROM calendar_events
                      ORDER BY date, time""")


@app.post("/api/calendar-events", status_code=201)
def create_calendar_event(body: dict[str, Any]):
    for field in ("title", "date", "type", "time"):
        if body.get(field) in (None, ""):
            raise HTTPException(400, "title, date, type, and time are required")
    try:
        if isinstance(body["date"], int):
            event_date = calendar_date_type(2026, 11, body["date"])
        else:
            event_date = calendar_date_type.fromisoformat(str(body["date"]))
    except (TypeError, ValueError) as error:
        raise HTTPException(400, "date must be a valid calendar date in YYYY-MM-DD format") from error
    try:
        return one(
            """INSERT INTO calendar_events (title, date, event_date, type, time)
               VALUES (%s, %s, %s, %s, %s) RETURNING *, event_date::text AS calendar_date""",
            (required_text(body["title"], "title"), event_date.day, event_date, required_text(body["type"], "type"), required_text(body["time"], "time")),
        )
    except UndefinedColumn:
        return one(
            """INSERT INTO calendar_events (title, date, type, time)
               VALUES (%s, %s, %s, %s) RETURNING *, make_date(2026, 11, date)::text AS calendar_date""",
            (required_text(body["title"], "title"), event_date.day, required_text(body["type"], "type"), required_text(body["time"], "time")),
        )
