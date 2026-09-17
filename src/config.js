import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  // Zoho API OAuth 2.0
  clientId: process.env.ZOHO_CLIENT_ID || '',
  clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
  refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
  accountsUrl: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',
  peopleUrl: process.env.ZOHO_PEOPLE_URL || 'https://people.zoho.com',

  // Employee details
  empId: process.env.ZOHO_EMP_ID || '',
  empEmail: process.env.ZOHO_EMP_EMAIL || '',

  // Attendance settings
  defaultCheckInTime: process.env.DEFAULT_CHECKIN_TIME || '09:00',
  defaultCheckOutTime: process.env.DEFAULT_CHECKOUT_TIME || '17:00',
  jitterMinutes: parseInt(process.env.JITTER_MINUTES || '5', 10),

  // Timesheet settings
  timesheetWorkHours: parseFloat(process.env.TIMESHEET_WORK_HOURS || '8.0'),
  timesheetProjectId: process.env.TIMESHEET_PROJECT_ID || '',
  timesheetJobName: process.env.TIMESHEET_JOB_NAME || 'General Work',
  timesheetBillableStatus: process.env.TIMESHEET_BILLABLE_STATUS || 'Non-Billable',

  // Cloud / Cron settings
  timezone: process.env.TIMEZONE || process.env.TZ || 'Africa/Lagos',
  cronSecret: process.env.CRON_SECRET || ''
};

/**
 * Validate that mandatory OAuth configuration exists before making API requests
 */
export function validateApiConfig() {
  const missing = [];
  if (!config.clientId) missing.push('ZOHO_CLIENT_ID');
  if (!config.clientSecret) missing.push('ZOHO_CLIENT_SECRET');
  if (!config.refreshToken) missing.push('ZOHO_REFRESH_TOKEN');

  if (missing.length > 0) {
    throw new Error(`Missing required configuration keys in .env file: ${missing.join(', ')}`);
  }
}
