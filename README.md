# Polis

Personal academic dashboard built with React, TypeScript, Vite, Express, and SQLite.

## Local development

Install dependencies, then run the Python API and frontend in separate terminals:

```bash
npm install
python -m pip install -r requirements.txt
npm run dev:server
npm run dev
```

The FastAPI service runs on `http://localhost:8000`, applies `server/schema.sql` to Neon Postgres on startup, and uses the pooled `DATABASE_URL` for requests. The Vite development server proxies `/api` to it.

Start both commands in separate terminals. If the dashboard shows an API connection error, confirm that `npm run dev:server` is still running and that `http://localhost:8000/api/health` returns a successful response.

The previous Express/SQLite implementation remains in `server/index.cjs` for reference, but is no longer the default `dev:server` command.

### Deploying on Vercel

Vercel detects the root `index.py` FastAPI app. FastAPI serves the built React files from `dist` and handles the `/api/*` routes. Do not force the Vercel Framework Preset to Vite. Add these project environment variables in Vercel:

- `DATABASE_URL`: Neon pooled connection string for web requests.
- `NEON_REALTIME_URL`: the public Realtime URL, if the client uses Realtime.
- `POLIS_AUTO_MIGRATE`: set to `false` for deployments; the Neon schema is in `server/schema.sql`.
- `GROQ_API_KEY`: optional Groq key for the OpenAI-compatible AI workflows.
- `GROQ_MODEL`: optional Groq model override; defaults to `openai/gpt-oss-120b`.
- `OPENAI_API_KEY`: optional fallback/provider key for AI workflows and audio transcription.
- `TRANSCRIBE_MODEL`: optional transcription model override.

Apply schema changes separately with `DATABASE_URL_UNPOOLED` and the direct migration workflow. Do not use the unpooled URL for normal request traffic.

## Neon services

The project is linked to the `production` branch in Neon. `neon.ts` provisions the `assets` Object Storage bucket, the `health` Neon Function, and Realtime. Run `neon deploy --env .env.local` after changing the infrastructure config.

The local API loads Neon variables from `.env.local` and exposes `GET /api/neon/health`. That endpoint proxies the deployed Function, which verifies Postgres connectivity, writes and deletes a temporary Object Storage object, and confirms the Realtime URL is configured.

## Available API resources

- `GET/POST /api/subjects`
- `GET/POST /api/deadlines`
- `GET/POST /api/calendar-events`
- `GET/POST /api/materials`
- `GET/POST/PATCH /api/notes`
- `GET/POST /api/annotations`
- `GET/POST /api/documents`
- `GET/POST/PATCH/DELETE /api/research/projects`
- `GET/POST/PATCH/DELETE /api/research/sources`

The Research assistant stores projects, source metadata, APA 7 references, and literature review notes in Postgres. Apply `server/migrations/002_research_source_metadata.sql` to an existing database before deploying the Research assistant update; fresh databases receive the same column from `server/schema.sql`.

The calendar stores full event dates in Postgres. Apply `server/migrations/003_calendar_event_date.sql` to an existing database before deploying the calendar update; existing November 2026 events are retained, and fresh databases receive the new date column from `server/schema.sql`.

### Product foundation

The schema also reserves first-class Postgres tables for AI recitation, debate practice,
political knowledge graphs, research projects and sources, study sessions, and application
settings. The feature navigation is intentionally scaffolded before wiring provider-backed
workflows. Set provider keys only in Vercel or a local ignored environment file; never commit them.
When both keys exist, Groq is used for text generation and transcription. Voice answers
use browser microphone permissions and the configured transcription provider.

Each subject opens an Academic Workspace with Markdown/rich-text notes, autosave on blur, folders/tags, favorites-ready records, material links, local document metadata, TXT/Markdown text extraction, annotations, workspace search, and browser print/PDF export.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
