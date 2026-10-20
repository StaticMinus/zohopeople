import express from 'express';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { 
  recordCheckIn, 
  recordCheckOut, 
  ensureTimeLog, 
  submitTimesheetForApproval,
  getTimesheets,
  getTimeLogs 
} from './zohoApi.js';
import { 
  log, 
  isWeekday, 
  isTimesheetSubmissionDay,
  applyTimeJitter, 
  getWeekDateRange, 
  getWeekdaysInWeek,
  getIntermediateWeeks,
  formatDateYMD 
} from './utils.js';
import { processWeeklyTimesheet } from './timesheet.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const logsDir = path.join(rootDir, 'logs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));

// Lightweight Health Check (Keep-Alive / Ping target)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timezone: config.timezone,
    serverTimeUtc: new Date().toISOString(),
    localTime: new Date().toLocaleString('en-GB', { timeZone: config.timezone })
  });
});

// Middleware to authenticate cron webhook endpoints
function cronAuth(req, res, next) {
  if (!config.cronSecret) {
    return next();
  }
  const token = req.headers['x-cron-secret'] || 
                (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null) || 
                req.query.secret;

  if (token !== config.cronSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing cron secret' });
  }
  next();
}

// External Cron Webhook: Morning Check-In
app.all('/api/cron/checkin', cronAuth, async (req, res) => {
  const now = new Date();
  const force = req.query.force === 'true' || req.body?.force;
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun;

  if (!isWeekday(now) && !force) {
    return res.json({ status: 'skipped', message: 'Weekend detected. Skipping check-in.' });
  }

  const targetTime = applyTimeJitter(config.defaultCheckInTime, config.jitterMinutes, 'earlier');
  if (dryRun) {
    return res.json({ success: true, dryRun: true, message: `Simulated Check-In for ${targetTime.toLocaleString()}` });
  }

  try {
    const result = await recordCheckIn(targetTime);
    log(`[WEBHOOK] Check-in triggered and recorded successfully for ${targetTime.toLocaleString()}`, 'attendance.log');
    res.json({ success: true, result });
  } catch (err) {
    log(`[WEBHOOK ERROR] Check-in failed: ${err.message}`, 'error.log');
    res.status(500).json({ error: err.message });
  }
});

// External Cron Webhook: Evening Check-Out
app.all('/api/cron/checkout', cronAuth, async (req, res) => {
  const now = new Date();
  const force = req.query.force === 'true' || req.body?.force;
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun;

  if (!isWeekday(now) && !force) {
    return res.json({ status: 'skipped', message: 'Weekend detected. Skipping check-out.' });
  }

  const targetTime = applyTimeJitter(config.defaultCheckOutTime, config.jitterMinutes, 'earlier');
  if (dryRun) {
    return res.json({ success: true, dryRun: true, message: `Simulated Check-Out for ${targetTime.toLocaleString()}` });
  }

  try {
    const result = await recordCheckOut(targetTime);
    log(`[WEBHOOK] Check-out triggered and recorded successfully for ${targetTime.toLocaleString()}`, 'attendance.log');
    res.json({ success: true, result });
  } catch (err) {
    log(`[WEBHOOK ERROR] Check-out failed: ${err.message}`, 'error.log');
    res.status(500).json({ error: err.message });
  }
});

// External Cron Webhook: Friday Weekly Timesheet
app.all('/api/cron/timesheet', cronAuth, async (req, res) => {
  const now = new Date();
  const force = req.query.force === 'true' || req.body?.force;
  const dryRun = req.query.dryRun === 'true' || req.body?.dryRun;

  if (!isTimesheetSubmissionDay(now) && !force) {
    return res.json({ 
      status: 'skipped', 
      message: `Today is ${now.toLocaleDateString('en-US', { weekday: 'long' })}. Timesheets are strictly submitted on Fridays after all workdays have completed.` 
    });
  }

  const currentWeek = getWeekDateRange(now);
  const weekInfo = {
    ...currentWeek,
    weekdays: getWeekdaysInWeek(now)
  };

  try {
    const result = await processWeeklyTimesheet(weekInfo, {
      hours: config.timesheetWorkHours || 8.0,
      dryRun: !!dryRun,
      force: !!force
    });
    log(`[WEBHOOK] Weekly timesheet processed successfully.`, 'timesheet.log');
    res.json({ success: true, result });
  } catch (err) {
    log(`[WEBHOOK ERROR] Weekly timesheet failed: ${err.message}`, 'error.log');
    res.status(500).json({ error: err.message });
  }
});

