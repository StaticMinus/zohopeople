document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const systemStatus = document.getElementById('system-status');
  const userEmail = document.getElementById('user-email');

  const kpiCheckIn = document.getElementById('kpi-checkin-time');
  const kpiCheckOut = document.getElementById('kpi-checkout-time');
  const kpiJitter = document.getElementById('kpi-jitter');
  const kpiWorkHours = document.getElementById('kpi-work-hours');
  const kpiJobName = document.getElementById('kpi-job-name');

  const btnCheckIn = document.getElementById('btn-checkin');
  const btnCheckOut = document.getElementById('btn-checkout');
  const btnTimesheet = document.getElementById('btn-timesheet');
  const dryRunToggle = document.getElementById('dryrun-mode');

  const settingsForm = document.getElementById('settings-form');
  const inputCheckIn = document.getElementById('input-checkin');
  const inputCheckOut = document.getElementById('input-checkout');
  const inputJitter = document.getElementById('input-jitter');
  const inputHours = document.getElementById('input-hours');
  const inputJob = document.getElementById('input-job');

  const logContent = document.getElementById('log-content');
  const logTitle = document.getElementById('current-log-title');
  const btnRefreshLogs = document.getElementById('btn-refresh-logs');
  const tabPills = document.querySelectorAll('.pill');

  let currentLogTab = 'attendance';

  // 1. Fetch System Status & Configuration
  async function loadStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      userEmail.textContent = data.employee.email || 'Automated Account';
      kpiCheckIn.textContent = data.schedule.checkInTime || '09:00';
      kpiCheckOut.textContent = data.schedule.checkOutTime || '17:00';
      kpiJitter.textContent = `±${data.schedule.jitterMinutes}`;
      kpiWorkHours.textContent = `${data.schedule.workHours} hrs/day`;
      kpiJobName.textContent = data.schedule.jobName;

      // Populate settings form
      inputCheckIn.value = data.schedule.checkInTime;
      inputCheckOut.value = data.schedule.checkOutTime;
      inputJitter.value = data.schedule.jitterMinutes;
      inputHours.value = data.schedule.workHours;
      inputJob.value = data.schedule.jobName;
    } catch (err) {
      showToast('Failed to connect to backend server', 'error');
    }
  }

  // 2. Fetch Log Entries
  async function loadLogs(tabName = currentLogTab) {
    currentLogTab = tabName;
    logTitle.textContent = `logs/${tabName}.log`;
    logContent.innerHTML = '<div class="log-line text-muted">Loading log records...</div>';

    try {
      const res = await fetch(`/api/logs?type=${tabName}`);
      const data = await res.json();

      if (!data.logs || data.logs.length === 0) {
        logContent.innerHTML = '<div class="log-line text-muted">No log entries found.</div>';
        return;
      }

      logContent.innerHTML = data.logs.map(line => `<div class="log-line">${escapeHtml(line)}</div>`).join('');
      logContent.scrollTop = logContent.scrollHeight;
    } catch (err) {
      logContent.innerHTML = '<div class="log-line text-muted">Failed to load log content.</div>';
    }
  }

  // 3. Trigger Actions
  btnCheckIn.addEventListener('click', async () => {
    btnCheckIn.disabled = true;
    showToast('Executing Check-In request...', 'info');

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: dryRunToggle.checked })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.dryRun ? data.message : 'Check-In recorded successfully!', 'success');
        loadLogs('attendance');
      } else {
        showToast(`Check-In Error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Request failed: ${err.message}`, 'error');
    } finally {
      btnCheckIn.disabled = false;
    }
  });

  btnCheckOut.addEventListener('click', async () => {
    btnCheckOut.disabled = true;
    showToast('Executing Check-Out request...', 'info');

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: dryRunToggle.checked })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.dryRun ? data.message : 'Check-Out recorded successfully!', 'success');
        loadLogs('attendance');
      } else {
        showToast(`Check-Out Error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Request failed: ${err.message}`, 'error');
    } finally {
      btnCheckOut.disabled = false;
    }
  });

  const btnCatchup = document.getElementById('btn-catchup');

  btnTimesheet.addEventListener('click', async () => {
    btnTimesheet.disabled = true;
    showToast('Processing Current Weekly Timesheet...', 'info');

    try {
      const res = await fetch('/api/timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: dryRunToggle.checked })
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.dryRun ? `Simulated weekly timesheet` : `Processed weekly timesheet successfully!`, 'success');
        loadLogs('timesheet');
      } else {
        showToast(`Timesheet Error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Request failed: ${err.message}`, 'error');
    } finally {
      btnTimesheet.disabled = false;
    }
  });

  if (btnCatchup) {
    btnCatchup.addEventListener('click', async () => {
      btnCatchup.disabled = true;
      showToast('Scanning and Backfilling Unsubmitted Weeks...', 'info');

      try {
        const res = await fetch('/api/timesheet/catchup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun: dryRunToggle.checked })
        });
        const data = await res.json();

        if (data.success) {
          showToast(`Catch-up complete: Processed ${data.processedWeeksCount} week(s)!`, 'success');
          loadLogs('timesheet');
        } else {
          showToast(`Catch-up Error: ${data.error}`, 'error');
        }
      } catch (err) {
        showToast(`Catch-up failed: ${err.message}`, 'error');
      } finally {
        btnCatchup.disabled = false;
      }
    });
  }

  // 4. Save Settings Form
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('Saving updated settings...', 'info');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkInTime: inputCheckIn.value,
          checkOutTime: inputCheckOut.value,
          jitterMinutes: inputJitter.value,
          workHours: inputHours.value,
          jobName: inputJob.value
        })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Settings saved successfully!', 'success');
        loadStatus();
      } else {
        showToast(`Save Error: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    }
  });

  // Tab Pill Clicks
  tabPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tabPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadLogs(pill.dataset.tab);
    });
  });

  btnRefreshLogs.addEventListener('click', () => loadLogs());

  // Toast Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Initial Load
  loadStatus();
  loadLogs('attendance');
});
