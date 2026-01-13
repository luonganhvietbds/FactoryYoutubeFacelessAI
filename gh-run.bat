@echo off
REM GitHub CLI Helper Script
REM Save this file as gh-run.bat in your project folder

echo GitHub CLI v2.0.0
echo ====================

if "%1"=="status" (
    C:\Tools\GitHubCLI\gh.exe auth status
) else if "%1"=="login" (
    echo Opening GitHub login in browser...
    C:\Tools\GitHubCLI\gh.exe auth login
) else if "%1"=="push" (
    C:\Tools\GitHubCLI\gh.exe repo sync
) else if "%1"=="pr" (
    C:\Tools\GitHubCLI\gh.exe pr status
) else if "%1"=="repo" (
    C:\Tools\GitHubCLI\gh.exe repo view --web
) else (
    echo Available commands:
    echo   gh-run status   - Check authentication status
    echo   gh-run login    - Login to GitHub
    echo   gh-run push     - Sync/push repository
    echo   gh-run pr       - View pull requests
    echo   gh-run repo     - Open repository in browser
    echo.
    C:\Tools\GitHubCLI\gh.exe --help
)
