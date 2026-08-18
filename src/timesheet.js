import { config } from './config.js';
import { addTimeLog } from './zohoApi.js';
import { log, getWeekdaysInMonth, parseArgs } from './utils.js';

async function main() {
  const args = parseArgs();
  const now = new Date();

  // Determine target Year & Month
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-indexed (1-12)

  if (args.month) {
    const [yStr, mStr] = args.month.split('-');
    if (yStr && mStr) {
      year = parseInt(yStr, 10);
      month = parseInt(mStr, 10);
    }
  }

  const hoursPerDay = args.hours || config.timesheetWorkHours;
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  log(`--- Processing Timesheet for ${monthName} ${year} ---`, 'timesheet.log');
  log(`Target Settings: ${hoursPerDay} hours/day | Job: ${config.timesheetJobName}`);

  const weekdays = getWeekdaysInMonth(year, month);
  log(`Found ${weekdays.length} weekdays (Mon-Fri) in ${monthName} ${year}. Total target hours: ${weekdays.length * hoursPerDay} hrs.`);

  if (args.dryRun) {
    log(`[DRY RUN] Generated ${weekdays.length} timesheet entries for ${monthName} ${year}:`);
    weekdays.forEach(({ dateStr }) => {
      log(`  -> Date: ${dateStr} | Hours: ${hoursPerDay} | Job: ${config.timesheetJobName}`);
    });
    log(`[DRY RUN] Completed simulation. No API calls were made.`, 'timesheet.log');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (const { dateStr, zohoFormat } of weekdays) {
    try {
      log(`Processing entry for date ${dateStr}...`);
      await addTimeLog(dateStr, hoursPerDay, config.timesheetJobName);
      successCount++;
    } catch (err) {
      log(`Failed to record timesheet entry for ${dateStr}: ${err.message}`, 'timesheet.log');
      failCount++;
    }
  }

  log(`--- Timesheet Processing Complete ---`, 'timesheet.log');
  log(`Summary for ${monthName} ${year}: ${successCount} successful, ${failCount} failed out of ${weekdays.length} days. Total Hours: ${successCount * hoursPerDay} hrs.`);
}

main();
