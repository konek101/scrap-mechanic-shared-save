param(
    [string]$GameRelease = "C:\Program Files (x86)\Steam\steamapps\common\Scrap Mechanic\Release",
    [string]$Module = "${PSScriptRoot}\..\..\build-release\dll\SharedSave.dll"
)

$ErrorActionPreference = "Stop"
$injectorUrl = "https://github.com/QuestionableM/SM-DLL-Injector/releases/download/v1.8/vcruntime140_1.dll"
$injectorHash = "ed379e2fe4063a2e183a6240534e684e0fa942cba061783c77be8599f5b03e64"
$runtime = Join-Path $GameRelease "vcruntime140_1.dll"
$backup = Join-Path $GameRelease "vcruntime140_1_.dll"
$moduleDirectory = Join-Path $GameRelease "DLLModules"
$log = Join-Path $env:LOCALAPPDATA "SharedSave\SharedSave.dll.log"
$download = Join-Path $env:TEMP "sm-dll-injector-v1.8.dll"

if (Get-Process -Name ScrapMechanic -ErrorAction SilentlyContinue) { throw "Close Scrap Mechanic before installing the test injector." }
if (-not (Test-Path -LiteralPath $runtime)) { throw "Game runtime was not found: $runtime" }
if (-not (Test-Path -LiteralPath $Module)) { throw "Built module was not found: $Module" }

Invoke-WebRequest -Uri $injectorUrl -OutFile $download
if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $injectorHash) { throw "Injector hash mismatch." }

if (-not (Test-Path -LiteralPath $backup)) { Move-Item -LiteralPath $runtime -Destination $backup }
Copy-Item -LiteralPath $download -Destination $runtime -Force
New-Item -ItemType Directory -Path $moduleDirectory -Force | Out-Null
Copy-Item -LiteralPath $Module -Destination (Join-Path $moduleDirectory "SharedSave.dll") -Force
Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue

Start-Process "steam://run/387990"
try {
    for ($second = 0; $second -lt 90; $second++) {
        Start-Sleep -Seconds 1
        if (Test-Path -LiteralPath $log) {
            if (Select-String -LiteralPath $log -SimpleMatch "SharedSave.dll loaded" -Quiet) {
                Get-Process -Name ScrapMechanic -ErrorAction SilentlyContinue | Stop-Process -Force
                "Injector smoke test passed and test game process closed."
                exit 0
            }
        }
    }
    throw "Timed out waiting for SharedSave.dll."
}
finally {
    Get-Process -Name ScrapMechanic -ErrorAction SilentlyContinue | Stop-Process -Force
}
