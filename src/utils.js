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
 * Check if today is the designated weekly timesheet submission day (Friday)
 * @param {Date} date 
 * @returns {boolean}
 */
export function isTimesheetSubmissionDay(date = new Date()) {
  return date.getDay() === 5; // Friday
}

/**
 * Get date range for the week containing the given date (Monday to Friday)
 * @param {Date|string} inputDate 
 * @returns {{ fromDateStr: string, toDateStr: string, fromDate: Date, toDate: Date, formattedRange: string }}
 */
export function getWeekDateRange(inputDate = new Date()) {
  const d = typeof inputDate === 'string' ? new Date(inputDate) : new Date(inputDate);
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // Distance to Monday (if Sun=0, go back 6 days; otherwise 1 - day)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  const formatShort = (date) => {
    const dayNum = date.getDate();
    const monthShort = date.toLocaleString('default', { month: 'short' });
    const yr = date.getFullYear();
    return `${dayNum} ${monthShort} ${yr}`;
  };

  return {
    fromDateStr: formatDateYMD(monday),
    toDateStr: formatDateYMD(friday),
    fromDate: monday,
    toDate: friday,
    formattedRange: `${formatShort(monday)} to ${formatShort(friday)}`
  };
}

/**
 * Get all weekday dates (Mon-Fri) for the week containing the given date
 * @param {Date|string} inputDate 
 * @returns {Array<{date: Date, dateStr: string, zohoFormat: string, dayName: string}>}
 */
export function getWeekdaysInWeek(inputDate = new Date()) {
  const { fromDate } = getWeekDateRange(inputDate);
  const weekdays = [];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  for (let i = 0; i < 5; i++) {
    const curr = new Date(fromDate);
    curr.setDate(fromDate.getDate() + i);

    const yearStr = curr.getFullYear();
    const monthStr = String(curr.getMonth() + 1).padStart(2, '0');
    const dayStr = String(curr.getDate()).padStart(2, '0');

    weekdays.push({
      date: new Date(curr),
      dateStr: `${yearStr}-${monthStr}-${dayStr}`,
      zohoFormat: `${dayStr}/${monthStr}/${yearStr}`,
      dayName: dayNames[i]
    });
  }

  return weekdays;
}

/**
 * Get date range for a pay cycle ending in a given month.
 * (Retained for backwards compatibility)
 * @param {number} year 
 * @param {number} month (1-indexed, target month)
 * @returns {{ fromDateStr: string, toDateStr: string, fromDate: Date, toDate: Date }}
 */
export function getPayCycleDateRange(year, month) {
  const prevMonthDate = new Date(year, month - 2, 25);
  const targetMonthDate = new Date(year, month - 1, 23);

  return {
    fromDateStr: formatDateYMD(prevMonthDate),
    toDateStr: formatDateYMD(targetMonthDate),
    fromDate: prevMonthDate,
    toDate: targetMonthDate
  };
}

/**
 * Get all weekday dates (Mon-Fri) within a pay cycle
 * (Retained for backwards compatibility)
 * @param {number} year 
 * @param {number} month (1-indexed)
 * @returns {Array<{date: Date, dateStr: string, zohoFormat: string}>}
 */
export function getWeekdaysInPayCycle(year, month) {
  const { fromDate, toDate } = getPayCycleDateRange(year, month);
  const weekdays = [];

  const curr = new Date(fromDate);
  while (curr <= toDate) {
    if (isWeekday(curr)) {
      const yearStr = curr.getFullYear();
      const monthStr = String(curr.getMonth() + 1).padStart(2, '0');
      const dayStr = String(curr.getDate()).padStart(2, '0');
      weekdays.push({
        date: new Date(curr),
        dateStr: `${yearStr}-${monthStr}-${dayStr}`,
        zohoFormat: `${dayStr}/${monthStr}/${yearStr}`
      });
    }
    curr.setDate(curr.getDate() + 1);
  }

  return weekdays;
}

/**
 * Get all weekday dates (Mon-Fri) for a given month's pay cycle
 * (Retained for backwards compatibility)
 * @param {number} year 
 * @param {number} month (1-indexed)
 * @returns {Array<{date: Date, dateStr: string, zohoFormat: string}>}
 */
