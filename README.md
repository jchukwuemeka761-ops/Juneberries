# Juneberry International Schools — CBT & Examination Management Portal

A full-stack Computer-Based Testing (CBT) and Examination Management System built for **Juneberry International Schools** covering **Primary 1 to Senior Secondary School 3 (SSS 3)**.

## Architecture Overview

- **Frontend**: React 19, TypeScript, Next.js 15 App Router, Tailwind CSS v4, Lucide Icons, Recharts, jsPDF, SheetJS (`xlsx`).
- **Backend API & Engine**: Next.js API Routes (`/api/auth/*`, `/api/portal/bootstrap`, `/api/questions`, `/api/exams`, `/api/cbt`, `/api/results`, `/api/admin/manage`) enforcing HMAC-SHA256 Bearer authentication, `scrypt` password hashing, server-controlled CBT deadlines, atomic persistence, and role-based access control.
- **Supabase Production Schema**: Complete 26-table PostgreSQL schema (`supabase/migrations/001_schema.sql`), Row Level Security (`supabase/migrations/002_rls_policies.sql`), Edge Function (`supabase/functions/submit-exam/index.ts`), and controlled initial configuration (`supabase/seed.sql`).

## User Roles

1. **Super Administrator** — Full school oversight, student & staff provisioning, academic structure, question & result approvals, audit logs, grading scale & branding settings.
2. **Examination Officer** — Exam scheduling, question paper assembly, live monitoring, and result coordination.
3. **Principal / Management** — School-wide academic analytics, class & departmental reports, teacher activity monitoring.
4. **Head of Department (HOD)** — Departmental teachers, subjects, question review & approval, departmental performance analytics.
5. **Subject Teacher** — Question bank management (all 8 question types), CSV/Excel bulk import with validation report, essay manual grading, subject analytics.
6. **Invigilator** — Live examination monitoring, attendance status, and examination incident reporting.
7. **Student** — Self-registration with admission number validation, available exams, distraction-minimised CBT runner with server-enforced timer and auto-save recovery, published result transcripts & PDF downloads.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. On first launch, use the **First-Run Administrator Setup** screen to claim the initial Super Administrator account (no hardcoded admin passwords exist in the codebase).

## Running Automated Unit Tests

```bash
npx --yes tsx --test lib/cbt-engine.test.ts lib/bulk-import.test.ts lib/server/security.test.ts
```

## Supabase & Netlify Deployment

1. Run `supabase/migrations/001_schema.sql`, `supabase/migrations/002_rls_policies.sql`, and `supabase/seed.sql` in your Supabase project SQL editor.
2. Deploy Edge Functions via `supabase functions deploy submit-exam`.
3. Configure environment variables (`SESSION_SECRET`, `ADMIN_BOOTSTRAP_PASSCODE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) in Netlify Site Settings (never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser).
4. Deploy via Netlify (`netlify.toml` is preconfigured).
