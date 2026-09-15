# Author/creator: nattapat2871 (https://nattapat2871.me)
param(
  [Parameter(Mandatory=$true)][string]$MarkerPath,
  [Parameter(Mandatory=$true)][string]$Nonce
)
$ErrorActionPreference = 'Stop'

function Test-PathAtOrInside([string]$Candidate, [string]$Parent) {
  $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
  return $candidatePath.Equals($parentPath, [StringComparison]::OrdinalIgnoreCase) -or
    $candidatePath.StartsWith($parentPath + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Test-PathStrictlyInside([string]$Candidate, [string]$Parent) {
  $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  $parentPath = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
  return -not $candidatePath.Equals($parentPath, [StringComparison]::OrdinalIgnoreCase) -and
    $candidatePath.StartsWith($parentPath + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Write-MigrationState([object]$Marker, [string]$State, [string]$Reason = '') {
  $Marker.state = $State
  $Marker | Add-Member -NotePropertyName completedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
  if ($Reason) {
    if ($Reason.Length -gt 500) { $Reason = $Reason.Substring(0, 500) }
    $Marker | Add-Member -NotePropertyName blockedReason -NotePropertyValue $Reason -Force
  }
  $temporary = $MarkerPath + '.' + $Nonce + '.tmp'
  if (Test-Path -LiteralPath $temporary) { throw 'Unsafe migration status temporary path.' }
  [IO.File]::WriteAllText($temporary, ($Marker | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $temporary -Destination $MarkerPath -Force
}

try {
  $markerFile = Get-Item -LiteralPath $MarkerPath
  if ($markerFile.PSIsContainer -or
      ($markerFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $markerFile.Name -ne 'pending-windows-scope-migration.json' -or
      $markerFile.Length -lt 2 -or $markerFile.Length -gt 65536 -or
      $Nonce -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Unsafe Windows scope migration marker.'
  }
  $marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
  if ($marker.schemaVersion -ne 1 -or $marker.nonce -ne $Nonce -or $marker.state -ne 'ready-for-cleanup') {
    throw 'Windows scope migration marker is not ready for cleanup.'
  }

  $legacyDirectory = [IO.Path]::GetFullPath([string]$marker.legacyInstallDirectory).TrimEnd('\')
  $uninstallerPath = [IO.Path]::GetFullPath([string]$marker.uninstallerPath)
  $currentLauncherPath = [IO.Path]::GetFullPath([string]$marker.currentUserLauncherPath)
  $dataPath = [IO.Path]::GetFullPath([string]$marker.dataPath).TrimEnd('\')
  $timestampFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'"
  $timestampStyles = [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
  $createdAt = [DateTimeOffset]::ParseExact(
    [string]$marker.createdAt,
    $timestampFormat,
    [Globalization.CultureInfo]::InvariantCulture,
    $timestampStyles
  )
  $readyAt = [DateTimeOffset]::ParseExact(
    [string]$marker.readyAt,
    $timestampFormat,
    [Globalization.CultureInfo]::InvariantCulture,
    $timestampStyles
  )
  $now = [DateTimeOffset]::UtcNow
  if ($createdAt -gt $now -or $readyAt -gt $now -or $readyAt -lt $createdAt -or $now.Subtract($createdAt).TotalDays -gt 30) {
    throw 'Windows scope migration marker timestamp is invalid.'
  }
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $programFilesRoots = @($env:ProgramFiles, $programFilesX86) | Where-Object { $_ }
  if (-not ($programFilesRoots | Where-Object { Test-PathStrictlyInside $legacyDirectory $_ })) {
    throw 'Legacy installation is outside Program Files.'
  }
  $expectedCurrentDirectory = [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA 'Programs\NamLauncher\Launcher')
  ).TrimEnd('\')
  if (-not [IO.Path]::GetDirectoryName($currentLauncherPath).Equals($expectedCurrentDirectory, [StringComparison]::OrdinalIgnoreCase) -or
      -not [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($MarkerPath)).TrimEnd('\').Equals(
        $dataPath,
        [StringComparison]::OrdinalIgnoreCase
      )) {
    throw 'Current User launcher or migration marker path is invalid.'
  }
  if ((Test-PathAtOrInside $currentLauncherPath $legacyDirectory) -or (Test-PathAtOrInside $dataPath $legacyDirectory)) {
    throw 'Active launcher files or data overlap the legacy installation.'
  }
  if (-not (Test-PathAtOrInside $uninstallerPath $legacyDirectory) -or
      [IO.Path]::GetFileName($uninstallerPath) -ne 'Uninstall NamLauncher.exe') {
    throw 'Legacy uninstaller path is invalid.'
  }
  $uninstaller = Get-Item -LiteralPath $uninstallerPath
  $legacyDirectoryItem = Get-Item -LiteralPath $legacyDirectory
  $dataDirectoryItem = Get-Item -LiteralPath $dataPath
  $currentLauncherItem = Get-Item -LiteralPath $currentLauncherPath
  if ($uninstaller.PSIsContainer -or -not $legacyDirectoryItem.PSIsContainer -or
      -not $dataDirectoryItem.PSIsContainer -or $currentLauncherItem.PSIsContainer -or
      ($uninstaller.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      ($legacyDirectoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      ($dataDirectoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      ($currentLauncherItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Legacy uninstaller file is unsafe.'
  }
  if ((Get-FileHash -LiteralPath $uninstallerPath -Algorithm SHA256).Hash -ne [string]$marker.uninstallerSha256) {
    throw 'Legacy uninstaller changed after verification.'
  }
  $launcher = Get-Process -Id ([int]$marker.currentLauncherPid) -ErrorAction SilentlyContinue
  if (-not $launcher -or [IO.Path]::GetFullPath($launcher.Path) -ne $currentLauncherPath) {
    throw 'Verified Current User launcher is no longer running.'
  }

  # ShellExecute's RunAs verb is the intentional UAC boundary. Cancelling the
  # prompt leaves the machine-wide installation and every data directory intact.
  $cleanup = Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
  if (-not $cleanup -or $cleanup.ExitCode -ne 0) {
    throw "Legacy uninstaller exited with code $($cleanup.ExitCode)."
  }
  Write-MigrationState $marker 'cleanup-complete'
  exit 0
} catch {
  $message = $_.Exception.Message
  try {
    if ($marker) {
      $state = if ($message -match 'cancelled by the user|operation was canceled|1223') { 'cleanup-deferred' } else { 'blocked' }
      Write-MigrationState $marker $state $message
    }
  } catch { [Diagnostics.Debug]::WriteLine($_.Exception.Message) }
  [Console]::Error.WriteLine($message)
  exit 1
}
