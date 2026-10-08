@echo off
title Smart Parking Framework

cd /d "%~dp0"

echo Starting Smart Parking Framework...
echo.

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install

    if errorlevel 1 (
        echo.
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)

call npm start

pause