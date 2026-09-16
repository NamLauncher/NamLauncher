# Author/creator: nattapat2871 (https://nattapat2871.me)
[CmdletBinding()]
param(
  [string]$Source = "NamLauncher-icon.png",
  [string]$Destination = "build/appx"
)

$ErrorActionPreference = "Stop"
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$destinationPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Destination))
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null

Add-Type -AssemblyName System.Drawing

function Write-AppxAsset {
  param(
    [Parameter(Mandatory)][System.Drawing.Image]$Image,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][int]$Width,
    [Parameter(Mandatory)][int]$Height,
    [int]$IconSize = 0
  )

  $canvas = New-Object System.Drawing.Bitmap($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $size = if ($IconSize -gt 0) { $IconSize } else { [Math]::Min($Width, $Height) }
    $x = [int](($Width - $size) / 2)
    $y = [int](($Height - $size) / 2)
    $graphics.DrawImage($Image, $x, $y, $size, $size)
    $outputPath = Join-Path $destinationPath $Name
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
try {
  Write-AppxAsset -Image $sourceImage -Name "StoreLogo.png" -Width 50 -Height 50 -IconSize 42
  Write-AppxAsset -Image $sourceImage -Name "Square44x44Logo.png" -Width 44 -Height 44 -IconSize 38
  Write-AppxAsset -Image $sourceImage -Name "Square150x150Logo.png" -Width 150 -Height 150 -IconSize 128
  Write-AppxAsset -Image $sourceImage -Name "Wide310x150Logo.png" -Width 310 -Height 150 -IconSize 128
} finally {
  $sourceImage.Dispose()
}

Write-Host "Prepared Microsoft Store assets in $destinationPath"
