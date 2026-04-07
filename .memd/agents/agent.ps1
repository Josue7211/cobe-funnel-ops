$env:MEMD_BUNDLE_ROOT = "/home/josue/Documents/projects/cobe-funnel-ops/.memd"
$bundleBackendEnv = Join-Path $env:MEMD_BUNDLE_ROOT "backend.env.ps1"
if (Test-Path $bundleBackendEnv) { . $bundleBackendEnv }
. (Join-Path $env:MEMD_BUNDLE_ROOT "env.ps1")
memd resume --output $env:MEMD_BUNDLE_ROOT --intent current_task
