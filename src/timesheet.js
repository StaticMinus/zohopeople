import { config } from './config.js';
import { 
  ensureTimeLog, 
  submitTimesheetForApproval, 
  getTimesheets, 
  getTimeLogs,
  deleteTimesheet
} from './zohoApi.js';
import { 
  log, 
  getWeekDateRange, 
  getWeekdaysInWeek, 
  getIntermediateWeeks,
  validateWeeklyHours, 
  formatDateYMD,
  parseArgs 
} from './utils.js';

/**
 * Process a single weekly timesheet batch with strict 40-hour validation and idempotency.
 */
export async function processWeeklyTimesheet({ fromDateStr, toDateStr, formattedRange, weekdays }, options = {}) {
  const dailyHours = options.hours || config.timesheetWorkHours || 8.0;
  const expectedTotalHours = weekdays.length * dailyHours;
  const timesheetName = `Timesheet - ${formattedRange}`;

  log(`\n========================================================================`, 'timesheet.log');
  log(`--- Processing Weekly Timesheet: ${formattedRange} (${fromDateStr} to ${toDateStr}) ---`, 'timesheet.log');
  log(`Expected: ${weekdays.length} weekdays (Mon-Fri) @ ${dailyHours} hrs/day = ${expectedTotalHours.toFixed(1)} hrs total`, 'timesheet.log');

  if (options.dryRun) {
    log(`[DRY RUN] Simulating timesheet processing for week ${formattedRange}:`);
    weekdays.forEach(({ dateStr, dayName }) => {
      log(`  -> ${dayName} (${dateStr}) | Hours: ${dailyHours} | Job: ${config.timesheetJobName}`);
    });
    log(`[DRY RUN] Would verify total = ${expectedTotalHours.toFixed(1)} hrs and submit Batch "${timesheetName}".`);
    return { success: true, dryRun: true, expectedTotalHours, processed: weekdays.length };
  }

  // 1. Check existing timesheets in this window
  const existingSheets = await getTimesheets(fromDateStr, toDateStr);
  const matchingSheet = existingSheets.find(s => 
    (s.fromDate === fromDateStr && s.toDate === toDateStr) ||
    s.timesheetName === timesheetName
  );

  if (matchingSheet) {
    const status = (matchingSheet.status || matchingSheet.approvalStatus || '').toLowerCase();
    if ((status === 'approved' || status === 'pending') && !options.force) {
      log(`[SKIP] Timesheet "${timesheetName}" is already ${matchingSheet.status || 'Pending'} in Zoho People (Total Hours: ${matchingSheet.totalHours || '40:00'}). Skipping re-submission.`, 'timesheet.log');
      return { success: true, skipped: true, status: matchingSheet.status || 'Pending' };
    } else if (status === 'rejected') {
      log(`[CLEANUP] Found previous Rejected timesheet "${timesheetName}" (ID: ${matchingSheet.recordId || matchingSheet.id}). Deleting before clean resubmission...`, 'timesheet.log');
      const sheetId = matchingSheet.recordId || matchingSheet.id || matchingSheet.timesheetId;
      if (sheetId) {
        await deleteTimesheet(sheetId);
      }
    }
  }

  // 2. Ensure each weekday has exactly ONE idempotent timelog
  let successCount = 0;
  for (const { dateStr, dayName } of weekdays) {
    try {
      log(`Ensuring timelog for ${dayName} ${dateStr} (${dailyHours} hrs)...`);
      await ensureTimeLog(dateStr, dailyHours, config.timesheetJobName);
      successCount++;
    } catch (err) {
      log(`Failed entry for ${dateStr}: ${err.message}`, 'timesheet.log');
    }
  }

  // 3. Post-logging verification: Query Zoho timelogs in the date window to verify exact total hours
  const actualLogs = await getTimeLogs(fromDateStr, toDateStr);
  let actualHoursLogged = 0;
  for (const l of actualLogs) {
    actualHoursLogged += parseFloat(l.hours || l.totalHours || '0');
  }

  const validation = validateWeeklyHours(weekdays, dailyHours, actualHoursLogged);
  log(`Pre-Submission Validation: ${validation.message}`, 'timesheet.log');

  if (!validation.valid) {
    const errMsg = `[ABORT] Cannot submit timesheet: Total logged hours (${actualHoursLogged} hrs) does not equal required ${expectedTotalHours} hrs!`;
    log(errMsg, 'error.log');
    throw new Error(errMsg);
  }

  // 4. Submit the clean 40.0-hour timesheet for approval
  let submissionResult = null;
  try {
    log(`Submitting Weekly Timesheet Batch "${timesheetName}" (${actualHoursLogged.toFixed(1)} hrs) for approval...`);
    submissionResult = await submitTimesheetForApproval(fromDateStr, toDateStr, timesheetName);
    log(`[SUCCESS] Weekly Timesheet Batch "${timesheetName}" submitted for approval successfully!`, 'timesheet.log');
  } catch (err) {
    log(`[ERROR] Error submitting weekly timesheet batch for approval: ${err.message}`, 'timesheet.log');
    throw err;
  }

  log(`--- Weekly Timesheet (${formattedRange}) Complete ---`, 'timesheet.log');
  return {
    success: true,
    timesheetName,
    fromDateStr,
    toDateStr,
    totalHours: actualHoursLogged,
    submissionResult
  };
}

