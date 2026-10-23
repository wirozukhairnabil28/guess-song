@echo off
title 🎵 Tebak Lagu — Game Launcher
cd /d "%~dp0"
color 0A

echo ========================================================
echo                 TEBAK LAGU — LAUNCHER
echo ========================================================
echo.

:: 1. Deteksi Python
set PY=
py --version >nul 2>&1
if not errorlevel 1 (
    set PY=py
) else (
    python --version >nul 2>&1
    if not errorlevel 1 (
        set PY=python
    )
)

if "%PY%"=="" (
    color 0C
    echo [ERROR] Python tidak ditemukan di komputer ini!
    echo Silakan install Python dari: https://www.python.org/downloads/
    echo Pastikan centang "Add Python to PATH" saat install.
    echo.
    pause
    exit /b 1
)

echo [OK] Menggunakan: %PY%
echo [INFO] Menyiapkan server game...

:: 2. Jalankan pembuka browser otomatis di background (menunggu server siap)
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0open-browser.ps1"

echo [OK] Server dimulai di: http://127.0.0.1:8000/
echo [INFO] Browser akan terbuka otomatis dalam beberapa detik.
echo.
echo ========================================================
echo  JANGAN TUTUP JENDELA INI SELAMA BERMAIN GAME!
echo  Untuk menghentikan game, tekan Ctrl+C atau tutup jendela ini.
echo ========================================================
echo.

:: 3. Jalankan server Python
%PY% server.py

echo.
echo ========================================================
echo Server telah berhenti.
echo ========================================================
pause
