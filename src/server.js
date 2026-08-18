import http from 'http';
import { recordCheckIn, recordCheckOut, addTimeLog } from './zohoApi.js';
import { log, isWeekday, applyTimeJitter, getWeekdaysInMonth } from './utils.js';
import { config } from './config.js';

const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.WEBHOOK_SECRET || 'zoho-auto-secret';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const authHeader = req.headers['x-api-key'] || url.searchParams.get('key');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'Zoho People Automation' }));
  }

  if (SECRET_KEY && authHeader !== SECRET_KEY) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized. Invalid API key.' }));
  }

  if (req.method === 'POST' || req.method === 'GET') {
    if (url.pathname === '/api/checkin') {
      const now = new Date();
      if (!isWeekday(now) && !url.searchParams.get('force')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Weekend skipped.' }));
      }
      try {
        const targetTime = applyTimeJitter(config.defaultCheckInTime, config.jitterMinutes);
        const result = await recordCheckIn(targetTime);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, action: 'checkin', result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    if (url.pathname === '/api/checkout') {
      const now = new Date();
      if (!isWeekday(now) && !url.searchParams.get('force')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ message: 'Weekend skipped.' }));
      }
      try {
        const targetTime = applyTimeJitter(config.defaultCheckOutTime, config.jitterMinutes);
        const result = await recordCheckOut(targetTime);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, action: 'checkout', result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
    }

    if (url.pathname === '/api/timesheet') {
      const now = new Date();
      const month = parseInt(url.searchParams.get('month') || (now.getMonth() + 1), 10);
      const year = parseInt(url.searchParams.get('year') || now.getFullYear(), 10);
      const hours = parseFloat(url.searchParams.get('hours') || config.timesheetWorkHours);

      const weekdays = getWeekdaysInMonth(year, month);
      let successCount = 0;

      try {
        for (const { dateStr } of weekdays) {
          await addTimeLog(dateStr, hours, config.timesheetJobName);
          successCount++;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, processedDays: successCount, totalDays: weekdays.length }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message, processedDays: successCount }));
      }
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found.' }));
});

server.listen(PORT, () => {
  log(`Zoho Automation Server running on port ${PORT}`);
});
