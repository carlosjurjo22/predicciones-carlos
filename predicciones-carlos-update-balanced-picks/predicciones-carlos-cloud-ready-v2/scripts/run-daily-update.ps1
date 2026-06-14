$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Script = Join-Path $Root "scripts\update-predictions.js"
$LogDir = Join-Path $Root "logs"
$LogFile = Join-Path $LogDir "daily-update.log"
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (Test-Path -LiteralPath $BundledNode) {
  $Node = $BundledNode
} else {
  $NodeCommand = Get-Command node -ErrorAction Stop
  $Node = $NodeCommand.Source
}

$StartedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -LiteralPath $LogFile -Value ""
Add-Content -LiteralPath $LogFile -Value "==== $StartedAt ===="
Add-Content -LiteralPath $LogFile -Value "Root: $Root"

Push-Location $Root
try {
  $Output = & $Node $Script --keep-current-on-fallback 2>&1
  $ExitCode = $LASTEXITCODE
  $Output | ForEach-Object { Add-Content -LiteralPath $LogFile -Value $_ }
  Add-Content -LiteralPath $LogFile -Value "ExitCode: $ExitCode"
  if ($ExitCode -ne 0) {
    exit $ExitCode
  }
} catch {
  Add-Content -LiteralPath $LogFile -Value ("ERROR: " + $_.Exception.Message)
  exit 1
} finally {
  Pop-Location
}
