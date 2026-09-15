# Author/creator: nattapat2871 (https://nattapat2871.me)
param(
  [Parameter(Mandatory=$true)][string]$BundlePath,
  [Parameter(Mandatory=$true)][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedVersion,
  [Parameter(Mandatory=$true)][string]$LauncherPath,
  [Parameter(Mandatory=$true)][int]$ParentId,
  [Parameter(Mandatory=$true)][string]$StatusPath,
  [Parameter(Mandatory=$true)][string]$CancellationPath,
  [Parameter(Mandatory=$true)][string]$HealthPath,
  [Parameter(Mandatory=$true)][string]$AttemptId,
  [Parameter(Mandatory=$true)][string]$Nonce,
  [int]$HealthTimeoutSeconds = 35
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$statusPathValidated = $false
$parentStopped = $false
$installationSwapped = $false
$updateSucceeded = $false
$newLauncher = $null
$installDirectory = ''
$installParent = ''
$stagingPath = ''
$backupPath = ''
$MAX_BUNDLE_FILES = 25000
$MAX_BUNDLE_BYTES = [long](2GB)
$MAX_BUNDLE_ENTRY_BYTES = [long](512MB)
$MAX_MANIFEST_BYTES = [long](8MB)

function Write-UpdateStatus([string]$State, [string]$Detail, [int]$LauncherPid = 0) {
  if ($Detail.Length -gt 1000) { $Detail = $Detail.Substring(0, 1000) }
  $payload = [ordered]@{
    schemaVersion=1
    attemptId=$AttemptId
    nonce=$Nonce
    state=$State
    detail=$Detail
    at=[DateTime]::UtcNow.ToString('o')
    helperPid=$PID
  }
  if ($LauncherPid -gt 0) { $payload.launcherPid = $LauncherPid }
  $temporary = $StatusPath + '.' + $Nonce + '.tmp'
  if (Test-Path -LiteralPath $temporary) { throw 'Unsafe application update temporary status path.' }
  [IO.File]::WriteAllText(
    $temporary,
    ($payload | ConvertTo-Json -Compress),
    (New-Object Text.UTF8Encoding($false))
  )
  Move-Item -LiteralPath $temporary -Destination $StatusPath -Force
}

function Test-UpdateCancelled() {
  if (-not (Test-Path -LiteralPath $CancellationPath)) { return $false }
  $marker = Get-Item -LiteralPath $CancellationPath
  if ($marker.PSIsContainer -or
      ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $marker.Length -lt 2 -or $marker.Length -gt 4096) {
    throw 'Unsafe application update cancellation marker.'
  }
  try { $payload = Get-Content -LiteralPath $CancellationPath -Raw | ConvertFrom-Json }
  catch { throw 'Invalid application update cancellation marker.' }
  if ($payload.schemaVersion -ne 1 -or $payload.attemptId -ne $AttemptId -or $payload.nonce -ne $Nonce) {
    throw 'Mismatched application update cancellation marker.'
  }
  return $true
}

function Get-SafeRelativePath([object]$RawPath) {
  if ($RawPath -isnot [string] -or [string]::IsNullOrWhiteSpace($RawPath)) {
    throw 'The application bundle contains an empty path.'
  }
  $relative = [string]$RawPath
  if ($relative.Length -gt 300 -or
      $relative.Contains('\') -or
      $relative.Contains(':') -or
      $relative.StartsWith('/') -or
      [IO.Path]::IsPathRooted($relative)) {
    throw "The application bundle contains an unsafe path: $relative"
  }
  $segments = $relative.Split('/')
  foreach ($segment in $segments) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq '.' -or $segment -eq '..') {
      throw "The application bundle contains an unsafe path segment: $relative"
    }
  }
  return [string]::Join('/', $segments)
}

function Assert-PathWithin([string]$Candidate, [string]$Root) {
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $fullCandidate = [IO.Path]::GetFullPath($Candidate)
  $prefix = $fullRoot + [IO.Path]::DirectorySeparatorChar
  if (-not $fullCandidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The application bundle attempted to escape its staging directory.'
  }
  return $fullCandidate
}

function Assert-NoReparseTree([string]$Root) {
  $rootItem = Get-Item -LiteralPath $Root
  if ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Unsafe reparse point at $Root"
  }
  foreach ($item in Get-ChildItem -LiteralPath $Root -Force -Recurse) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw "Unsafe reparse point in application bundle: $($item.FullName)"
    }
  }
}