export function getWeekdaysInMonth(year, month) {
  return getWeekdaysInPayCycle(year, month);
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
 * Add random jitter to base time "HH:mm".
 * @param {string} baseTimeStr - Base time string "HH:mm"
 * @param {number} jitterMinutes - Maximum jitter offset in minutes
 * @param {string} direction - 'earlier' (negative offset: -jitter to 0), 'later' (positive offset: 0 to +jitter), or 'both' (default)
 * @returns {Date}
 */
export function applyTimeJitter(baseTimeStr, jitterMinutes = 5, direction = 'both') {
  const [targetHours, targetMins] = baseTimeStr.split(':').map(Number);
  const now = new Date();
  
  now.setHours(targetHours, targetMins, 0, 0);

  if (jitterMinutes > 0) {
    let randomOffsetMs = 0;
    if (direction === 'earlier' || direction === 'negative') {
      // Negative jitter: strictly between -jitterMinutes and 0 (ensures clock-in is not late & clock-out is early)
      randomOffsetMs = -Math.random() * jitterMinutes * 60 * 1000;
    } else if (direction === 'later' || direction === 'positive') {
      // Positive jitter: strictly between 0 and +jitterMinutes
      randomOffsetMs = Math.random() * jitterMinutes * 60 * 1000;
    } else {
      // Symmetric jitter between -jitterMinutes and +jitterMinutes
      randomOffsetMs = (Math.random() * (jitterMinutes * 2) - jitterMinutes) * 60 * 1000;
    }
    now.setTime(now.getTime() + randomOffsetMs);
  }

  return now;
}

/**
 * Add small random micro-jitter (in meters) to coordinates so punches look like realistic mobile GPS
 * @param {number} baseLat 
 * @param {number} baseLon 
 * @param {number} maxJitterMeters 
 * @returns {{ latitude: string, longitude: string }}
 */
export function applyLocationJitter(baseLat, baseLon, maxJitterMeters = 150) {
  const deltaY = (Math.random() - 0.5) * 2 * maxJitterMeters;
  const deltaX = (Math.random() - 0.5) * 2 * maxJitterMeters;
  const latOffset = deltaY / 111320;
  const lonOffset = deltaX / (111320 * Math.cos((baseLat * Math.PI) / 180));
  return {
    latitude: (baseLat + latOffset).toFixed(6),
    longitude: (baseLon + lonOffset).toFixed(6)
  };
}

/**
 * Get all Monday-to-Friday week ranges between a start date and an end date
 * @param {string|Date} startDate 
 * @param {string|Date} endDate 
 * @returns {Array<{ fromDateStr: string, toDateStr: string, formattedRange: string, weekdays: Array }>}
 */
export function getIntermediateWeeks(startDate, endDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
  const end = typeof endDate === 'string' ? new Date(endDate) : new Date(endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const weeks = [];
  const processedWeeks = new Set();

  let curr = new Date(start);
  while (curr <= end) {
    const { fromDateStr, toDateStr, formattedRange, fromDate, toDate } = getWeekDateRange(curr);
    
    if (!processedWeeks.has(fromDateStr)) {
      processedWeeks.add(fromDateStr);
      const weekdays = getWeekdaysInWeek(fromDate);
      weeks.push({
        fromDateStr,
        toDateStr,
        formattedRange,
        fromDate,
        toDate,
        weekdays
      });
    }

    // Advance to next week
    curr.setDate(curr.getDate() + 7);
  }

  return weeks;
}

/**
 * Validate that a weekly timesheet contains strictly standard weekly hours (e.g. 5 days * 8h = 40h)
 * @param {Array} weekdays 
 * @param {number} dailyHours 
 * @param {number} actualHoursLogged 
 * @returns {{ valid: boolean, expectedHours: number, actualHours: number, message: string }}
 */
export function validateWeeklyHours(weekdays, dailyHours = 8.0, actualHoursLogged = null) {
  const expectedHours = weekdays.length * dailyHours;
  const actual = actualHoursLogged !== null ? actualHoursLogged : expectedHours;
  const valid = Math.abs(actual - expectedHours) < 0.01;

  return {
    valid,
    expectedHours,
    actualHours: actual,
    message: valid 
      ? `Weekly hours valid (${actual} hrs matches expected ${expectedHours} hrs).`
      : `Weekly hours mismatch: expected ${expectedHours} hrs for ${weekdays.length} days, but got ${actual} hrs!`
  };
}

/**
 * Parse CLI command line arguments into key-value options
 */
export function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    action: null,
    dryRun: false,
    force: false,
    catchup: false,
    week: null,
    date: null,
    month: null,
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
    } else if (arg === '--catchup') {
      options.catchup = true;
    } else if (arg === '--week' && args[i + 1]) {
      options.week = args[++i];
    } else if (arg === '--date' && args[i + 1]) {
      options.date = args[++i];
    } else if (arg === '--month' && args[i + 1]) {
      options.month = args[++i];
    } else if (arg === '--hours' && args[i + 1]) {
      options.hours = parseFloat(args[++i]);
    }
  }

  return options;
}

