# LEAP Backend API

Node.js + Express + MongoDB + JWT Authentication backend.

## Features
- User Registration & Login
- JWT Authentication
- Role-based access
- Protected routes
- Middleware handling
- MongoDB integration

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
