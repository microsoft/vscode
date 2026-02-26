Param(
  [switch]$SkipDockerInstall,
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
  Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Ensure-DockerDesktop {
  param([bool]$SkipInstall)

  if ($SkipInstall) {
    Write-Host "Docker installation skipped by flag." -ForegroundColor Yellow
    return
  }

  $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $dockerCmd) {
    Write-Step "Docker پیدا نشد. در حال نصب Docker Desktop با winget"
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  }
}

function Start-And-WaitDocker {
  Write-Step "در حال اجرای Docker Desktop"

  $dockerExe = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerExe) {
    Start-Process -FilePath $dockerExe | Out-Null
  }

  $maxAttempts = 60
  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      docker info | Out-Null
      Write-Host "Docker آماده است." -ForegroundColor Green
      return
    }
    catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Docker Desktop در زمان مقرر آماده نشد. لطفاً Docker را دستی اجرا کنید و دوباره تلاش کنید."
}

function Ensure-EnvFile {
  if (-not (Test-Path ".env")) {
    Write-Step "فایل .env وجود ندارد. در حال ساخت از .env.example"
    Copy-Item ".env.example" ".env"
  }
}

function Run-Compose {
  param([bool]$NoBuild)

  Write-Step "در حال بالا آوردن سرویس‌ها با Docker Compose"
  if ($NoBuild) {
    docker compose up -d
  }
  else {
    docker compose up -d --build
  }

  Write-Host "`nHemayatVam با موفقیت اجرا شد." -ForegroundColor Green
  Write-Host "Frontend: http://localhost" -ForegroundColor Green
  Write-Host "Backend health: http://localhost/health" -ForegroundColor Green
}

try {
  Set-Location (Resolve-Path "$PSScriptRoot\..\..")

  Write-Step "شروع نصب خودکار HemayatVam روی ویندوز"
  Ensure-DockerDesktop -SkipInstall:$SkipDockerInstall
  Start-And-WaitDocker
  Ensure-EnvFile
  Run-Compose -NoBuild:$NoBuild
}
catch {
  Write-Host "خطا: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
