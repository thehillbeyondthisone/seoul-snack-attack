# Restore the pinned, project-local MCP environment. Blender itself must exist.
$ErrorActionPreference = 'Stop'
$studioRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
Push-Location $studioRoot
try {
    $studioUv = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $studioUv) { throw 'uv is required. Install uv, then rerun this setup.' }
    $studioBlender = (& node --input-type=module -e "import {findBlender} from './tools/blender/find-blender.mjs'; console.log(findBlender() ?? '');").Trim()
    if (-not $studioBlender) { throw 'Blender not found. Set BLENDER to the Blender executable.' }
    $studioPython = Get-ChildItem -LiteralPath (Split-Path $studioBlender) -Directory |
        ForEach-Object { Join-Path $_.FullName 'python/bin/python.exe' } |
        Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $studioPython) { throw 'Could not locate the Python bundled with Blender.' }
    $studioEnvPython = '_work/blender-mcp/venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $studioEnvPython)) {
        & $studioUv.Source --cache-dir '_work/blender-mcp/uv-cache' venv --python $studioPython '_work/blender-mcp/venv'
        if ($LASTEXITCODE) { throw 'Creating the MCP environment failed.' }
    }
    & $studioUv.Source --cache-dir '_work/blender-mcp/uv-cache' pip install --python $studioEnvPython -r tools/blender/mcp/requirements-lock.txt
    if ($LASTEXITCODE) { throw 'Installing the MCP dependencies failed.' }
    Write-Output 'Blender MCP is installed. Open Blender World Studio.cmd to view the studio.'
} finally { Pop-Location }
