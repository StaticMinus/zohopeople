# Zoho People Automated Check-in & Timesheet System

An automated, lightweight system to perform **daily check-ins and check-outs (Monday to Friday)** and **process weekly timesheets** for Zoho People.

Supports **100% Free Cloud Automation** via GitHub Actions or free web hosts (Render/Koyeb), as well as local Windows Task Scheduler.

---

## Features

- ⏰ **Automated Daily Check-in & Check-out:** Runs automatically on weekdays (Mon-Fri) at your target times.
- 🎲 **Natural Time Jitter:** Adds a randomized offset (e.g. ±5 mins) to prevent exact-minute artificial timestamps.
- 📅 **Weekend Guard:** Automatically skips Saturdays and Sundays.
- 📊 **Weekly Timesheet Processing:** Automatically calculates working days for the week (Monday to Friday, 40 hours) and submits daily entries to Zoho Time Tracker every Friday.
- ☁️ **Free Cloud Automation Ready:** Native GitHub Actions workflow included (0 cost, 0 maintenance).
- 🔒 **Secure:** Uses official Zoho OAuth 2.0 API tokens (Client ID, Client Secret, Refresh Token).

---

## Quick Setup Guide

### Step 1: Obtain Zoho OAuth 2.0 Credentials

1. Go to the [Zoho API Console](https://api-console.zoho.com/).
2. Click **Add Client** -> Select **Self Client** (or Server-based Application).
3. Under **Generate Code**, enter the following scopes:
   ```text
   ZohoPeople.attendance.ALL,ZohoPeople.timetracker.ALL
   ```
4. Copy the generated grant code.
5. Generate your **Refresh Token** via HTTP POST or curl:
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token?code=YOUR_GRANT_CODE&grant_type=authorization_code&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
   ```

### Step 2: Configure Environment Variables

Create `.env` in the project root (or copy `.env.example`):

```ini
ZOHO_CLIENT_ID=1000.XXXXXXXXXXXXXXXXXXXXXXXXXXXX
ZOHO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_REFRESH_TOKEN=1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_PEOPLE_URL=https://people.zoho.com

ZOHO_EMP_ID=1001
ZOHO_EMP_EMAIL=user@company.com

DEFAULT_CHECKIN_TIME=09:00
DEFAULT_CHECKOUT_TIME=17:00
JITTER_MINUTES=5

TIMESHEET_WORK_HOURS=8.0
TIMESHEET_JOB_NAME=General Work
```

---

## How to Test (Dry-Run Mode)

Test the scripts safely without making any actual API calls:

```bash
# Test Morning Check-In (Dry-Run)
npm run checkin:dry

# Test Evening Check-Out (Dry-Run)
npm run checkout:dry

# Test Weekly Timesheet Generator (Dry-Run)
npm run timesheet:dry
```

To run real API actions manually:
```bash
npm run checkin
npm run checkout
npm run timesheet
```

---

## Automation Setup Options

### Option A: Free GitHub Actions (Recommended)

GitHub Actions is **100% Free** (includes 2,000 free build minutes/month for private repositories; this system uses ~15 mins/month).

1. Push this repository to a **Private GitHub Repository**.
2. Go to **Settings** -> **Secrets and variables** -> **Actions**.
3. Add the following Repository Secrets:
   - `ZOHO_CLIENT_ID`
   - `ZOHO_CLIENT_SECRET`
   - `ZOHO_REFRESH_TOKEN`
   - `ZOHO_EMP_ID`
   - `ZOHO_EMP_EMAIL`
4. The included `.github/workflows/zoho-automation.yml` will automatically:
   - Run Check-In at 08:55 UTC Mon-Fri
   - Run Check-Out at 17:00 UTC Mon-Fri
   - Run Weekly Timesheet every Friday at 18:00 UTC
   - Provide a manual **"Run workflow"** button in the Actions tab!

---

### Option B: Cloud Hosting on Render (24/7 Webhook & Dashboard)

With `render.yaml` included in this repo, deploying to Render is seamless:

1. **Push your repository to GitHub** (e.g. `https://github.com/StaticMinus/zohopeople`).
2. **Log into [Render Dashboard](https://dashboard.render.com/)**:
   - Click **New+** -> **Blueprint** (or **Web Service**).
   - Connect your `zohopeople` GitHub repository.
   - Render will detect `render.yaml` and configure the Web Service automatically.
3. **Configure Environment Variables** on Render:
   - `ZOHO_CLIENT_ID`
   - `ZOHO_CLIENT_SECRET`
   - `ZOHO_REFRESH_TOKEN`
   - `ZOHO_EMP_ID`
   - `ZOHO_EMP_EMAIL`
   - `TIMESHEET_JOB_NAME` (e.g. `Project - RAN`)
   - `TIMEZONE` / `TZ`: `Africa/Lagos`
   - `CRON_SECRET`: Render will auto-generate one, or you can supply your own token.
4. **Reliable Scheduled Triggers (Free Tier Workaround)**:
   Render Free tier web services spin down after 15 minutes of inactivity. To ensure your jobs run reliably right on time, set up 3 free cron jobs on **[cron-job.org](https://cron-job.org/)**:
   - **Morning Check-In**: `GET https://your-service.onrender.com/api/cron/checkin?secret=YOUR_CRON_SECRET`
     - Schedule: Mon–Fri at 08:55 (Timezone: `Africa/Lagos`)
   - **Evening Check-Out**: `GET https://your-service.onrender.com/api/cron/checkout?secret=YOUR_CRON_SECRET`
     - Schedule: Mon–Fri at 17:00 (Timezone: `Africa/Lagos`)
   - **Weekly Timesheet**: `GET https://your-service.onrender.com/api/cron/timesheet?secret=YOUR_CRON_SECRET`
     - Schedule: Every Friday at 18:00 (Timezone: `Africa/Lagos`)
   *(Note: Calling these endpoints automatically wakes up Render and executes the job).*

---

### Option C: Local Windows Task Scheduler

To run automation locally on your Windows PC:

Open PowerShell as Administrator in the project directory and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-scheduler.ps1
```

This creates three scheduled tasks:
- `ZohoPeople_CheckIn` (Mon-Fri at 08:55)
- `ZohoPeople_CheckOut` (Mon-Fri at 17:00)
- `ZohoPeople_WeeklyTimesheet` (Weekly on Friday at 18:00)

---

## Log Files

All execution logs are recorded in the `logs/` directory:
- `logs/attendance.log` - History of all check-in and check-out executions
- `logs/timesheet.log` - History of weekly timesheet submissions
- `logs/error.log` - Diagnostic logs for failed requests