function Remove-SafeTree([string]$Target, [string]$ExpectedParent, [string]$ExpectedName) {
  if (-not (Test-Path -LiteralPath $Target)) { return }
  $fullTarget = [IO.Path]::GetFullPath($Target)
  if ([IO.Path]::GetDirectoryName($fullTarget) -ne [IO.Path]::GetFullPath($ExpectedParent).TrimEnd('\') -or
      [IO.Path]::GetFileName($fullTarget) -ne $ExpectedName) {
    throw 'Refusing to remove an unexpected application update directory.'
  }
  Assert-NoReparseTree $fullTarget
  Remove-Item -LiteralPath $fullTarget -Recurse -Force
}

function Expand-VerifiedBundle([string]$ArchivePath, [string]$Destination) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
  $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$totalBytes = 0
  [int]$fileCount = 0
  try {
    foreach ($entry in $archive.Entries) {
      if (Test-UpdateCancelled) { throw 'Application update was cancelled.' }
      $entryName = [string]$entry.FullName
      $isDirectory = $entryName.EndsWith('/')
      $trimmedName = if ($isDirectory) { $entryName.TrimEnd('/') } else { $entryName }
      if ([string]::IsNullOrWhiteSpace($trimmedName)) { continue }
      $relative = Get-SafeRelativePath $trimmedName
      if (-not $seen.Add($relative)) { throw "Duplicate application bundle path: $relative" }
      $unixKind = (($entry.ExternalAttributes -shr 16) -band 0xF000)
      if ($unixKind -eq 0xA000 -or ($entry.ExternalAttributes -band [int][IO.FileAttributes]::ReparsePoint)) {
        throw "Links and reparse points are not allowed in the application bundle: $relative"
      }
      $destinationPath = Assert-PathWithin (Join-Path $Destination ($relative.Replace('/', '\'))) $Destination
      if ($isDirectory) {
        [IO.Directory]::CreateDirectory($destinationPath) | Out-Null
        continue
      }
      $fileCount += 1
      if ($fileCount -gt $MAX_BUNDLE_FILES -or $entry.Length -lt 0 -or $entry.Length -gt $MAX_BUNDLE_ENTRY_BYTES) {
        throw 'The application bundle exceeds its safe file limits.'
      }
      $totalBytes += [long]$entry.Length
      if ($totalBytes -gt $MAX_BUNDLE_BYTES) { throw 'The application bundle exceeds its safe expanded size.' }
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destinationPath)) | Out-Null
      $input = $entry.Open()
      $output = New-Object IO.FileStream(
        $destinationPath,
        [IO.FileMode]::CreateNew,
        [IO.FileAccess]::Write,
        [IO.FileShare]::None
      )
      [long]$written = 0
      try {
        $buffer = New-Object byte[] 1048576
        while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $written += $read
          if ($written -gt $entry.Length -or $written -gt $MAX_BUNDLE_ENTRY_BYTES) {
            throw "Expanded application file exceeded its declared size: $relative"
          }
          $output.Write($buffer, 0, $read)
        }
      } finally {
        $output.Dispose()
        $input.Dispose()
      }
      if ($written -ne $entry.Length) { throw "Expanded application file size mismatch: $relative" }
    }
  } finally {
    $archive.Dispose()
  }
  if ($fileCount -lt 2) { throw 'The application bundle is incomplete.' }
  Assert-NoReparseTree $Destination
}

