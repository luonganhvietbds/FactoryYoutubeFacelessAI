@echo off
REM Vercel Deployment Helper Script
REM Usage: vercel-deploy.bat [token] [project-id]

setlocal

echo ============================================
echo  Vercel Deployment Helper
echo ============================================
echo.

REM Check for Vercel token
set VERCEL_TOKEN=%1
if "%VERCEL_TOKEN%"=="" (
    echo [INFO] No token provided. Checking environment variable...
    set VERCEL_TOKEN=%VERCEL_TOKEN%
)

if "%VERCEL_TOKEN%"=="" (
    echo [ERROR] Vercel token not found!
    echo.
    echo Please provide your Vercel API token:
    echo 1. Go to: https://vercel.com/account/tokens
    echo 2. Create a new token with 'deployments:write' permission
    echo 3. Run: vercel-deploy.bat YOUR_TOKEN
    echo.
    echo Or set environment variable:
    echo   set VERCEL_TOKEN=your_token_here
    exit /b 1
)

echo [OK] Vercel token found
echo.

REM Get project ID (optional - can use project name instead)
set PROJECT_ID=%2
if "%PROJECT_ID%"=="" (
    echo [INFO] No project ID provided, using project name...
    set PROJECT_NAME=ai-script-factory
) else (
    set PROJECT_NAME=%PROJECT_ID%
)

echo [INFO] Project: %PROJECT_NAME%
echo.

REM Step 1: Get deployments for the project
echo [1/3] Fetching recent deployments...
curl -s -X GET "https://api.vercel.com/v6/deployments?projectName=%PROJECT_NAME%" ^
    -H "Authorization: Bearer %VERCEL_TOKEN%" ^
    -H "Content-Type: application/json" > deploy_check.json

findstr /c:"deployments" deploy_check.json >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Successfully connected to Vercel API
) else (
    echo [WARNING] Could not fetch deployments. Check token权限.
)

echo.
echo [2/3] Latest deployment status:
type deploy_check.json | findstr /i "ready error" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Previous deployment completed
) else (
    echo [INFO] No ready deployment found
)

echo.
echo [3/3] Creating new deployment (triggered by Git)...

REM Since we're using Git integration, just verify the setup
echo.
echo ============================================
echo  Deployment Info
echo ============================================
echo.
echo To trigger a new deployment:
echo 1. Push code to GitHub: git push origin main
echo 2. Vercel will automatically deploy
echo.
echo Or manually trigger via API:
echo curl -X POST "https://api.vercel.com/v13/deployments" ^
echo     -H "Authorization: Bearer %VERCEL_TOKEN%" ^
echo     -H "Content-Type: application/json" ^
echo     -d "{\"name\":\"%PROJECT_NAME%\",\"gitSource\":{\"type\":\"github\",\"repo\":\"luonganhvietbds/Vi-t-k-ch-b-n-5-b-c\",\"branch\":\"main\"}}"
echo.
echo Current deployments: https://vercel.com/luonganhvietbds/%PROJECT_NAME%/deployments
echo.

REM Cleanup
del deploy_check.json >nul 2>&1

endlocal
pause
