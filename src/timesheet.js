import { config } from './config.js';
import { addTimeLog } from './zohoApi.js';
import { log, getWeekdaysInMonth, parseArgs } from './utils.js';

async function main() {
  const args = parseArgs();
  const now = new Date();

  // Target Year & Month
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-indexed

  if (args.month) {
    const [yStr, mStr] = args.month.split('-');
    if (yStr && mStr) {
      year = parseInt(yStr, 10);
      month = parseInt(mStr, 10);
    }
  }

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
  const weekdays = getWeekdaysInMonth(year, month);

  // Requirement: Minimum 160 hours per month for payday approval by the 20th
  const MIN_MONTHLY_HOURS = 160.0;
  let defaultDailyHours = args.hours || config.timesheetWorkHours || 8.0;

  // Calculate required daily hours to meet minimum 160 hours threshold
  let dailyHours = defaultDailyHours;
  const projectedTotal = weekdays.length * dailyHours;

  if (projectedTotal < MIN_MONTHLY_HOURS && weekdays.length > 0) {
    // Auto-adjust daily hours to hit 160 hrs target (e.g. 160 / 19 days = 8.42 hrs/day)
    dailyHours = parseFloat((MIN_MONTHLY_HOURS / weekdays.length).toFixed(2));
    log(`Notice: Adjusting daily hours to ${dailyHours} hrs/day to meet minimum monthly threshold of ${MIN_MONTHLY_HOURS} hrs across ${weekdays.length} weekdays.`);
  }

  const totalCalculatedHours = (weekdays.length * dailyHours).toFixed(1);

  log(`--- Processing Timesheet for ${monthName} ${year} (Pay Day: 25th | Submission Target: By 20th) ---`, 'timesheet.log');
  log(`Month Summary: ${weekdays.length} weekdays (Mon-Fri) | Daily Rate: ${dailyHours} hrs/day | Total Projected: ${totalCalculatedHours} hrs`);

  if (args.dryRun) {
    log(`[DRY RUN] Simulating ${weekdays.length} timesheet submissions for ${monthName} ${year}:`);
    weekdays.forEach(({ dateStr }) => {
      log(`  -> Date: ${dateStr} | Hours: ${dailyHours} | Job: ${config.timesheetJobName}`);
    });
    log(`[DRY RUN] Completed. Total Hours: ${totalCalculatedHours} hrs (Min required: ${MIN_MONTHLY_HOURS} hrs). No API calls made.`, 'timesheet.log');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (const { dateStr } of weekdays) {
    try {
      log(`Submitting timesheet entry for ${dateStr} (${dailyHours} hrs)...`);
      await addTimeLog(dateStr, dailyHours, config.timesheetJobName);
      successCount++;
    } catch (err) {
      log(`Failed entry for ${dateStr}: ${err.message}`, 'timesheet.log');
      failCount++;
    }
  }

  const finalHoursLogged = (successCount * dailyHours).toFixed(1);
  log(`--- Timesheet Submission Complete ---`, 'timesheet.log');
  log(`Final Status: ${successCount}/${weekdays.length} days logged | Total Hours Logged: ${finalHoursLogged} hrs (Threshold: ${MIN_MONTHLY_HOURS} hrs).`);
}

main();
