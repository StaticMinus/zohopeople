# PowerShell script to create Windows Task Scheduler tasks for Zoho Check-In, Check-Out, and Timesheets
param (
    [string]$CheckInTime = "08:55",
    [string]$CheckOutTime = "17:00",
    [string]$ScriptDir = "$PSScriptRoot\.."
)

$WorkingDirectory = (Resolve-Path $ScriptDir).Path
$NodePath = (Get-Command node).Source

if (-not $NodePath) {
    Write-Error "Node.js was not found in PATH. Please install Node.js before running this script."
    exit 1
}

Write-Host "Setting up Windows Task Scheduler jobs for Zoho People..." -ForegroundColor Green
Write-Host "Working Directory: $WorkingDirectory"

# Configure robust settings: run on battery, wake if supported, start missed runs when PC turns on
$TaskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -Priority 5

# 1. Create Daily Check-In Task
$CheckInAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/checkin.js --action checkin" -WorkingDirectory $WorkingDirectory
$CheckInTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $CheckInTime
Register-ScheduledTask -TaskName "ZohoPeople_CheckIn" -Action $CheckInAction -Trigger $CheckInTrigger -Settings $TaskSettings -Description "Automated Zoho People Check-In (Mon-Fri)" -Force

# 2. Create Daily Check-Out Task
$CheckOutAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/checkin.js --action checkout" -WorkingDirectory $WorkingDirectory
$CheckOutTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $CheckOutTime
Register-ScheduledTask -TaskName "ZohoPeople_CheckOut" -Action $CheckOutAction -Trigger $CheckOutTrigger -Settings $TaskSettings -Description "Automated Zoho People Check-Out (Mon-Fri)" -Force

# 3. Create Weekly Timesheet Task (Runs every Friday at 18:00)
# Clean up legacy monthly task if present
try {
    Unregister-ScheduledTask -TaskName "ZohoPeople_MonthlyTimesheet" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

$TimesheetAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/timesheet.js" -WorkingDirectory $WorkingDirectory
$TimesheetTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At "18:00"
Register-ScheduledTask -TaskName "ZohoPeople_WeeklyTimesheet" -Action $TimesheetAction -Trigger $TimesheetTrigger -Settings $TaskSettings -Description "Automated Zoho People Weekly Timesheet Submission (Mon-Fri 40 hrs)" -Force

Write-Host "Tasks successfully registered in Windows Task Scheduler!" -ForegroundColor Green
Write-Host "  - ZohoPeople_CheckIn (Mon-Fri at $CheckInTime)"
Write-Host "  - ZohoPeople_CheckOut (Mon-Fri at $CheckOutTime)"
Write-Host "  - ZohoPeople_WeeklyTimesheet (Every Friday at 18:00 - Submits weekly 40 hrs)"
