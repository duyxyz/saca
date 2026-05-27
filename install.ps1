# PowerShell script to install SACA standalone binary for Windows
$ErrorActionPreference = 'Stop'

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   Installing SACA (Standalone for Windows)   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Configuration
$repo = "duyxyz/saca"
$installDir = "$env:USERPROFILE\.saca"

# 2. Get latest release version and download URL from GitHub API
Write-Host "🔍 Checking latest version from GitHub..." -ForegroundColor Gray
$latestReleaseUrl = "https://api.github.com/repos/$repo/releases/latest"
try {
    # Use TLS 1.2
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $releaseInfo = Invoke-RestMethod -Uri $latestReleaseUrl -UseBasicParsing
    $tag = $releaseInfo.tag_name
    Write-Host "✨ Found SACA version: $tag" -ForegroundColor Green
    
    $asset = $releaseInfo.assets | Where-Object { $_.name -eq "saca-windows-x64.zip" }
    if (-not $asset) {
        throw "Could not find saca-windows-x64.zip in the latest release assets."
    }
    $downloadUrl = $asset.browser_download_url
} catch {
    Write-Host "⚠️ Warning: Failed to fetch from GitHub API: $_" -ForegroundColor Yellow
    Write-Host "Falling back to direct release download URL..." -ForegroundColor Gray
    $downloadUrl = "https://github.com/$repo/releases/latest/download/saca-windows-x64.zip"
}

# 3. Create install directory
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir | Out-Null
}

$zipFile = "$installDir\saca-windows-x64.zip"

# 4. Download SACA
Write-Host "📥 Downloading SACA..." -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
} catch {
    Write-Host "❌ Download failed! Please check your internet connection." -ForegroundColor Red
    throw $_
}

# 5. Extract files
Write-Host "📦 Extracting SACA..." -ForegroundColor Gray
try {
    # 1. Kill any running adb or saca processes aggressively
    try {
        Stop-Process -Name "adb" -Force -ErrorAction SilentlyContinue
        Stop-Process -Name "saca" -Force -ErrorAction SilentlyContinue
        taskkill /f /im adb.exe 2>$null | Out-Null
        taskkill /f /im saca.exe 2>$null | Out-Null
    } catch {}
    Start-Sleep -Seconds 1

    # 2. Rename locked adb.exe if it's still locked to free up the path for extraction
    $adbExe = "$installDir\adb.exe"
    if (Test-Path $adbExe) {
        try {
            Remove-Item -Path $adbExe -Force -ErrorAction Stop
        } catch {
            $rand = Get-Random
            Rename-Item -Path $adbExe -NewName "adb.exe.old-$rand" -ErrorAction SilentlyContinue
        }
    }

    # 3. Rename locked saca.exe if it's still locked
    $sacaExe = "$installDir\saca.exe"
    if (Test-Path $sacaExe) {
        try {
            Remove-Item -Path $sacaExe -Force -ErrorAction Stop
        } catch {
            $rand = Get-Random
            Rename-Item -Path $sacaExe -NewName "saca.exe.old-$rand" -ErrorAction SilentlyContinue
        }
    }

    # 4. Clean up any leftover old files from previous updates that are now unlocked
    Get-ChildItem -Path $installDir -Filter "*.old-*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

    Expand-Archive -Path $zipFile -DestinationPath $installDir -Force
    Remove-Item -Path $zipFile -Force
    
    # Rename saca-win.exe to saca.exe for simpler terminal usage
    $exePath = "$installDir\saca-win.exe"
    $targetExe = "$installDir\saca.exe"
    if (Test-Path $exePath) {
        if (Test-Path $targetExe) {
            Remove-Item -Path $targetExe -Force
        }
        Rename-Item -Path $exePath -NewName "saca.exe"
    }
} catch {
    Write-Host "❌ Extraction/Setup failed!" -ForegroundColor Red
    throw $_
}

# 6. Add to PATH
Write-Host "⚙️ Adding SACA to PATH environment variable..." -ForegroundColor Gray
$pathKey = "HKCU:\Environment"
$userPath = (Get-ItemProperty -Path $pathKey -Name Path).Path

if ($userPath -split ';' -contains $installDir) {
    Write-Host "✅ SACA is already in your PATH." -ForegroundColor Green
} else {
    $newUserPath = "$userPath;$installDir"
    Set-ItemProperty -Path $pathKey -Name Path -Value $newUserPath
    # Update PATH in current PowerShell session
    $env:PATH = "$env:PATH;$installDir"
    Write-Host "✅ SACA has been successfully added to your PATH." -ForegroundColor Green
}

Write-Host "`n🎉 Installation complete!" -ForegroundColor Green
Write-Host "👉 SACA is installed in: $installDir" -ForegroundColor Gray
Write-Host "💡 Open a NEW terminal and type: " -NoNewline -ForegroundColor Gray
Write-Host "saca" -ForegroundColor Yellow -BackgroundColor Black
Write-Host " to start SACA immediately!`n" -ForegroundColor Gray
