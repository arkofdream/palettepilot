@echo off
title PalettePilot - Wardrobe Match Engine
cd /d "%~dp0"

echo ========================================================
echo   PalettePilot - Wardrobe Match Engine
echo   Baslatiliyor...
echo ========================================================
echo.

REM node_modules kontrolu
if not exist "node_modules\" (
    echo Bagimliliklar eksik, npm install calistiriliyor...
    call npm install
    if errorlevel 1 (
        echo [HATA] npm install basarisiz oldu. Lutfen Node.js kurulu oldugundan emin olun.
        pause
        exit /b 1
    )
)

echo Tarayici aciliyor: http://localhost:5173
echo Uygulamayi durdurmak icin bu pencerede Ctrl+C tuslarina basabilirsiniz.
echo.

REM Vite sunucusunu tarayiciyi otomatik acacak sekilde baslatir
call npm start
if errorlevel 1 (
    echo.
    echo [BILGI] Sunucu kapandi.
    pause
)
