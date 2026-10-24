# Production Deployment & Setup Guide

This guide covers everything required to deploy the **AI Cold Outreach Automation Agent** to production on **Vercel** and **Supabase**, along with setting up the **Gemini API**, **Google Cloud OAuth 2.0**, and **Background Workers**.

---

## Architecture Overview

```
                                      ┌────────────────────────────────────┐
                                      │       Google Gemini API            │
                                      │   (Writing Engine & Sentiment)     │
                                      └────────────────▲───────────────────┘
                                                       │
┌─────────────────────────┐          ┌─────────────────┴───────────────────┐
│     Next.js Frontend    │ ◄──────► │     Next.js App Router (Vercel)     │
│  (Tailwind + React 19)  │          │   Server Endpoints & Worker API     │
└─────────────────────────┘          └──────▲────────────────────────▲─────┘
                                            │                        │
                      ┌─────────────────────▼──────┐          ┌──────▼─────────────────────┐
                      │    Supabase PostgreSQL     │          │    Gmail REST API          │
                      │  RLS + Atomic Job Queues   │          │  users.messages.send / get │
                      └────────────────────────────┘          └────────────────────────────┘
```

---

## 1. Local Development Quickstart

The application includes an **Offline / Mock Mode** out of the box so you can develop, test, and run the UI without needing immediate Google Cloud or Supabase credentials.

1. **Clone and install dependencies**:
   ```bash
   git clone <repo-url>
   cd cold-outreach-agent
   npm install
   ```

