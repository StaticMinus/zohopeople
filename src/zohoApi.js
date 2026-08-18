import axios from 'axios';
import { config, validateApiConfig } from './config.js';
import { log, formatZohoAttendanceDate } from './utils.js';

let cachedAccessToken = null;
let tokenExpirationTime = 0;

/**
 * Obtain a fresh Zoho OAuth 2.0 Access Token using Refresh Token
 */
export async function getAccessToken() {
  const now = Date.now();
  // Return cached token if valid (with 60 second safety margin)
  if (cachedAccessToken && now < tokenExpirationTime - 60000) {
    return cachedAccessToken;
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
        date: dateStr,
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
 * Add a time log entry to Zoho Time Tracker / Timesheets
 * @param {string} dateStr Format: "yyyy-MM-dd" or "dd/MM/yyyy"
 * @param {number} hours 
 * @param {string} jobName 
 */
export async function addTimeLog(dateStr, hours = config.timesheetWorkHours, jobName = config.timesheetJobName) {
  const accessToken = await getAccessToken();

  log(`Adding Time Log: Date=${dateStr}, Hours=${hours}, Job=${jobName}...`);

  const params = {
    date: dateStr,
    hours: hours.toString(),
    jobName: jobName,
    billableStatus: config.timesheetBillableStatus
  };

  if (config.empId) params.empId = config.empId;
  if (config.empEmail) params.emailId = config.empEmail;
  if (config.timesheetProjectId) params.projectId = config.timesheetProjectId;

  try {
    const response = await axios.post(`${config.peopleUrl}/people/api/timetracker/addTimeLog`, null, {
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
