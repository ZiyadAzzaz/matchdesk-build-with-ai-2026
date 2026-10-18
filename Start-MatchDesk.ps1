[CmdletBinding()]
param([switch]$Check)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$matchCandidates = [System.Collections.Generic.List[string]]::new()
$matchRoots = [System.Collections.Generic.List[string]]::new()
if ($env:MATCHDESK_PYTHON) { $matchCandidates.Add($env:MATCHDESK_PYTHON) }
$matchCandidates.Add((Join-Path $PSScriptRoot '.venv\Scripts\python.exe'))
if ($env:CONDA_PREFIX) { $matchCandidates.Add((Join-Path $env:CONDA_PREFIX 'python.exe')) }
if ($env:CONDA_EXE) { $matchRoots.Add((Split-Path (Split-Path $env:CONDA_EXE -Parent) -Parent)) }
$matchConda = Get-Command conda.exe -ErrorAction SilentlyContinue
if ($matchConda) { $matchRoots.Add((Split-Path (Split-Path $matchConda.Source -Parent) -Parent)) }
$matchPythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($matchPythonCommand) { $matchRoots.Add((Split-Path $matchPythonCommand.Source -Parent)) }
if ($env:USERPROFILE) {
    foreach ($matchFolder in @('anaconda3', 'miniconda3', '.conda')) { $matchRoots.Add((Join-Path $env:USERPROFILE $matchFolder)) }
}
foreach ($matchRoot in ($matchRoots | Select-Object -Unique)) {
    foreach ($matchEnvironment in @('matchdesk', 'zero-dev')) { $matchCandidates.Add((Join-Path $matchRoot "envs\$matchEnvironment\python.exe")) }
}
if ($matchPythonCommand) { $matchCandidates.Add($matchPythonCommand.Source) }
$matchPython = $null
foreach ($matchCandidate in ($matchCandidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $matchCandidate -PathType Leaf) {
        & $matchCandidate (Join-Path $PSScriptRoot 'scripts\check_runtime.py')
        if ($LASTEXITCODE -eq 0) { $matchPython = $matchCandidate; break }
    }
}
if (-not $matchPython) { Write-Host 'Install Python 3.11 and the packages using README.md, then try again.'; exit 1 }
Write-Host "MatchDesk interpreter: $matchPython"
if ($Check) { Write-Host 'Runtime verified. No server or browser started.'; exit 0 }
$matchListener = Get-NetTCPConnection -LocalPort 8503 -State Listen -ErrorAction SilentlyContinue
if ($matchListener) {
    try {
        $matchHealth = Invoke-RestMethod 'http://127.0.0.1:8503/health' -TimeoutSec 2
        if ($matchHealth.app -eq 'MatchDesk') { Start-Process 'http://127.0.0.1:8503'; exit 0 }
    } catch { }
    Write-Host 'Port 8503 is occupied. Run: python -m matchdesk --port 8504'; exit 1
}
Write-Host 'Opening MatchDesk at http://127.0.0.1:8503 . Keep this window open; Ctrl+C stops the server.'
& $matchPython -m matchdesk --open-browser
exit $LASTEXITCODE
