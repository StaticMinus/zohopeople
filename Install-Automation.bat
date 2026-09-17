@echo off
title Installing Zoho People Background Automation
color 0A

echo ============================================================
echo   Installing Automated Zoho People Scheduler
echo   Runs Mon-Fri Check-in (08:55), Check-out (17:00), & Weekly Timesheets (Fridays)
echo ============================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\setup-scheduler.ps1"

echo.
echo ============================================================
echo   SUCCESS! Automation installed into Windows Task Scheduler.
echo   You do NOT need to run any commands ever again!
echo ============================================================
echo.
pause
