import axios from 'axios';
import { config, validateApiConfig } from './config.js';
import { log, formatZohoAttendanceDate } from './utils.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_CACHE_FILE = path.join(__dirname, '..', 'logs', '.token_cache.json');

let cachedAccessToken = null;
let tokenExpirationTime = 0;

// Initialize memory cache from disk if available
try {
  if (fs.existsSync(TOKEN_CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
    if (raw.token && raw.expiresAt && Date.now() < raw.expiresAt - 60000) {
      cachedAccessToken = raw.token;
      tokenExpirationTime = raw.expiresAt;
    }
  }
} catch (e) {
  // ignore cache read error
}

/**
 * Obtain a fresh Zoho OAuth 2.0 Access Token using Refresh Token
 */
export async function getAccessToken() {
  const now = Date.now();
  // Return cached token if valid (with 60 second safety margin)
  if (cachedAccessToken && now < tokenExpirationTime - 60000) {
    return cachedAccessToken;
  }

  // Check disk cache once more
  try {
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
      if (raw.token && raw.expiresAt && now < raw.expiresAt - 60000) {
        cachedAccessToken = raw.token;
        tokenExpirationTime = raw.expiresAt;
        return cachedAccessToken;
      }
    }
  } catch (e) {
    // ignore
  }

  validateApiConfig();

  const tokenUrl = `${config.accountsUrl}/oauth/v2/token`;
  log(`Requesting Zoho access token from ${tokenUrl}...`);

  try {
    const response = await axios.post(tokenUrl, null, {
      params: {
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token'
      }
    });

    if (response.data.error) {
      throw new Error(`Zoho Token Error: ${response.data.error}`);
    }

    cachedAccessToken = response.data.access_token;
    // expires_in is in seconds (usually 3600)
    const expiresInMs = (response.data.expires_in || 3600) * 1000;
    tokenExpirationTime = Date.now() + expiresInMs;

    // Persist to disk
    try {
      fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
        token: cachedAccessToken,
        expiresAt: tokenExpirationTime
      }), 'utf8');
    } catch (e) {
      // ignore
    }

    log('Successfully retrieved new Zoho OAuth access token.');
    return cachedAccessToken;
  } catch (err) {
    const errorDetail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    log(`Failed to obtain access token: ${errorDetail}`, 'error.log');
    throw new Error(`Authentication failure: ${errorDetail}`);
  }
}

/**
 * Record Check-In attendance entry in Zoho People
 * @param {Date} timestamp 
 * @param {object} options 
 */