// External Cron Webhook: Timesheet Catch-up & Backfill
app.all('/api/cron/timesheet-catchup', cronAuth, async (req, res) => {
  const now = new Date();
  const force = req.query.force === 'true' || req.body?.force;
  const lookbackDate = new Date(now);
  lookbackDate.setDate(lookbackDate.getDate() - 60);

  const dailyHours = config.timesheetWorkHours || 8.0;
  const currentWeek = getWeekDateRange(now);
  const isFriday = isTimesheetSubmissionDay(now);

  try {
    const recentSheets = await getTimesheets(formatDateYMD(lookbackDate), formatDateYMD(now));
    let latestCoveredDate = null;
    for (const sheet of recentSheets) {
      const sheetToDate = sheet.toDate;
      const status = (sheet.status || sheet.approvalStatus || '').toLowerCase();
      if (sheetToDate && status !== 'rejected') {
        if (!latestCoveredDate || sheetToDate > latestCoveredDate) {
          latestCoveredDate = sheetToDate;
        }
      }
    }

    let weeksToProcess = [];
    if (latestCoveredDate) {
      const lastCoveredWeek = getWeekDateRange(latestCoveredDate);
      const firstMissingMonday = new Date(lastCoveredWeek.fromDate);
      firstMissingMonday.setDate(firstMissingMonday.getDate() + 7);
      
      // Only process past completed weeks before Friday
      if (firstMissingMonday < currentWeek.fromDate) {
        const lastCompletedFriday = new Date(currentWeek.fromDate);
        lastCompletedFriday.setDate(lastCompletedFriday.getDate() - 3);
        weeksToProcess = getIntermediateWeeks(firstMissingMonday, lastCompletedFriday);
      } else if (isFriday || force) {
        weeksToProcess = [{ ...currentWeek, weekdays: getWeekdaysInWeek(now) }];
      } else {
        return res.json({ 
          status: 'skipped', 
          message: 'No past backlog weeks found. Current week is in progress and can only be submitted on Friday.' 
        });
      }
    } else if (isFriday || force) {
      weeksToProcess = [{ ...currentWeek, weekdays: getWeekdaysInWeek(now) }];
    } else {
      return res.json({ 
        status: 'skipped', 
        message: 'No past backlog weeks found. Current week is in progress and can only be submitted on Friday.' 
      });
    }

    const results = [];
    for (const week of weeksToProcess) {
      const resWeek = await processWeeklyTimesheet(week, {
        hours: dailyHours,
        dryRun: req.query.dryRun === 'true',
        force: force
      });
      results.push(resWeek);
    }

    res.json({
      success: true,
      processedWeeksCount: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Get Status & Configurations
app.get('/api/status', (req, res) => {
  const now = new Date();
  res.json({
    status: 'online',
    employee: {
      id: config.empId || 'Not Set',
      email: config.empEmail || 'Not Set'
    },
    schedule: {
      checkInTime: config.defaultCheckInTime,
      checkOutTime: config.defaultCheckOutTime,
      jitterMinutes: config.jitterMinutes,
      workHours: config.timesheetWorkHours,
      jobName: config.timesheetJobName
    },
    isWeekday: isWeekday(now),
    currentTime: now.toLocaleTimeString(),
    currentDate: now.toLocaleDateString()
  });
});

// 1b. Get Timesheets Status & History
app.get('/api/timesheet/status', async (req, res) => {
  try {
    const now = new Date();
    const lookbackDate = new Date(now);
    lookbackDate.setDate(lookbackDate.getDate() - 60);

    const fromDateStr = formatDateYMD(lookbackDate);
    const toDateStr = formatDateYMD(now);

    const timesheets = await getTimesheets(fromDateStr, toDateStr);
    const currentWeek = getWeekDateRange(now);

    let latestCoveredDate = null;
    for (const sheet of timesheets) {
      const sheetToDate = sheet.toDate;
      const status = (sheet.status || sheet.approvalStatus || '').toLowerCase();
      if (sheetToDate && status !== 'rejected') {
        if (!latestCoveredDate || sheetToDate > latestCoveredDate) {
          latestCoveredDate = sheetToDate;
        }
      }
    }

    let detectedGaps = [];
    if (latestCoveredDate) {
      const lastCoveredWeek = getWeekDateRange(latestCoveredDate);
      const firstMissingMonday = new Date(lastCoveredWeek.fromDate);
      firstMissingMonday.setDate(firstMissingMonday.getDate() + 7);
      if (firstMissingMonday <= currentWeek.fromDate) {
        detectedGaps = getIntermediateWeeks(firstMissingMonday, currentWeek.toDate);
      }
    }

    res.json({
      success: true,
      currentWeek,
      latestCoveredDate,
      hasGap: detectedGaps.length > 1,
      missingWeeks: detectedGaps,
      timesheets: timesheets.map(t => ({
        id: t.recordId || t.id || t.timesheetId,
        name: t.timesheetName,
        fromDate: t.fromDate,
        toDate: t.toDate,
        totalHours: t.totalHours || t.hours,
        status: t.status || t.approvalStatus || 'Pending'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Perform Check-In
app.post('/api/checkin', async (req, res) => {
  const { dryRun, force } = req.body;
  const now = new Date();

  if (!isWeekday(now) && !force) {
    return res.status(400).json({ error: 'Weekend detected. Use force option to override.' });
  }

  const targetTime = applyTimeJitter(config.defaultCheckInTime, config.jitterMinutes, 'earlier');

  if (dryRun) {
    return res.json({ success: true, dryRun: true, message: `Simulated Check-In for ${targetTime.toLocaleString()}` });
  }

  try {
    const result = await recordCheckIn(targetTime);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Perform Check-Out
app.post('/api/checkout', async (req, res) => {
  const { dryRun, force } = req.body;
  const now = new Date();

  if (!isWeekday(now) && !force) {
    return res.status(400).json({ error: 'Weekend detected. Use force option to override.' });
  }

  const targetTime = applyTimeJitter(config.defaultCheckOutTime, config.jitterMinutes, 'earlier');

  if (dryRun) {
    return res.json({ success: true, dryRun: true, message: `Simulated Check-Out for ${targetTime.toLocaleString()}` });
  }

  try {
    const result = await recordCheckOut(targetTime);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Process Weekly Timesheet (Idempotent & Validated)
app.post('/api/timesheet', async (req, res) => {
  const { date, week, hours, dryRun, force } = req.body;
  const now = new Date();
  const targetDate = (date || week) ? new Date(date || week) : now;
  const targetHours = hours || config.timesheetWorkHours || 8.0;

  const currentWeek = getWeekDateRange(targetDate);
  const weekInfo = {
    ...currentWeek,
    weekdays: getWeekdaysInWeek(targetDate)
  };

  try {
    const result = await processWeeklyTimesheet(weekInfo, {
      hours: targetHours,
      dryRun: !!dryRun,
      force: !!force
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. Catch-up & Backfill Missing Weeks
app.post('/api/timesheet/catchup', async (req, res) => {
  const { dryRun, force, hours } = req.body;
  const now = new Date();
  const lookbackDate = new Date(now);
  lookbackDate.setDate(lookbackDate.getDate() - 60);

  const dailyHours = hours || config.timesheetWorkHours || 8.0;
  const currentWeek = getWeekDateRange(now);

  try {
    const recentSheets = await getTimesheets(formatDateYMD(lookbackDate), formatDateYMD(now));
    let latestCoveredDate = null;
    for (const sheet of recentSheets) {
      const sheetToDate = sheet.toDate;
      const status = (sheet.status || sheet.approvalStatus || '').toLowerCase();
      if (sheetToDate && status !== 'rejected') {
        if (!latestCoveredDate || sheetToDate > latestCoveredDate) {
          latestCoveredDate = sheetToDate;
        }
      }
    }

    let weeksToProcess = [];
    if (latestCoveredDate) {
      const lastCoveredWeek = getWeekDateRange(latestCoveredDate);
      const firstMissingMonday = new Date(lastCoveredWeek.fromDate);
      firstMissingMonday.setDate(firstMissingMonday.getDate() + 7);
      if (firstMissingMonday <= currentWeek.fromDate) {
        weeksToProcess = getIntermediateWeeks(firstMissingMonday, currentWeek.toDate);
      } else {
        weeksToProcess = [{ ...currentWeek, weekdays: getWeekdaysInWeek(now) }];
      }
    } else {
      weeksToProcess = [{ ...currentWeek, weekdays: getWeekdaysInWeek(now) }];
    }

    const results = [];
    for (const week of weeksToProcess) {
      const resWeek = await processWeeklyTimesheet(week, {
        hours: dailyHours,
        dryRun: !!dryRun,
        force: !!force
      });
      results.push(resWeek);
    }

    res.json({
      success: true,
      processedWeeksCount: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Log Files
app.get('/api/logs', (req, res) => {
  const type = req.query.type || 'attendance';
  const fileName = type === 'timesheet' ? 'timesheet.log' : type === 'error' ? 'error.log' : 'attendance.log';
  const filePath = path.join(logsDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.json({ logs: ['No log entries recorded yet.'] });
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean).slice(-100).reverse(); // Return last 100 lines
  res.json({ logs: lines });
});

// 6. Update Configuration Settings (.env)
app.post('/api/settings', (req, res) => {
  const { checkInTime, checkOutTime, jitterMinutes, workHours, jobName } = req.body;

  try {
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    if (checkInTime) {
      envContent = envContent.replace(/DEFAULT_CHECKIN_TIME=.*/, `DEFAULT_CHECKIN_TIME=${checkInTime}`);
      config.defaultCheckInTime = checkInTime;
    }
    if (checkOutTime) {
      envContent = envContent.replace(/DEFAULT_CHECKOUT_TIME=.*/, `DEFAULT_CHECKOUT_TIME=${checkOutTime}`);
      config.defaultCheckOutTime = checkOutTime;
    }
    if (jitterMinutes !== undefined) {
      envContent = envContent.replace(/JITTER_MINUTES=.*/, `JITTER_MINUTES=${jitterMinutes}`);
      config.jitterMinutes = parseInt(jitterMinutes, 10);
    }
    if (workHours) {
      envContent = envContent.replace(/TIMESHEET_WORK_HOURS=.*/, `TIMESHEET_WORK_HOURS=${workHours}`);
      config.timesheetWorkHours = parseFloat(workHours);
    }
    if (jobName) {
      envContent = envContent.replace(/TIMESHEET_JOB_NAME=.*/, `TIMESHEET_JOB_NAME=${jobName}`);
      config.timesheetJobName = jobName;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    res.json({ success: true, message: 'Settings saved successfully!', config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  log(`Zoho People Dashboard running on port ${PORT}`);

  // Setup internal node-cron scheduler (runs when server process is active)
  if (process.env.DISABLE_INTERNAL_CRON !== 'true') {
    try {
      const [inHour, inMinute] = (config.defaultCheckInTime || '09:00').split(':').map(Number);
      let schedInMin = inMinute - (config.jitterMinutes || 5);
      let schedInHour = inHour;
      if (schedInMin < 0) {
        schedInMin += 60;
        schedInHour -= 1;
      }
      const checkInCron = `${schedInMin} ${schedInHour} * * 1-5`;

      const [outHour, outMinute] = (config.defaultCheckOutTime || '17:00').split(':').map(Number);
      const checkOutCron = `${outMinute} ${outHour} * * 1-5`;

      // 1. Check-In Cron
      cron.schedule(checkInCron, async () => {
        const now = new Date();
        if (!isWeekday(now)) return;
        log(`[INTERNAL CRON] Running scheduled morning check-in (${config.timezone})...`, 'attendance.log');
        try {
          const targetTime = applyTimeJitter(config.defaultCheckInTime, config.jitterMinutes, 'earlier');
          await recordCheckIn(targetTime);
          log(`[INTERNAL CRON] Scheduled check-in recorded successfully at ${targetTime.toLocaleTimeString()}!`, 'attendance.log');
        } catch (err) {
          log(`[INTERNAL CRON ERROR] Check-in failed: ${err.message}`, 'error.log');
        }
      }, { timezone: config.timezone });

      // 2. Check-Out Cron
      cron.schedule(checkOutCron, async () => {
        const now = new Date();
        if (!isWeekday(now)) return;
        log(`[INTERNAL CRON] Running scheduled evening check-out (${config.timezone})...`, 'attendance.log');
        try {
          const targetTime = applyTimeJitter(config.defaultCheckOutTime, config.jitterMinutes, 'earlier');
          await recordCheckOut(targetTime);
          log(`[INTERNAL CRON] Scheduled check-out recorded successfully at ${targetTime.toLocaleTimeString()}!`, 'attendance.log');
        } catch (err) {
          log(`[INTERNAL CRON ERROR] Check-out failed: ${err.message}`, 'error.log');
        }
      }, { timezone: config.timezone });

      // 3. Weekly Timesheet Cron (Every Friday at 18:00)
      cron.schedule('0 18 * * 5', async () => {
        log(`[INTERNAL CRON] Running scheduled Friday weekly timesheet submission (${config.timezone})...`, 'timesheet.log');
        try {
          const now = new Date();
          const currentWeek = getWeekDateRange(now);
          const weekInfo = {
            ...currentWeek,
            weekdays: getWeekdaysInWeek(now)
          };
          await processWeeklyTimesheet(weekInfo, {
            hours: config.timesheetWorkHours || 8.0,
            dryRun: false,
            force: false
          });
          log(`[INTERNAL CRON] Scheduled weekly timesheet completed successfully!`, 'timesheet.log');
        } catch (err) {
          log(`[INTERNAL CRON ERROR] Weekly timesheet failed: ${err.message}`, 'error.log');
        }
      }, { timezone: config.timezone });

      log(`Internal scheduler active (Timezone: ${config.timezone}): Check-in [${checkInCron}], Check-out [${checkOutCron}], Timesheet [0 18 * * 5]`);
    } catch (cronErr) {
      log(`Failed to initialize internal cron scheduler: ${cronErr.message}`, 'error.log');
    }
  }
});
