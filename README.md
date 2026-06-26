# MeridianSAT

A clean, modern web app that delivers **custom, personalized SAT lessons** for each
student. As the tutor (admin) you have full control over everything students see —
lessons, questions, study plans, and the lesson-approval workflow.

Built with **Next.js 14 + Supabase + Tailwind CSS**, ready to deploy on **Vercel**.

---

## ✨ Features

**For students** (sign in with a simple access code — no passwords):
- A short onboarding survey, then a personalized study plan prepared by their tutor
- Personalized concept lessons (Markdown + math rendering)
- SAT-style practice questions with instant scoring and explanations
- Activity tracking that helps the tutor tailor future lessons
- Clean, mobile-friendly interface

**For you, the tutor** (one password):
- **Review queue** — every new student's plan + first lessons arrive as a request you
  approve, refine, or send back for a better version
- **Manage students** — add/edit/remove, set grade, target score, weak areas
- **Insights** — engagement, time-on-task, study breakdown, streaks, labels, key
  points, and recommendations per student
- **Edit everything** — every lesson, question, choice, answer, explanation, and plan
- **Lesson style** — fine-tune how lessons are written
- **Analytics** — completions and average scores
- **Publish/draft** — control exactly what each student sees

---

## 🔄 How the lesson-approval workflow works

1. A student signs in with their access code and completes a short survey.
2. Their page locks into a **"tutor is preparing your lessons"** state.
3. In the background, a personalized **study plan + first set of lessons** is drafted
   and sent to you as a **pending request** (the student never sees draft text).
4. In the **Review** tab you can refine the draft, edit it, **Approve** it, or
   **Send it back & rebuild** with optional feedback for an improved version.
5. On approval, the lessons publish and the student's page **auto-unlocks** — no
   action needed on their side.

---

## 🚀 Quick start (deploy to Vercel)

You'll set up three things: **Supabase** (database), **GitHub** (your code),
and **Vercel** (hosting). All have free tiers.

### Step 1 — Create the Supabase database

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Open **SQL Editor → New query**.
3. Open [`supabase/schema.sql`](./supabase/schema.sql), copy all of it, paste it
   into the editor, and click **Run**. This creates all tables and seeds defaults.
4. Go to **Project Settings → API** and copy the **Project URL** and **anon public**
   key for your environment variables.

### Step 2 — Push to GitHub

```bash
cd meridian-sat
git init
git add .
git commit -m "Initial commit: MeridianSAT"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/meridian-sat.git
git branch -M master
git push -u origin master
```

> The `.gitignore` already excludes `.env.local` so your keys are never committed.

### Step 3 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and
   import your `meridian-sat` GitHub repo.
2. Add your environment variables (see `.env.example`).
3. Click **Deploy**. Your app is live at `https://your-app.vercel.app`.

---

## 🧑‍🏫 How to use it

1. Visit your live URL and click **Tutor** (top right). Log in with your password.
2. **Students tab** → create a student with a name and an **access code**
   (e.g. `EMMA2026`). Set their grade, target score, and weak areas.
3. Give the student their access code. They sign in, complete the survey, and their
   plan is drafted to your **Review** tab.
4. **Review tab** → approve, refine, or send back. On approval the student unlocks.
5. **Insights / Analytics tabs** → track progress, time, and engagement.

---

## 💻 Run locally (optional)

```bash
cp .env.example .env.local   # then fill in your real keys
npm install
npm run dev                  # http://localhost:3000
```

---

## 🔐 Security notes

- API keys live only in environment variables, never in the code.
- Server-only keys are used **server-side only** (inside `/api` routes) and never
  sent to the browser.
- For a small private tutoring setup this auth (one tutor password + per-student
  access codes) is simple and effective. For stronger security you can later layer
  in Supabase Auth and Row Level Security.

---

## 🛠 Tech stack

- **Next.js 14** (App Router, API routes)
- **Supabase** (PostgreSQL)
- **Tailwind CSS** + lucide-react icons
- **react-markdown** + **KaTeX** for lesson + math rendering

---

## 📁 Project structure

```
meridian-sat/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Student access-code sign in (home)
│   │   ├── student/page.tsx      # Student dashboard + lessons + practice
│   │   ├── admin/page.tsx        # Tutor dashboard (all controls)
│   │   └── api/                  # Server routes (Supabase + lesson generation)
│   ├── components/
│   │   ├── ui.tsx                # Buttons, cards, inputs, logo
│   │   ├── Markdown.tsx          # Markdown + math renderer
│   │   ├── Onboarding.tsx        # Student onboarding survey
│   │   ├── Preparing.tsx         # Locked "preparing" waiting screen
│   │   ├── AdminReview.tsx       # Lesson-approval review queue
│   │   ├── AdminInsights.tsx     # Per-student insights
│   │   └── LessonEditor.tsx      # Full lesson editor (tutor)
│   └── lib/
│       ├── supabase.ts           # DB client + types
│       ├── insights.ts           # Engagement + study breakdown
│       ├── lessongen.ts          # Draft package generation
│       └── track.ts              # Client activity tracking
├── supabase/schema.sql           # Run this in Supabase once
├── .env.example                  # Copy to .env.local
└── README.md
```
