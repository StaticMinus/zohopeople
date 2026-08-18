# PowerShell script to create Windows Task Scheduler tasks for Zoho Check-In and Check-Out
param (
    [string]$CheckInTime = "08:55",
    [string]$CheckOutTime = "17:00",
    [string]$ScriptDir = $PSScriptRoot\..
)

$WorkingDirectory = (Resolve-Path $ScriptDir).Path
$NodePath = (Get-Command node).Source

if (-not $NodePath) {
    Write-Error "Node.js was not found in PATH. Please install Node.js before running this script."
    exit 1
}

Write-Host "Setting up Windows Task Scheduler jobs for Zoho People..." -ForegroundColor Green
Write-Host "Working Directory: $WorkingDirectory"
Write-Host "Node.js Executable: $NodePath"

# 1. Create Daily Check-In Task
$CheckInAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/checkin.js --action checkin" -WorkingDirectory $WorkingDirectory
$CheckInTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $CheckInTime
Register-ScheduledTask -TaskName "ZohoPeople_CheckIn" -Action $CheckInAction -Trigger $CheckInTrigger -Description "Automated Zoho People Check-In (Mon-Fri)" -Force

# 2. Create Daily Check-Out Task
$CheckOutAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/checkin.js --action checkout" -WorkingDirectory $WorkingDirectory
$CheckOutTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At $CheckOutTime
Register-ScheduledTask -TaskName "ZohoPeople_CheckOut" -Action $CheckOutAction -Trigger $CheckOutTrigger -Description "Automated Zoho People Check-Out (Mon-Fri)" -Force

# 3. Create Monthly Timesheet Task (Runs on 28th of every month at 18:00)
$TimesheetAction = New-ScheduledTaskAction -Execute $NodePath -Argument "src/timesheet.js" -WorkingDirectory $WorkingDirectory
$TimesheetTrigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 28 -At "18:00"
Register-ScheduledTask -TaskName "ZohoPeople_MonthlyTimesheet" -Action $TimesheetAction -Trigger $TimesheetTrigger -Description "Automated Zoho People Monthly Timesheet Submission" -Force

Write-Host "Tasks successfully registered in Windows Task Scheduler!" -ForegroundColor Green
Write-Host "  - ZohoPeople_CheckIn (Mon-Fri at $CheckInTime)"
Write-Host "  - ZohoPeople_CheckOut (Mon-Fri at $CheckOutTime)"
Write-Host "  - ZohoPeople_MonthlyTimesheet (Monthly on 28th at 18:00)"