function Test-StagedBundle([string]$Root) {
  Assert-NoReparseTree $Root
  $manifestPath = Join-Path $Root 'namlauncher-bundle.json'
  $launcher = Join-Path $Root 'NamLauncher.exe'
  foreach ($required in @($manifestPath, $launcher)) {
    $requiredItem = Get-Item -LiteralPath $required
    if ($requiredItem.PSIsContainer -or ($requiredItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'The application bundle is missing a required regular file.'
    }
  }
  $manifestItem = Get-Item -LiteralPath $manifestPath
  if ($manifestItem.Length -lt 2 -or $manifestItem.Length -gt $MAX_MANIFEST_BYTES) {
    throw 'The application bundle manifest size is invalid.'
  }
  try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { throw 'The application bundle manifest is invalid JSON.' }
  if ($manifest.schemaVersion -ne 1 -or
      $manifest.version -ne $ExpectedVersion -or
      $manifest.platform -ne 'win32' -or
      $manifest.arch -ne 'x64' -or
      $manifest.entrypoint -ne 'NamLauncher.exe' -or
      -not $manifest.files -or
      $manifest.files.Count -lt 1 -or
      $manifest.files.Count -gt $MAX_BUNDLE_FILES) {
    throw 'The application bundle manifest does not match this update.'
  }

  $expectedFiles = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $manifest.files) {
    $relative = Get-SafeRelativePath $file.path
    if ($relative -eq 'namlauncher-bundle.json' -or -not $expectedFiles.Add($relative)) {
      throw "Duplicate or invalid manifest path: $relative"
    }
    if ($file.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or
        $file.size -isnot [ValueType] -or
        [long]$file.size -lt 0 -or
        [long]$file.size -gt $MAX_BUNDLE_ENTRY_BYTES) {
      throw "Invalid application bundle manifest entry: $relative"
    }
    $candidate = Assert-PathWithin (Join-Path $Root ($relative.Replace('/', '\'))) $Root
    $candidateItem = Get-Item -LiteralPath $candidate
    if ($candidateItem.PSIsContainer -or
        ($candidateItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $candidateItem.Length -ne [long]$file.size -or
        (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash -ne $file.sha256) {
      throw "Application bundle file verification failed: $relative"
    }
  }

  foreach ($actual in Get-ChildItem -LiteralPath $Root -File -Force -Recurse) {
    $relative = $actual.FullName.Substring($Root.TrimEnd('\').Length + 1).Replace('\', '/')
    if ($relative -eq 'namlauncher-bundle.json') { continue }
    if (-not $expectedFiles.Contains($relative)) {
      throw "Application bundle contains an undeclared file: $relative"
    }
  }
  if (-not $expectedFiles.Contains('NamLauncher.exe')) {
    throw 'NamLauncher.exe is not declared in the application bundle manifest.'
  }
}

function Test-HealthMarker([int]$ExpectedLauncherPid) {
  if (-not (Test-Path -LiteralPath $HealthPath)) { return $false }
  $marker = Get-Item -LiteralPath $HealthPath
  if ($marker.PSIsContainer -or
      ($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $marker.Length -lt 2 -or $marker.Length -gt 4096) { return $false }
  try { $payload = Get-Content -LiteralPath $HealthPath -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { return $false }
  $parsedAt = [DateTime]::MinValue
  return $payload.schemaVersion -eq 1 -and
    $payload.attemptId -eq $AttemptId -and
    $payload.nonce -eq $Nonce -and
    $payload.version -eq $ExpectedVersion -and
    $payload.launcherPid -eq $ExpectedLauncherPid -and
    $payload.at -is [string] -and
    [DateTime]::TryParse([string]$payload.at, [ref]$parsedAt)
}

try {
  $bundle = Get-Item -LiteralPath $BundlePath
  $launcher = Get-Item -LiteralPath $LauncherPath
  $workDirectory = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
  $installDirectory = [IO.Path]::GetFullPath($launcher.DirectoryName).TrimEnd('\')
  $installParent = [IO.Path]::GetDirectoryName($installDirectory)
  $installName = [IO.Path]::GetFileName($installDirectory)
  $expectedStatusName = 'app-update-status-' + $AttemptId + '.json'
  $expectedCancellationName = 'app-update-cancel-' + $AttemptId + '.json'
  $expectedHealthName = 'app-update-health-' + $AttemptId + '.json'
  $expectedHelperName = 'apply-app-update-' + $AttemptId + '.ps1'
  if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$' -or
      $ExpectedVersion -notmatch '^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$' -or
      $AttemptId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' -or
      $Nonce -notmatch '^[0-9a-fA-F]{64}$' -or
      $ParentId -lt 1 -or $HealthTimeoutSeconds -lt 5 -or $HealthTimeoutSeconds -gt 120 -or
      $bundle.PSIsContainer -or $launcher.PSIsContainer -or
      $bundle.Extension -ne '.zip' -or $launcher.Name -ne 'NamLauncher.exe' -or
      ($bundle.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      ($launcher.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $bundle.DirectoryName -ne $workDirectory -or
      [string]::IsNullOrWhiteSpace($installParent) -or
      $installDirectory -eq [IO.Path]::GetPathRoot($installDirectory) -or
      [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($StatusPath)) -ne $workDirectory -or
      [IO.Path]::GetFileName($StatusPath) -ne $expectedStatusName -or
      [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($CancellationPath)) -ne $workDirectory -or
      [IO.Path]::GetFileName($CancellationPath) -ne $expectedCancellationName -or
      [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($HealthPath)) -ne $workDirectory -or
      [IO.Path]::GetFileName($HealthPath) -ne $expectedHealthName -or
      [IO.Path]::GetFileName($PSCommandPath) -ne $expectedHelperName) {
    throw 'Unsafe Windows application update paths or arguments.'
  }
  foreach ($candidate in @($StatusPath, ($StatusPath + '.' + $Nonce + '.tmp'), $CancellationPath, $HealthPath)) {
    if ((Test-Path -LiteralPath $candidate) -and
        ((Get-Item -LiteralPath $candidate).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Unsafe Windows application update marker path.'
    }
  }
  $statusPathValidated = $true
  if (Test-UpdateCancelled) { throw 'Application update was cancelled.' }
  if ((Get-FileHash -LiteralPath $BundlePath -Algorithm SHA256).Hash -ne $ExpectedSha256) {
    throw 'Windows application bundle checksum mismatch.'
  }
  $parent = Get-Process -Id $ParentId -ErrorAction SilentlyContinue
  if (-not $parent -or [IO.Path]::GetFullPath($parent.Path) -ne $launcher.FullName) {
    throw 'The update parent is not the expected launcher.'
  }

  $stagingPath = Join-Path $installParent ('.' + $installName + '-update-' + $AttemptId)
  $backupPath = Join-Path $installParent ('.' + $installName + '-backup-' + $AttemptId)
  if ((Test-Path -LiteralPath $stagingPath) -or (Test-Path -LiteralPath $backupPath)) {
    throw 'Application update staging paths already exist.'
  }
  [IO.Directory]::CreateDirectory($stagingPath) | Out-Null
  Write-UpdateStatus 'verifying' 'Extracting and verifying the application bundle.'
  Expand-VerifiedBundle $BundlePath $stagingPath
  Test-StagedBundle $stagingPath

  Write-UpdateStatus 'ready' 'Verified application bundle; waiting for NamLauncher to exit.'
  $exitDeadline = [DateTime]::UtcNow.AddSeconds(90)
  while (-not $parent.HasExited) {
    if (Test-UpdateCancelled) { throw 'Application update was cancelled.' }
    if ([DateTime]::UtcNow -ge $exitDeadline) { throw 'NamLauncher did not exit safely.' }
    Start-Sleep -Milliseconds 100
    $parent.Refresh()
  }
  $parentStopped = $true
  if (Test-UpdateCancelled) { throw 'Application update was cancelled.' }
  if ((Get-FileHash -LiteralPath $BundlePath -Algorithm SHA256).Hash -ne $ExpectedSha256) {
    throw 'Windows application bundle changed before installation.'
  }
  Test-StagedBundle $stagingPath

  # NSIS owns these installation records and does not include them in the
  # portable application bundle. Preserve them only after every bundled file
  # has passed the manifest verification above.
  foreach ($preservedName in @('Uninstall NamLauncher.exe', 'uninstallerIcon.ico')) {
    $source = Join-Path $installDirectory $preservedName
    $destination = Join-Path $stagingPath $preservedName
    if ((Test-Path -LiteralPath $source -PathType Leaf) -and -not (Test-Path -LiteralPath $destination)) {
      $sourceItem = Get-Item -LiteralPath $source
      if (-not ($sourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Copy-Item -LiteralPath $source -Destination $destination
      }
    }
  }

  Write-UpdateStatus 'applying' 'Replacing the current application with the verified bundle.'
  Move-Item -LiteralPath $installDirectory -Destination $backupPath
  Move-Item -LiteralPath $stagingPath -Destination $installDirectory
  $installationSwapped = $true

  $newLauncherPath = Join-Path $installDirectory 'NamLauncher.exe'
  $newLauncher = Start-Process -FilePath $newLauncherPath -ArgumentList @(
    '--auto-update-health', $HealthPath,
    '--auto-update-attempt', $AttemptId,
    '--auto-update-nonce', $Nonce,
    '--auto-update-version', $ExpectedVersion
  ) -PassThru
  if (-not $newLauncher -or $newLauncher.Id -lt 1) { throw 'Windows could not restart the updated NamLauncher.' }
  Write-UpdateStatus 'restarting' 'Waiting for the updated launcher interface.' $newLauncher.Id

  $healthDeadline = [DateTime]::UtcNow.AddSeconds($HealthTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $healthDeadline) {
    if (Test-HealthMarker $newLauncher.Id) {
      $updateSucceeded = $true
      Write-UpdateStatus 'healthy' 'The updated launcher loaded successfully.' $newLauncher.Id
      break
    }
    if ($newLauncher.HasExited) { break }
    Start-Sleep -Milliseconds 150
    $newLauncher.Refresh()
  }
  if (-not $updateSucceeded) { throw 'The updated launcher did not confirm a healthy interface.' }

  Remove-SafeTree $backupPath $installParent ([IO.Path]::GetFileName($backupPath))
} catch {
  $failureMessage = $_.Exception.Message
  if ($installationSwapped) {
    try {
      if ($newLauncher -and -not $newLauncher.HasExited) {
        $newLauncher.Kill()
        $newLauncher.WaitForExit(5000) | Out-Null
      }
    } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
    try {
      Remove-SafeTree $installDirectory $installParent ([IO.Path]::GetFileName($installDirectory))
      Move-Item -LiteralPath $backupPath -Destination $installDirectory
      $installationSwapped = $false
      if ($statusPathValidated) { Write-UpdateStatus 'rolled-back' $failureMessage }
      Start-Process -FilePath (Join-Path $installDirectory 'NamLauncher.exe') -ArgumentList '--auto-update-fallback'
    } catch {
      $failureMessage += ' Rollback failed: ' + $_.Exception.Message
      if ($statusPathValidated) {
        try { Write-UpdateStatus 'failed' $failureMessage } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
      }
    }
  } else {
    if ($statusPathValidated) {
      try { Write-UpdateStatus 'failed' $failureMessage } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
    }
    if ($parentStopped -and (Test-Path -LiteralPath $LauncherPath -PathType Leaf)) {
      Start-Process -FilePath $LauncherPath -ArgumentList '--auto-update-fallback'
    } else {
      [Console]::Error.WriteLine($failureMessage)
    }
  }
  exit 1
} finally {
  if (-not $updateSucceeded -and $stagingPath -and $installParent -and (Test-Path -LiteralPath $stagingPath)) {
    try { Remove-SafeTree $stagingPath $installParent ([IO.Path]::GetFileName($stagingPath)) }
    catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
  }
  foreach ($candidate in @($CancellationPath, $HealthPath)) {
    try {
      $item = Get-Item -LiteralPath $candidate -ErrorAction SilentlyContinue
      if ($item -and -not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
          $item.DirectoryName -eq [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')) {
        Remove-Item -LiteralPath $item.FullName -Force -ErrorAction SilentlyContinue
      }
    } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
  }
  try {
    $helper = Get-Item -LiteralPath $PSCommandPath -ErrorAction SilentlyContinue
    if ($helper -and -not ($helper.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
        $helper.DirectoryName -eq [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -and
        $helper.Name -eq ('apply-app-update-' + $AttemptId + '.ps1')) {
      Remove-Item -LiteralPath $helper.FullName -Force -ErrorAction SilentlyContinue
    }
  } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
}
