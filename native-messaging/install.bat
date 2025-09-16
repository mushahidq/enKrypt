@echo off
setlocal

:: Check for Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH
    echo Please install Python 3.7 or later
    exit /b 1
)

:: Get extension ID
if "%EXTENSION_ID%"=="" (
    set /p EXTENSION_ID="Enter your Chrome extension ID: "
)

:: Run installation script
python install.py --extension-id "%EXTENSION_ID%"

pause
