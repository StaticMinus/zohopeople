import { config } from './config.js';
import { recordCheckIn, recordCheckOut, getTodayAttendanceStatus } from './zohoApi.js';
import { log, isWeekday, applyTimeJitter, parseArgs, formatZohoAttendanceDate } from './utils.js';

async function main() {
  const args = parseArgs();
  const action = args.action ? args.action.toLowerCase() : null;

  if (!action || (action !== 'checkin' && action !== 'checkout')) {
    console.log(`
Usage: node src/checkin.js --action <checkin|checkout> [--dry-run] [--force]

Options:
  --action <checkin|checkout>   Required. Specify whether to check-in or check-out.
  --dry-run                     Optional. Simulates the request without calling Zoho API.
  --force                       Optional. Overrides weekend check to execute on Saturday/Sunday.
    `);
    process.exit(1);
  }

  const now = new Date();
  log(`--- Starting Zoho People ${action.toUpperCase()} process ---`, 'attendance.log');

  // Check weekday status
  if (!isWeekday(now) && !args.force) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[now.getDay()];
    log(`Weekend detected (${currentDay}). Skipping automatic ${action}. Use --force to override.`, 'attendance.log');
    process.exit(0);
  }

  // Idempotency check: Skip if already performed today (unless --force is specified)
  if (!args.force && !args.dryRun) {
    try {
      const status = await getTodayAttendanceStatus(now);
      if (action === 'checkin' && status.checkedIn) {
        log(`[ALREADY RECORDED] Check-in for today (${status.date}) is already recorded at ${status.firstIn}. Skipping.`, 'attendance.log');
        process.exit(0);
      }
      if (action === 'checkout' && status.checkedOut) {
        log(`[ALREADY RECORDED] Check-out for today (${status.date}) is already recorded at ${status.lastOut}. Skipping.`, 'attendance.log');
        process.exit(0);
      }
    } catch (e) {
      log(`Note: Attendance pre-check could not be completed (${e.message}), proceeding...`);
    }
  }

  // Calculate target time with jitter (direction = 'earlier' ensures clock-in is not late and clock-out is early)
  const baseTimeStr = action === 'checkin' ? config.defaultCheckInTime : config.defaultCheckOutTime;
  const targetTimestamp = applyTimeJitter(baseTimeStr, config.jitterMinutes, 'earlier');
  const formattedTime = formatZohoAttendanceDate(targetTimestamp);

  log(`Action: ${action.toUpperCase()}`);
  log(`Base Schedule Time: ${baseTimeStr} (Jitter range: -${config.jitterMinutes} to 0 mins [${action === 'checkin' ? 'Not Late' : 'Early'}])`);
  log(`Effective Timestamp: ${formattedTime}`);

  if (args.dryRun) {
    log(`[DRY RUN] Would submit ${action.toUpperCase()} for ${formattedTime}. No API call made.`, 'attendance.log');
    process.exit(0);
  }

  try {
    let result;
    if (action === 'checkin') {
      result = await recordCheckIn(targetTimestamp);
    } else {
      result = await recordCheckOut(targetTimestamp);
    }

    log(`[SUCCESS] ${action.toUpperCase()} recorded successfully at ${formattedTime}!`, 'attendance.log');
  } catch (err) {
    log(`[ERROR] ${action.toUpperCase()} failed: ${err.message}`, 'attendance.log');
    process.exit(1);
  }
}

main();