async function main() {
  const args = parseArgs();
  const now = new Date();

  // Determine Target Date
  let targetDate = now;
  const rawDateStr = args.date || args.week;
  if (rawDateStr) {
    targetDate = new Date(rawDateStr);
  }

  const currentWeek = getWeekDateRange(targetDate);
  const currentWeekInfo = {
    ...currentWeek,
    weekdays: getWeekdaysInWeek(targetDate)
  };

  const dailyHours = args.hours || config.timesheetWorkHours || 8.0;

  log(`=== Zoho People Intelligent Timesheet Engine Starting ===`, 'timesheet.log');

  // Check for any unsubmitted backlog weeks (Catch-up Intelligence)
  // Look back up to 45 days to find the latest covered timesheet date
  const lookbackDate = new Date(targetDate);
  lookbackDate.setDate(lookbackDate.getDate() - 45);
  const lookbackStr = formatDateYMD(lookbackDate);
  const targetStr = formatDateYMD(targetDate);

  let weeksToProcess = [];

  try {
    const recentSheets = await getTimesheets(lookbackStr, targetStr);
    log(`Found ${recentSheets.length} recent timesheets in Zoho People between ${lookbackStr} and ${targetStr}.`);

    // Find the latest toDate among approved or pending timesheets
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

    if (latestCoveredDate) {
      log(`Latest approved/submitted timesheet in Zoho covers up to: ${latestCoveredDate}`);
      
      const lastCoveredWeek = getWeekDateRange(latestCoveredDate);
      const firstMissingMonday = new Date(lastCoveredWeek.fromDate);
      firstMissingMonday.setDate(firstMissingMonday.getDate() + 7);

      if (firstMissingMonday <= currentWeek.fromDate) {
        log(`[GAP DETECTED] Unsubmitted period detected from ${formatDateYMD(firstMissingMonday)} to ${currentWeek.toDateStr}!`);
        const missingWeeks = getIntermediateWeeks(firstMissingMonday, currentWeek.toDate);
        weeksToProcess = missingWeeks;
      } else {
        weeksToProcess = [currentWeekInfo];
      }
    } else {
      weeksToProcess = [currentWeekInfo];
    }
  } catch (err) {
    log(`[NOTE] Could not query past timesheet history (${err.message}). Defaulting to target week.`, 'timesheet.log');
    weeksToProcess = [currentWeekInfo];
  }

  // If specific date/week was forced via CLI, process only that week
  if (rawDateStr && !args.catchup) {
    weeksToProcess = [currentWeekInfo];
  }

  log(`\nProcessing ${weeksToProcess.length} week(s) in sequence:`);
  weeksToProcess.forEach((w, idx) => {
    log(` [${idx + 1}/${weeksToProcess.length}] ${w.formattedRange} (${w.fromDateStr} to ${w.toDateStr})`);
  });

  // Process all designated weeks sequentially
  let allSuccess = true;
  for (const week of weeksToProcess) {
    try {
      await processWeeklyTimesheet(week, {
        hours: dailyHours,
        dryRun: args.dryRun,
        force: args.force
      });
    } catch (err) {
      allSuccess = false;
      log(`[ERROR] Failed processing week ${week.formattedRange}: ${err.message}`, 'error.log');
    }
  }

  log(`\n=== Intelligent Timesheet Processing Complete (Status: ${allSuccess ? 'SUCCESS' : 'COMPLETED WITH WARNINGS'}) ===\n`, 'timesheet.log');
}

main();
