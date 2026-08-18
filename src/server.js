import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { recordCheckIn, recordCheckOut, addTimeLog } from './zohoApi.js';
import { log, isWeekday, applyTimeJitter, getWeekdaysInMonth } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const logsDir = path.join(rootDir, 'logs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));

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

// 2. Perform Check-In
app.post('/api/checkin', async (req, res) => {
  const { dryRun, force } = req.body;
  const now = new Date();

  if (!isWeekday(now) && !force) {
    return res.status(400).json({ error: 'Weekend detected. Use force option to override.' });
  }

  const targetTime = applyTimeJitter(config.defaultCheckInTime, config.jitterMinutes);

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

  const targetTime = applyTimeJitter(config.defaultCheckOutTime, config.jitterMinutes);

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

// 4. Process Monthly Timesheet
app.post('/api/timesheet', async (req, res) => {
  const { year, month, hours, dryRun } = req.body;
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || (now.getMonth() + 1);
  const targetHours = hours || config.timesheetWorkHours;

  const weekdays = getWeekdaysInMonth(targetYear, targetMonth);

  if (dryRun) {
    return res.json({
      success: true,
      dryRun: true,
      weekdaysCount: weekdays.length,
      totalHours: weekdays.length * targetHours,
      entries: weekdays.map(w => ({ date: w.dateStr, hours: targetHours }))
    });
  }

  let successCount = 0;
  let failures = [];

  for (const { dateStr } of weekdays) {
    try {
      await addTimeLog(dateStr, targetHours, config.timesheetJobName);
      successCount++;
    } catch (err) {
      failures.push({ date: dateStr, error: err.message });
    }
  }

  res.json({
    success: true,
    processedDays: successCount,
    totalDays: weekdays.length,
    totalHours: successCount * targetHours,
    failures
  });
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
  log(`Zoho People Dashboard running on http://localhost:${PORT}`);
});
