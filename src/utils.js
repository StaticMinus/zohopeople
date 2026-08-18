import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log message to console and specified log file
 */
export function log(message, logFileName = 'app.log') {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${message}`;
  console.log(formattedMsg);

  const logFilePath = path.join(LOG_DIR, logFileName);
  fs.appendFileSync(logFilePath, formattedMsg + '\n', 'utf8');
}

/**
 * Check if a date is a weekday (Monday to Friday)
 * @param {Date} date 
 * @returns {boolean}
 */
export function isWeekday(date = new Date()) {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 1 = Monday, ..., 5 = Friday
}

/**
 * Get all weekday dates (Mon-Fri) for a given month
 * @param {number} year 
 * @param {number} month (1-indexed: 1 = Jan, 12 = Dec)
 * @returns {Array<{date: Date, dateStr: string}>}
 */
export function getWeekdaysInMonth(year, month) {
  const weekdays = [];
  const totalDays = new Date(year, month, 0).getDate();

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month - 1, day);
    if (isWeekday(d)) {
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      weekdays.push({
        date: d,
        dateStr: `${yearStr}-${monthStr}-${dayStr}`,
        zohoFormat: `${dayStr}/${monthStr}/${yearStr}`
      });
    }
  }

  return weekdays;
}

/**
 * Format a Date object for Zoho Attendance API: "dd/MM/yyyy HH:mm:ss"
 * @param {Date} date 
 * @returns {string}
 */
export function formatZohoAttendanceDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Format Date object as YYYY-MM-DD
 */
export function formatDateYMD(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add random jitter (-jitterMinutes to +jitterMinutes) to current time or given base time "HH:mm"
 */
export function applyTimeJitter(baseTimeStr, jitterMinutes = 5) {
  const [targetHours, targetMins] = baseTimeStr.split(':').map(Number);
  const now = new Date();
  
  // Set to target base time
  now.setHours(targetHours, targetMins, 0, 0);

  if (jitterMinutes > 0) {
    // Generate random jitter between -jitterMinutes and +jitterMinutes
    const randomOffsetMs = (Math.random() * (jitterMinutes * 2) - jitterMinutes) * 60 * 1000;
    now.setTime(now.getTime() + randomOffsetMs);
  }

  return now;
}

/**
 * Parse CLI command line arguments into key-value options
 */
export function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    action: null, // 'checkin' | 'checkout'
    dryRun: false,
    force: false,
    month: null, // 'YYYY-MM'
    hours: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--action' && args[i + 1]) {
      options.action = args[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--month' && args[i + 1]) {
      options.month = args[++i];
    } else if (arg === '--hours' && args[i + 1]) {
      options.hours = parseFloat(args[++i]);
    }
  }

  return options;
}
