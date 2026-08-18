# Zoho People Automated Check-in & Timesheet System

An automated, lightweight system to perform **daily check-ins and check-outs (Monday to Friday)** and **process monthly timesheets** for Zoho People.

Supports **100% Free Cloud Automation** via GitHub Actions or free web hosts (Render/Koyeb), as well as local Windows Task Scheduler.

---

## Features

- ⏰ **Automated Daily Check-in & Check-out:** Runs automatically on weekdays (Mon-Fri) at your target times.
- 🎲 **Natural Time Jitter:** Adds a randomized offset (e.g. ±5 mins) to prevent exact-minute artificial timestamps.
- 📅 **Weekend Guard:** Automatically skips Saturdays and Sundays.
- 📊 **Monthly Timesheet Processing:** Automatically calculates all working days for the month and submits daily 8-hour entries to Zoho Time Tracker.
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

# Test Monthly Timesheet Generator (Dry-Run)
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
   - Run Monthly Timesheet on the 28th of every month at 18:00 UTC
   - Provide a manual **"Run workflow"** button in the Actions tab!

---

### Option B: Free Cloud Hosting (Render / Koyeb + cron-job.org)

If you prefer hosting an HTTP server endpoint:
1. Deploy this repository to [Render.com](https://render.com) or [Koyeb.com](https://koyeb.com) (Free Tier).
2. Set Environment Variables on your dashboard.
3. Start command: `npm start`
4. Set up free cron triggers on [cron-job.org](https://cron-job.org) calling:
   - Check-in: `POST https://your-app.onrender.com/api/checkin?key=YOUR_SECRET`
   - Check-out: `POST https://your-app.onrender.com/api/checkout?key=YOUR_SECRET`
   - Timesheet: `POST https://your-app.onrender.com/api/timesheet?key=YOUR_SECRET`

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
- `ZohoPeople_MonthlyTimesheet` (Monthly on 28th at 18:00)

---

## Log Files

All execution logs are recorded in the `logs/` directory:
- `logs/attendance.log` - History of all check-in and check-out executions
- `logs/timesheet.log` - History of monthly timesheet submissions
- `logs/error.log` - Diagnostic logs for failed requests
