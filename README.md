# SAT Tutor 🎓

A simple, beautiful web app that creates **personalized SAT lessons** for each
student using the **DeepSeek V4 Pro** API. You (the admin) have full control to
edit everything students see — lessons, questions, study plans, and even the AI
prompts themselves.

Built with **Next.js 14 + Supabase + Tailwind CSS**, ready to deploy on **Vercel**.

---

## ✨ Features

**For students** (sign in with a simple access code — no passwords):
- Personalized concept lessons (Markdown + math rendering)
- SAT-style practice questions with instant scoring and explanations
- A tailored study plan
- Clean, mobile-friendly interface

**For you, the admin** (one password):
- **Manage students** — add/edit/remove, set grade, target score, weak areas
- **Generate lessons** with DeepSeek V4 Pro, personalized per student
- **Edit everything** — every lesson, question, choice, answer, explanation, and study plan
- **Control the AI** — edit the exact prompts the AI uses to write lessons
- **Analytics** — see each student's completions and average scores
- **Publish/draft** — control exactly what each student sees

---

## 🚀 Quick start (deploy to Vercel in ~15 minutes)

You'll set up three things: **Supabase** (database), **GitHub** (your code),
and **Vercel** (hosting). All have free tiers.

### Step 1 — Create the Supabase database

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. In your project, open **SQL Editor → New query**.
3. Open the file [`supabase/schema.sql`](./supabase/schema.sql) from this repo,
   copy all of it, paste it into the editor, and click **Run**.
   This creates all tables and seeds the default AI prompts.
4. Go to **Project Settings → API** and copy these three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### Step 2 — Get your DeepSeek API key

1. Sign up at [platform.deepseek.com](https://platform.deepseek.com).
2. Create an API key under **API Keys**. It looks like `sk-...`.
3. This is your `DEEPSEEK_API_KEY`.

### Step 3 — Push to GitHub

```bash
cd sat-tutor
git init
git add .
git commit -m "Initial commit: SAT Tutor"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/sat-tutor.git
git branch -M main
git push -u origin main
```

> The `.gitignore` already excludes `.env.local` so your keys are never committed.

### Step 4 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and
   import your `sat-tutor` GitHub repo.
2. Before deploying, open **Environment Variables** and add all five:

   | Name | Value |
   |------|-------|
   | `DEEPSEEK_API_KEY` | your `sk-...` key |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service role key |
   | `ADMIN_PASSWORD` | a strong password you choose for admin login |

3. Click **Deploy**. Done! Your app is live at `https://your-app.vercel.app`.

---

## 🧑‍🏫 How to use it

1. Visit your live URL and click **Admin** (top right). Log in with your
   `ADMIN_PASSWORD`.
2. **Students tab** → create a student. Give them a name and an **access code**
   (e.g. `EMMA2026`). Set their grade, target score, and weak areas.
3. **Generate tab** → pick the student, a section, a topic, and difficulty, then
   click **Generate lesson**. DeepSeek writes a personalized lesson + questions.
4. **Lessons tab** → review and **edit everything** before the student sees it.
   Set status to *Published* to make it visible, or *Draft* to hide it.
5. Give the student their access code. They go to the home page, type the code,
   and start learning.
6. **Analytics tab** → track their progress and scores.
7. **AI Prompts tab** → fine-tune how the AI writes lessons (advanced).

---

## 💻 Run locally (optional)

```bash
cp .env.example .env.local   # then fill in your real keys
npm install
npm run dev                  # http://localhost:3000
```

---

## 🔐 Security notes

- Your API keys live only in environment variables, never in the code.
- The `service_role` key and `DEEPSEEK_API_KEY` are used **server-side only**
  (inside `/api` routes) and are never sent to the browser.
- **If you ever shared your DeepSeek key in plain text, regenerate it** in the
  DeepSeek dashboard.
- For a small private tutoring setup this auth (one admin password + per-student
  access codes) is simple and effective. If you later need stronger security,
  you can layer in Supabase Auth and Row Level Security.

---

## 🛠 Tech stack

- **Next.js 14** (App Router, API routes)
- **Supabase** (PostgreSQL)
- **DeepSeek V4 Pro** (`deepseek-v4-pro`, OpenAI-compatible API)
- **Tailwind CSS** + lucide-react icons
- **react-markdown** + **KaTeX** for lesson + math rendering

---

## 📁 Project structure

```
sat-tutor/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Student access-code sign in (home)
│   │   ├── student/page.tsx      # Student dashboard + lessons + practice
│   │   ├── admin/page.tsx        # Admin dashboard (all controls)
│   │   └── api/                  # Server routes (DeepSeek + Supabase)
│   ├── components/
│   │   ├── ui.tsx                # Buttons, cards, inputs, etc.
│   │   ├── Markdown.tsx          # Markdown + math renderer
│   │   └── LessonEditor.tsx      # Full lesson editor (admin)
│   └── lib/
│       ├── supabase.ts           # DB client + types
│       └── deepseek.ts           # DeepSeek V4 Pro client
├── supabase/schema.sql           # Run this in Supabase once
├── .env.example                  # Copy to .env.local
└── README.md
```

Enjoy! 🎉
