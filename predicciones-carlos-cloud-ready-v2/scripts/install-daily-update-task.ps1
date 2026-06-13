param(
  [string]$Time = "07:00",
  [string]$TaskName = "Predicciones Carlos - Actualizacion diaria"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Runner = Join-Path $Root "scripts\run-daily-update.ps1"
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$TaskRun = "$PowerShell -NoProfile -ExecutionPolicy Bypass -File $(Get-ShortPath $Runner)"

if (-not (Test-Path -LiteralPath $Runner)) {
  throw "No existe el script de actualizacion: $Runner"
}

$At = [DateTime]::ParseExact($Time, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
try {
  $Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""
  $DailyTrigger = New-ScheduledTaskTrigger -Daily -At $At
  $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
  $Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $DailyTrigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Actualiza automaticamente los pronosticos de Predicciones Carlos." `
    -Force | Out-Null
} catch {
  & schtasks.exe /Create /TN $TaskName /TR $TaskRun /SC DAILY /ST $Time /F | Out-Null
}

Write-Output "Tarea instalada: $TaskName"
Write-Output "Horario diario: $Time"
Write-Output "Log: $(Join-Path $Root 'logs\daily-update.log')"

function Get-ShortPath {
  param([string]$Path)

  $Command = "for %I in (`"$Path`") do @echo %~sI"
  $ShortPath = & cmd.exe /d /s /c $Command
  if ($LASTEXITCODE -eq 0 -and $ShortPath) {
    return $ShortPath.Trim()
  }
  return "`"$Path`""
}
