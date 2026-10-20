# AI Cold Outreach Automation Agent

> A production-minded, single-owner AI cold email automation system powered by **Next.js App Router**, **Google Gemini**, **Gmail API**, and **Supabase PostgreSQL**.

---

## Key Features

- **Lead Import Wizard**: Drag-and-drop CSV and Excel (.xlsx) files with auto-detected column mapping, email syntax validation, duplicate detection, and suppression list checks.
- **Gemini AI Writing Engine**: Generates concise, natural B2B outbound emails using verified facts only. Prevents fake familiarity, false claims, and hallucinations.
- **Multi-Step Follow-Up Sequences**: Automatically schedules gentle follow-ups (e.g. Day 4 and Day 9) with configurable timing and personalized perspectives.
- **Gmail OAuth 2.0 Integration**: Connects your personal or business Gmail workspace. Tokens are encrypted at rest with authenticated **AES-256-GCM**.
- **Inbound Reply Detection & Sentiment**: Polls Gmail threads and uses Gemini to classify responses (*Positive Interest, Objection, Out of Office, Unsubscribe*).
- **Instant Follow-Up Cancellation**: Automatically cancels scheduled follow-ups the moment a prospect replies or requests an opt-out.
- **One-Click Unsubscribe (RFC 8058)**: Cryptographically signed unsubscribe URLs and email headers that immediately record to the global suppression list without exposing database IDs.
- **Persistent Background Worker**: Database-backed job queue with atomic PostgreSQL locking (`FOR UPDATE SKIP LOCKED`) and lease expiration. Runs without needing an active browser session.
- **Modern SaaS Dashboard**: 8 live performance metrics, active sequence management, interactive email editor with unresolved placeholder warnings, and global pause-all controls.
- **Zero-Friction Mock Mode**: Full offline / local development support without requiring real API keys or external credentials to get started.

---

## Tech Stack

| Component | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript (Strict) |
| **Styling** | Tailwind CSS v4, Lucide Icons, Modern Dark SaaS Theme |
| **AI Writing** | Official `@google/genai` SDK (`gemini-2.5-flash`) |
| **Database** | Supabase PostgreSQL, Row Level Security (RLS), Atomic Job Queue |
| **Email Protocol** | Gmail REST API (`users.messages.send`, MIME RFC 2822) |
| **File Parsing** | Papa Parse (CSV), SheetJS (XLSX) |
| **Validation** | Zod (strict schema validation for all inputs and AI outputs) |
| **Encryption** | AES-256-GCM for tokens, HMAC-SHA256 for unsubscribe tokens |
| **Testing** | Vitest (32 unit & integration tests), Playwright (E2E) |

---

## Getting Started

### 1. Installation
```bash
git clone <repo-url>
cd cold-outreach-agent
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env.local
```
Configure your `.env.local` or run in **Mock Mode** by default (`MOCK_MODE=true`).

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Run Test Suite
```bash
npm test
```
All 32 unit, integration, and end-to-end workflow tests run in ~1.2s.

---

## Project Structure

```
cold-outreach-agent/
├── e2e/                           # Playwright end-to-end tests
├── src/
│   ├── app/
│   │   ├── api/                   # Authenticated & validated API routes
│   │   │   ├── campaigns/         # Campaign CRUD, enroll, generate, activate, pause, resume, cancel
│   │   │   ├── leads/             # Lead listing, patch, and CSV/XLSX import wizard
│   │   │   ├── messages/          # Sent & scheduled messages, editor patch, regenerate
│   │   │   ├── replies/           # Inbound reply events & sentiment
│   │   │   ├── integrations/      # Google OAuth connect, callback, status, disconnect
│   │   │   ├── jobs/process/      # Background worker processor endpoint (CRON_SECRET)
│   │   │   ├── unsubscribe/       # Public one-click unsubscribe endpoint
│   │   │   └── health/            # System health and database connectivity
│   │   ├── campaigns/             # Campaigns dashboard, wizard, details, interactive editor
│   │   ├── leads/                 # Leads list & interactive import wizard
│   │   ├── messages/              # Outbound message tracking
│   │   ├── replies/               # Classified replies inbox
│   │   ├── settings/              # Profile, daily limits, and Gmail OAuth card
│   │   ├── unsubscribe/           # Public unsubscribe confirmation page
│   │   ├── login/                 # Owner login & mock dev access
│   │   └── page.tsx               # Primary SaaS analytics dashboard
│   ├── components/                # Reusable UI components (Sidebar, Header, Cards)
│   ├── lib/
│   │   ├── auth.ts                # Owner-only authentication & route guard
│   │   ├── crypto.ts              # Authenticated AES-256-GCM token encryption
│   │   ├── csv-excel.ts           # CSV/XLSX parser, validator, formula injection sanitizer
│   │   ├── db-service.ts          # Unified database access (Supabase + reactive mock store)
│   │   ├── env.ts                 # Zod validated environment configuration
│   │   ├── gemini.ts              # Gemini AI writing engine with structured outputs
│   │   ├── unsubscribe-token.ts   # HMAC-SHA256 URL-safe token signing
│   │   ├── gmail/                 # Google OAuth flow, RFC 2822 MIME builder, Gmail API sender
│   │   ├── queue/                 # Background worker processor with atomic leases
│   │   └── supabase/              # Browser, server, and service-role clients + mock database
│   └── types/
│       └── database.ts            # TypeScript schemas for all tables and queue types
├── supabase/
│   └── migrations/
│       └── 20261020000000_init_schema.sql  # Full SQL schema, RLS policies, and claim_jobs()
├── sample_leads.csv               # Ready-to-import sample prospects file
├── DEPLOYMENT.md                  # Comprehensive Vercel, Supabase, Google Cloud deploy guide
├── vitest.config.mts              # Vitest test configuration
└── playwright.config.ts           # Playwright E2E configuration
```

---

## Full Deployment Guide

For complete step-by-step instructions on setting up Supabase, Google Cloud Console OAuth consent screen, Gmail API, Vercel environment variables, and background cron jobs, see [DEPLOYMENT.md](file:///d:/Code/cold-outreach-agent/DEPLOYMENT.md).
