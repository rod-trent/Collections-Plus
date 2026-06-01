# package.ps1 — build a Chrome Web Store / Edge Add-ons upload ZIP.
# Bundles only the runtime files (no tests, fixtures, docs, or dev files) with
# manifest.json at the ZIP root. Output: dist/collections-plus-<version>.zip
#
#   pwsh -NoProfile -File tools/package.ps1     (or: npm run package)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$staging = Join-Path $dist 'pkg'

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'lib') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'icons') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $staging 'sidepanel') | Out-Null

# Top-level runtime files.
Copy-Item (Join-Path $root 'manifest.json') $staging
Copy-Item (Join-Path $root 'background.js') $staging
Copy-Item (Join-Path $root 'LICENSE') $staging

# Modules and assets.
Copy-Item (Join-Path $root 'lib/*.js') (Join-Path $staging 'lib')
Copy-Item (Join-Path $root 'icons/*.png') (Join-Path $staging 'icons')

# Side panel — ship only the real UI, not the dev preview shim.
Copy-Item (Join-Path $root 'sidepanel/panel.html') (Join-Path $staging 'sidepanel')
Copy-Item (Join-Path $root 'sidepanel/panel.css') (Join-Path $staging 'sidepanel')
Copy-Item (Join-Path $root 'sidepanel/panel.js') (Join-Path $staging 'sidepanel')

$zip = Join-Path $dist "collections-plus-$version.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip
Remove-Item -Recurse -Force $staging

$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host "Created $zip ($size KB)"
