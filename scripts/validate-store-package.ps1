# Author/creator: nattapat2871 (https://nattapat2871.me)
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$PackagePath,
  [Parameter(Mandatory)][string]$ExpectedIdentity,
  [Parameter(Mandatory)][string]$ExpectedPublisher,
  [string]$OutputDirectory = "release-store"
)

$ErrorActionPreference = "Stop"
$package = (Resolve-Path -LiteralPath $PackagePath).Path
$output = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
}
New-Item -ItemType Directory -Path $output -Force | Out-Null

$makeAppx = Get-Command makeappx.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
if (-not $makeAppx) {
  $candidates = @(
    Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue
    Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue
  ) | Where-Object { $_.FullName -match "\\x64\\makeappx\.exe$" } | Sort-Object FullName -Descending
  $makeAppx = $candidates | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $makeAppx) { throw "makeappx.exe was not found" }

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$unpack = Join-Path $tempRoot "namlauncher-store-validation"
if (Test-Path -LiteralPath $unpack) { Remove-Item -LiteralPath $unpack -Recurse -Force }
New-Item -ItemType Directory -Path $unpack -Force | Out-Null

& $makeAppx unpack /p $package /d $unpack /o
if ($LASTEXITCODE -ne 0) { throw "makeappx could not unpack the Store package" }

$manifestPath = Join-Path $unpack "AppxManifest.xml"
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$identity = $manifest.Package.Identity
if ($identity.Name -ne $ExpectedIdentity) { throw "Identity mismatch: $($identity.Name)" }
if ($identity.Publisher -ne $ExpectedPublisher) { throw "Publisher mismatch: $($identity.Publisher)" }
if ($identity.ProcessorArchitecture -ne "x64") { throw "Unexpected architecture: $($identity.ProcessorArchitecture)" }
if ($identity.Version -notmatch '^\d+\.\d+\.\d+\.0$') { throw "Invalid Store version: $($identity.Version)" }
if (-not (Test-Path -LiteralPath (Join-Path $unpack "app\NamLauncher.exe"))) { throw "NamLauncher.exe is missing" }
if (-not (Test-Path -LiteralPath (Join-Path $unpack "app\resources\package-type"))) { throw "Microsoft Store package marker is missing" }
$packageType = (Get-Content -LiteralPath (Join-Path $unpack "app\resources\package-type") -Raw).Trim()
if ($packageType -ne "microsoft-store") { throw "Unexpected package type: $packageType" }

$version = $identity.Version -replace '\.0$', ''
$msixPath = Join-Path $output "NamLauncher-$version-Microsoft-Store.msix"
if (Test-Path -LiteralPath $msixPath) { Remove-Item -LiteralPath $msixPath -Force }
& $makeAppx pack /d $unpack /p $msixPath /o
if ($LASTEXITCODE -ne 0) { throw "makeappx could not create the MSIX package" }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($msixPath)
try {
  $signatureEntry = $archive.Entries | Where-Object { $_.FullName -ieq 'AppxSignature.p7x' } | Select-Object -First 1
  if ($signatureEntry) { throw "Expected an unsigned Store package, but AppxSignature.p7x is present." }
} finally {
  $archive.Dispose()
}
$signatureStatus = 'NotSigned'
$sha256 = (Get-FileHash -LiteralPath $msixPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$sha256  $(Split-Path -Leaf $msixPath)" | Set-Content -LiteralPath "$msixPath.sha256" -Encoding ascii

$summary = [ordered]@{
  schemaVersion = 1
  package = Split-Path -Leaf $msixPath
  version = $identity.Version
  identity = $identity.Name
  publisher = $identity.Publisher
  architecture = $identity.ProcessorArchitecture
  signature = $signatureStatus
  sha256 = $sha256
}
$summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output "microsoft-store-package.json") -Encoding utf8
Write-Host "Validated unsigned Store package: $msixPath"