2. **Configure Local Environment**:
   ```bash
   cp .env.example .env.local
   ```
   Generate a 32-byte hexadecimal encryption key for testing:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Paste the generated string into `APP_ENCRYPTION_KEY` in `.env.local`.

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Visit [http://localhost:3000](http://localhost:3000) to view the dashboard.

4. **Run Unit and End-to-End Tests**:
   ```bash
   npm test
   ```

---

## 2. Supabase Setup & SQL Migrations

### A. Create Project
1. Log in to [Supabase](https://supabase.com) and click **New project**.
2. Select an organization, name your project (e.g., `cold-outreach-agent`), set a strong database password, and select your region.

### B. Apply Migrations
Navigate to **SQL Editor** in your Supabase dashboard and run the contents of:
`supabase/migrations/20261020000000_init_schema.sql`

This creates:
- `profiles`
- `email_accounts` (stores AES-256-GCM encrypted tokens)
- `leads` (with unique normalized email per user)
- `campaigns` & `campaign_leads`
- `email_messages`
- `job_queue` (atomic job locking function `claim_jobs()`)
- `suppressions` (global unsubscribe list)
- `reply_events` (categorized replies)
- `activity_logs`
- All indexes and Row Level Security (RLS) policies

### C. Retrieve Credentials
Go to **Project Settings** -> **API**:
- `Project URL`: Copy to `NEXT_PUBLIC_SUPABASE_URL`
- `anon public key`: Copy to `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role secret`: Copy to `SUPABASE_SERVICE_ROLE_KEY` *(Never expose this to the browser)*

---

## 3. AI Providers: Gemini & OpenAI Fallback Configuration
 
1. **Google Gemini (Primary)**:
   - Visit [Google AI Studio](https://aistudio.google.com/).
   - Click **Get API key** and create a new key.
   - Add to environment variables:
     ```env
     GEMINI_API_KEY=your_gemini_api_key
     GEMINI_MODEL=gemini-2.5-flash
     ```

2. **OpenAI (Automatic Fallback or Alternative)**:
   - If Gemini is unavailable, rate-limited (HTTP 429), quota-exhausted, or not configured, the system automatically falls back to OpenAI with zero downtime.
   - Visit [OpenAI Platform](https://platform.openai.com/api-keys) to generate an API key.
   - Add to environment variables:
     ```env
     OPENAI_API_KEY=sk-proj-your_openai_api_key
     OPENAI_MODEL=gpt-4o-mini
     ```
   - Candidate model fallbacks: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`.

3. **Quota Considerations**:
   - Google AI Studio free tier offers a generous RPM (requests per minute) limit.
   - Having `OPENAI_API_KEY` configured acts as a high-reliability safety net to keep outbound email drafting and inbound reply classification running uninterrupted.

---

## 4. Google Cloud OAuth & Gmail Integration

To enable the agent to send emails from your personal or business Gmail address:

### A. Create Project & Enable Gmail API
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `cold-outreach-agent`).
3. Navigate to **APIs & Services** -> **Library**.
4. Search for **Gmail API** and click **Enable**.

### B. Configure OAuth Consent Screen
1. Go to **APIs & Services** -> **OAuth consent screen**.
2. Select **External** (or **Internal** if using Google Workspace).
3. Set your Application Name (e.g., `Cold Outreach Agent`) and Support Email.
4. **Scopes**: Add the following minimum scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
5. **Test Users**:
   > [!IMPORTANT]
   > While the app status is in **Testing**, only Google accounts added as **Test Users** can complete OAuth authorization! Add your sender Gmail account under the **Test users** section.

### C. Create OAuth 2.0 Credentials
1. Go to **APIs & Services** -> **Credentials** -> **Create Credentials** -> **OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Cold Outreach Web Client`.
4. **Authorized redirect URIs**:
   - Local: `http://localhost:3000/api/integrations/google/callback`
   - Production: `https://your-domain.vercel.app/api/integrations/google/callback`
5. Copy your **Client ID** and **Client Secret** into your `.env`:
   ```env
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/api/integrations/google/callback
   ```

---

## 5. Background Jobs & Worker Setup

The background worker processes queued draft generations, scheduled email deliveries, follow-up sequencing, and reply synchronization.

### Secure Worker Endpoint
- Endpoint: `POST /api/jobs/process`
- Header: `Authorization: Bearer <CRON_SECRET>`

### Option 1: Supabase Cron (Recommended on Supabase Pro)
Use pg_cron and pg_net within Supabase:
```sql
SELECT cron.schedule(
  'process-cold-outreach-queue',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://your-domain.vercel.app/api/jobs/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer your-cron-secret'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Option 2: Vercel Cron (Free Tier)
Add `vercel.json` in your repository root:
```json
{
  "crons": [
    {
      "path": "/api/jobs/process",
      "schedule": "*/5 * * * *"
    }
  ]
}
```
*Note: Vercel Cron automatically sends `CRON_SECRET` in the `Authorization` header when configured in Project Settings.*

### Option 3: External Free Cron (e.g., cron-job.org)
Create a free scheduled job hitting `POST https://your-domain.vercel.app/api/jobs/process` with header `Authorization: Bearer <CRON_SECRET>` every 2 to 5 minutes.

---

## 6. Vercel Deployment

1. Push your repository to GitHub or GitLab.
2. In the [Vercel Dashboard](https://vercel.com), click **Add New** -> **Project** and select this repository.
3. Configure the following environment variables in Vercel:
   - `NEXT_PUBLIC_APP_URL`: `https://your-project.vercel.app`
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJ...`
   - `SUPABASE_SERVICE_ROLE_KEY`: `eyJ...`
   - `OWNER_EMAIL`: `owner@yourbusiness.com`
   - `GEMINI_API_KEY`: `AIza...`
   - `GEMINI_MODEL`: `gemini-2.5-flash`
   - `GOOGLE_CLIENT_ID`: `...apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `GOCSPX-...`
   - `GOOGLE_REDIRECT_URI`: `https://your-project.vercel.app/api/integrations/google/callback`
   - `APP_ENCRYPTION_KEY`: *(32-byte hex key)*
   - `CRON_SECRET`: *(Secure random string)*
   - `DEFAULT_TIMEZONE`: `Asia/Kolkata`
   - `DEFAULT_DAILY_SEND_LIMIT`: `15`
   - `DEFAULT_MAX_FOLLOWUPS`: `2`
   - `MOCK_MODE`: `false`
4. Click **Deploy**.

---

## 7. Operational Safety & Monitoring

- **Daily & Hourly Send Limits**: Default daily limit is set to 10-15 messages. Never exceed 50-100 cold emails per day from a single standard Gmail account to protect sender reputation.
- **Unsubscribe Compliance**: Every email automatically embeds the RFC 8058 `List-Unsubscribe` header and footer link. Unsubscribes are permanently stored in the `suppressions` table.
- **Audit Logs**: All campaign activations, sends, and lead imports are recorded in `activity_logs`.
