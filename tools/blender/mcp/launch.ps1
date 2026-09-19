param([switch]$Show)
$ErrorActionPreference = 'Stop'
$studioRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$studioState = Join-Path $studioRoot '_work/blender-mcp'
$studioReady = Join-Path $studioState 'ready.json'
$studioPython = Join-Path $studioState 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) { throw 'Run tools/blender/mcp/setup.ps1 first.' }

function Show-StudioWindow($studioProcess) {
    # Used only when the user explicitly opens the visible launcher.
    if (-not ('SeoulStudioWindow' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SeoulStudioWindow {
    private delegate bool EnumCallback(IntPtr h, IntPtr data);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr data);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr h, uint command);
    [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    public static IntPtr FindMainWindow(int pid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, data) => {
            uint owner;
            GetWindowThreadProcessId(h, out owner);
            if (owner == pid && GetWindow(h, 4) == IntPtr.Zero && GetWindowTextLength(h) > 0) {
                found = h;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }
}
'@
    }
    $studioProcess.Refresh()
    $studioHandle = $studioProcess.MainWindowHandle
    if ($studioHandle -eq [IntPtr]::Zero) { $studioHandle = [SeoulStudioWindow]::FindMainWindow($studioProcess.Id) }
    if ($studioHandle -eq [IntPtr]::Zero) { throw 'The studio is running, but its window is not ready. Try the launcher again in a few seconds.' }
    [SeoulStudioWindow]::ShowWindowAsync($studioHandle, 9) | Out-Null
    [SeoulStudioWindow]::SetForegroundWindow($studioHandle) | Out-Null
}

$studioPort = 9877
$studioListener = Get-NetTCPConnection -LocalPort $studioPort -State Listen -ErrorAction SilentlyContinue
if ($studioListener) {
    if (-not (Test-Path -LiteralPath $studioReady)) { throw "Port $studioPort is already used by another process." }
    $studioRecord = Get-Content -LiteralPath $studioReady -Raw | ConvertFrom-Json
    if ($studioRecord.root -ne $studioRoot -or $studioListener.OwningProcess -notcontains $studioRecord.pid) {
        throw "Port $studioPort belongs to a different session. No process was stopped."
    }
    $studioProcess = Get-Process -Id $studioRecord.pid
    if ($studioProcess.ProcessName -ne 'blender') { throw 'The recorded studio PID is not Blender.' }
    if ($Show) { Show-StudioWindow $studioProcess }
    Write-Output "Blender studio is ready on 127.0.0.1:$studioPort (PID $($studioProcess.Id))."
    exit 0
}

Push-Location $studioRoot
try {
    $studioBlender = (& node --input-type=module -e "import {findBlender} from './tools/blender/find-blender.mjs'; console.log(findBlender() ?? '');").Trim()
    if (-not $studioBlender) { throw 'Blender not found; set BLENDER to its executable path.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $studioState 'preferences') | Out-Null
    $studioEnv = @{
        BLENDER_PORT = '9877'; DISABLE_TELEMETRY = 'true'
        BLENDER_USER_CONFIG = (Join-Path $studioState 'preferences')
    }
    $studioPrevious = @{}
    foreach ($studioKey in $studioEnv.Keys) {
        $studioPrevious[$studioKey] = [Environment]::GetEnvironmentVariable($studioKey, 'Process')
        [Environment]::SetEnvironmentVariable($studioKey, $studioEnv[$studioKey], 'Process')
    }
    try {
        $studioStyle = if ($Show) { 'Normal' } else { 'Hidden' }
        $studioScript = Join-Path $PSScriptRoot 'session.py'
        $studioProcess = Start-Process -FilePath $studioBlender -ArgumentList @('--factory-startup', '--python-exit-code', '1', '--python', ('"' + $studioScript + '"')) -WorkingDirectory $studioRoot -WindowStyle $studioStyle -PassThru -RedirectStandardOutput (Join-Path $studioState 'blender.stdout.log') -RedirectStandardError (Join-Path $studioState 'blender.stderr.log')
    } finally {
        foreach ($studioKey in $studioPrevious.Keys) { [Environment]::SetEnvironmentVariable($studioKey, $studioPrevious[$studioKey], 'Process') }
    }
    $studioDeadline = (Get-Date).AddSeconds(45)
    do {
        $studioProcess.Refresh()
        if ($studioProcess.HasExited) { throw 'Blender exited. See _work/blender-mcp/blender.stderr.log and blender.stdout.log.' }
        if (Test-Path -LiteralPath $studioReady) {
            $studioRecord = Get-Content -LiteralPath $studioReady -Raw | ConvertFrom-Json
            if ($studioRecord.pid -eq $studioProcess.Id) {
                Write-Output "Blender studio is ready on 127.0.0.1:$studioPort (PID $($studioProcess.Id))."
                exit 0
            }
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $studioDeadline)
    throw 'Blender did not become ready within 45 seconds. Inspect the studio logs.'
} finally { Pop-Location }
