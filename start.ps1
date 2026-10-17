# PalettePilot - Wardrobe Match Engine
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  PalettePilot - Wardrobe Match Engine" -ForegroundColor White
Write-Host "  Baslatiliyor..." -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "node_modules")) {
    Write-Host "Bagimliliklar eksik, npm install calistiriliyor..." -ForegroundColor Yellow
    npm install
}

Write-Host "Tarayici aciliyor: http://localhost:5173" -ForegroundColor Green
Write-Host "Uygulamayi durdurmak icin bu pencerede Ctrl+C tuslarina basabilirsiniz." -ForegroundColor Gray
Write-Host ""

npm start
