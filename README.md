# LEAP Backend API

Node.js + Express + MongoDB + JWT Authentication backend.

## Features
- User Registration & Login
- JWT Authentication
- Role-based access
- Protected routes
- Middleware handling
- MongoDB integration
- AI auto-grading on submit (Gemini)
- Score system out of 10
- Late submission penalty (per experiment due date)

## Tech Stack
- Node.js
- Express.js
- MongoDB
- JWT
- Bcrypt

## Setup

```bash
npm install
npm run seed
npm run dev
```

## Environment Variables

Add these in `.env`:

```env
MONGO_URI=...
JWT_SECRET=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

If `GEMINI_API_KEY` is missing, backend uses a local heuristic fallback scorer.

## AI Grading Flow

- Student submits via `POST /api/submissions` with `status: "submitted"`.
- Backend auto-evaluates code using:
1. Output-match score
2. Code-quality score
3. Late penalty using experiment `dueAt` and `latePenaltyPerDay`
- Final score saved in submission as `score` (0-10) with `feedback`.

Optional manual grading preview endpoint:

`POST /api/grade/run`

Request body:

```json
{
  "experimentId": "EXPERIMENT_ID",
  "files": [{ "name": "main.js", "content": "...", "type": "file", "path": "main.js" }],
  "executionResult": { "stdout": "...", "stderr": "", "exitCode": 0 }
}
```

## Seed Default Data

The seed command is idempotent (safe to run multiple times). It creates default users, labs, and experiments.

```bash
npm run seed
```

## Default Login Accounts

Use `POST /api/auth/login` with `email` (or `idOrUsername`) and `password`.

| Role    | Email                    | Password   |
|---------|--------------------------|------------|
| admin   | admin@leap.local         | admin123   |
| hod     | hod@leap.local           | hod123     |
| teacher | teacher.os@leap.local    | teacher123 |
| teacher | teacher.algo@leap.local  | teacher123 |
| student | stu-01@leap.local        | student123 |
| student | stu-02@leap.local        | student123 |

Students also have roll numbers seeded:
- `stu-01`
- `stu-02`

So you can also login with:
- `idOrUsername: "stu-01"` + `password: "student123"`
- `idOrUsername: "stu-02"` + `password: "student123"`