export async function recordCheckIn(timestamp = new Date(), options = {}) {
  const accessToken = await getAccessToken();
  const dateStr = formatZohoAttendanceDate(timestamp);

  log(`Submitting Check-In for date/time: ${dateStr}...`);

  const params = {
    checkIn: dateStr,
    dateFormat: 'dd/MM/yyyy HH:mm:ss'
  };

  if (config.empId) params.empId = config.empId;
  if (config.empEmail) params.emailId = config.empEmail;

  if (options.latitude) params.latitude = options.latitude;
  if (options.longitude) params.longitude = options.longitude;

  try {
    const response = await axios.post(`${config.peopleUrl}/people/api/attendance`, null, {
      params,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    log(`Check-In API Response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error recording Check-In: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}

/**
 * Record Check-Out attendance entry in Zoho People
 * @param {Date} timestamp 
 * @param {object} options 
 */
export async function recordCheckOut(timestamp = new Date(), options = {}) {
  const accessToken = await getAccessToken();
  const dateStr = formatZohoAttendanceDate(timestamp);

  log(`Submitting Check-Out for date/time: ${dateStr}...`);

  const params = {
    checkOut: dateStr,
    dateFormat: 'dd/MM/yyyy HH:mm:ss'
  };

  if (config.empId) params.empId = config.empId;
  if (config.empEmail) params.emailId = config.empEmail;

  if (options.latitude) params.latitude = options.latitude;
  if (options.longitude) params.longitude = options.longitude;

  try {
    const response = await axios.post(`${config.peopleUrl}/people/api/attendance`, null, {
      params,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    log(`Check-Out API Response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error recording Check-Out: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}

/**
 * Fetch existing attendance entries for employee
 */
export async function getAttendanceEntries(dateStr) {
  const accessToken = await getAccessToken();
  try {
    const response = await axios.get(`${config.peopleUrl}/people/api/attendance/getAttendanceEntries`, {
      params: {
        sdate: dateStr,
        edate: dateStr,
        dateFormat: 'yyyy-MM-dd',
        empId: config.empId,
        emailId: config.empEmail
      },
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });
    return response.data;
  } catch (err) {
    log(`Error fetching attendance entries: ${err.message}`, 'error.log');
    throw err;
  }
}

/**
 * Fetch existing timelogs for an employee in a given date range
 * @param {string} fromDate - Format: "yyyy-MM-dd"
 * @param {string} toDate - Format: "yyyy-MM-dd"
 * @returns {Promise<Array>}
 */
export async function getTimeLogs(fromDate, toDate) {
  const accessToken = await getAccessToken();
  try {
    const response = await axios.get(`${config.peopleUrl}/people/api/timetracker/gettimelogs`, {
      params: {
        user: config.empEmail || config.empId,
        fromDate,
        toDate,
        dateFormat: 'yyyy-MM-dd'
      },
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });
    return response.data?.response?.result || [];
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error fetching timelogs (${fromDate} to ${toDate}): ${JSON.stringify(errObj)}`, 'error.log');
    return [];
  }
}

/**
 * Delete a specific timelog by ID
 * @param {string} timeLogId 
 */
export async function deleteTimeLog(timeLogId) {
  const accessToken = await getAccessToken();
  try {
    log(`Deleting timelog ID: ${timeLogId}...`);
    const response = await axios.post(`${config.peopleUrl}/people/api/timetracker/deletetimelog`, null, {
      params: { timeLogId },
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error deleting timelog ${timeLogId}: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}

/**
 * Fetch existing timesheets for employee in a given date range
 * @param {string} fromDate - Format: "yyyy-MM-dd"
 * @param {string} toDate - Format: "yyyy-MM-dd"
 * @returns {Promise<Array>}
 */
export async function getTimesheets(fromDate, toDate) {
  const accessToken = await getAccessToken();
  try {
    const response = await axios.get(`${config.peopleUrl}/people/api/timetracker/gettimesheet`, {
      params: {
        user: config.empEmail || config.empId,
        fromDate,
        toDate,
        dateFormat: 'yyyy-MM-dd'
      },
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });
    return response.data?.response?.result || [];
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error fetching timesheets: ${JSON.stringify(errObj)}`, 'error.log');
    return [];
  }
}

/**
 * Delete an existing timesheet by ID
 * @param {string} timesheetId 
 */
export async function deleteTimesheet(timesheetId) {
  const accessToken = await getAccessToken();
  try {
    log(`Deleting timesheet ID: ${timesheetId}...`);
    const response = await axios.post(`${config.peopleUrl}/people/api/timetracker/deletetimesheet`, null, {
      params: { timesheetId },
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
    });
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error deleting timesheet ${timesheetId}: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}

/**
 * Add a time log entry to Zoho Time Tracker / Timesheets
 * @param {string} dateStr Format: "yyyy-MM-dd" or "dd/MM/yyyy"
 * @param {number} hours 
 * @param {string} jobName 
 */
export async function addTimeLog(dateStr, hours = config.timesheetWorkHours, jobName = config.timesheetJobName) {
  const accessToken = await getAccessToken();

  log(`Adding Time Log: Date=${dateStr}, Hours=${hours}, Job=${jobName}...`);

  const params = {
    workDate: dateStr,
    date: dateStr,
    dateFormat: 'yyyy-MM-dd',
    hours: hours.toString(),
    billingStatus: (config.timesheetBillableStatus || 'Non-Billable').toLowerCase(),
    billableStatus: config.timesheetBillableStatus || 'Non-Billable'
  };

  if (config.empEmail) {
    params.user = config.empEmail;
    params.emailId = config.empEmail;
  }
  if (config.empId) {
    params.empId = config.empId;
  }
  if (config.timesheetProjectId) {
    params.projectId = config.timesheetProjectId;
    params.project = config.timesheetProjectId;
  }
  if (jobName) {
    params.jobName = jobName;
    params.job = jobName;
  }

  try {
    const response = await axios.post(`${config.peopleUrl}/people/api/timetracker/addtimelog`, null, {
      params,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    log(`Time Log API Response (${dateStr}): ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error adding time log for ${dateStr}: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}

/**
 * Ensure exactly ONE time log exists for the given date with the specified hours (Idempotent).
 * If a matching log exists, it is retained. Duplicate or excess logs are removed automatically.
 * @param {string} dateStr - Format: "yyyy-MM-dd"
 * @param {number} hours 
 * @param {string} jobName 
 */
export async function ensureTimeLog(dateStr, hours = config.timesheetWorkHours, jobName = config.timesheetJobName) {
  const existingLogs = await getTimeLogs(dateStr, dateStr);

  if (existingLogs && existingLogs.length > 0) {
    // Check if we already have exactly 1 log matching the target hours
    if (existingLogs.length === 1) {
      const currentLog = existingLogs[0];
      const logHours = parseFloat(currentLog.hours || currentLog.totalHours || '0');
      if (Math.abs(logHours - hours) < 0.01) {
        log(`Time log for ${dateStr} already exists with ${logHours} hrs. Skipping insertion.`);
        return { existing: true, log: currentLog };
      }
    }

    // If multiple logs or mismatched hours exist, clean up duplicates
    log(`[IDEMPOTENCY] Found ${existingLogs.length} existing logs for ${dateStr}. Cleaning up duplicate/stale entries...`);
    for (const item of existingLogs) {
      const id = item.timelogId || item.timeLogId || item.id || item.timeLogID;
      if (id) {
        await deleteTimeLog(id);
      }
    }
  }

  // Create a clean, single time log
  return await addTimeLog(dateStr, hours, jobName);
}

/**
 * Create and submit a timesheet for approval in Zoho People
 * @param {string} fromDateStr - Format: "yyyy-MM-dd"
 * @param {string} toDateStr - Format: "yyyy-MM-dd"
 * @param {string} timesheetName - Name of the timesheet
 */
export async function submitTimesheetForApproval(fromDateStr, toDateStr, timesheetName) {
  const accessToken = await getAccessToken();

  log(`Submitting Timesheet for Approval: Name="${timesheetName}", Period=${fromDateStr} to ${toDateStr}...`);

  const params = {
    user: config.empEmail || config.empId,
    emailId: config.empEmail,
    empId: config.empId,
    timesheetName: timesheetName,
    fromDate: fromDateStr,
    toDate: toDateStr,
    dateFormat: 'yyyy-MM-dd',
    sendforApproval: 'true'
  };

  if (config.timesheetProjectId) {
    params.projectId = config.timesheetProjectId;
  }

  try {
    const response = await axios.post(`${config.peopleUrl}/people/api/timetracker/createtimesheet`, null, {
      params,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`
      }
    });

    log(`Submit Timesheet API Response: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (err) {
    const errObj = err.response?.data || err.message;
    log(`Error submitting timesheet for approval: ${JSON.stringify(errObj)}`, 'error.log');
    throw err;
  }
}
