#!/usr/bin/env pwsh
#
# Vercel Deployment Script (PowerShell)
# Usage: .\vercel-deploy.ps1 [-Token <string>] [-ProjectId <string>] [-Trigger]
#

param(
    [string]$Token,
    [string]$ProjectId,
    [switch]$Trigger
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Vercel Deployment Helper" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for token
if ([string]::IsNullOrEmpty($Token)) {
    $Token = $env:VERCEL_TOKEN
}

if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "[ERROR] Vercel token not provided!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please provide your Vercel API token:"
    Write-Host "  1. Go to: https://vercel.com/account/tokens"
    Write-Host "  2. Create a new token with 'deployments:read' and 'deployments:write' permissions"
    Write-Host "  3. Run: .\vercel-deploy.ps1 -Token YOUR_TOKEN"
    Write-Host ""
    Write-Host "Or set environment variable:"
    Write-Host "  \$env:VERCEL_TOKEN = 'your_token_here'"
    exit 1
}

Write-Host "[OK] Vercel token found" -ForegroundColor Green
Write-Host ""

# Project configuration
$ProjectName = if ([string]::IsNullOrEmpty($ProjectId)) { "ai-script-factory" } else { $ProjectId }
$RepoOwner = "luonganhvietbds"
$RepoName = "Vi-t-k-ch-b-n-5-b-c"
$Branch = "main"

Write-Host "[INFO] Project: $ProjectName" -ForegroundColor Yellow
Write-Host "[INFO] Repository: $RepoOwner/$RepoName" -ForegroundColor Yellow
Write-Host "[INFO] Branch: $Branch" -ForegroundColor Yellow
Write-Host ""

# API Base URL
$ApiBase = "https://api.vercel.com"

function Invoke-VercelApi {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    
    $params = @{
        Uri = "$ApiBase$Endpoint"
        Method = $Method
        Headers = $headers
    }
    
    if ($Body) {
        $params.Body = $Body | ConvertTo-Json -Depth 10
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Host "[ERROR] API call failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Get recent deployments
Write-Host "[1/3] Fetching recent deployments..." -ForegroundColor Cyan
$deployments = Invoke-VercelApi -Endpoint "/v6/deployments?projectName=$ProjectName&limit=5"

if ($deployments -and $deployments.deployments) {
    Write-Host "[OK] Found $($deployments.deployments.Length) recent deployments" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "Recent Deployments:" -ForegroundColor Yellow
    foreach ($d in $deployments.deployments) {
        $status = if ($d.readyState -eq "READY") { "✅" } elseif ($d.readyState -eq "ERROR") { "❌" } else { "⏳" }
        $created = [DateTime]::Parse($d.createdAt).ToLocalTime().ToString("yyyy-MM-dd HH:mm")
        Write-Host "  $status $($d.uid.Substring(0,7)) - $created - $($d.meta?.githubCommitMessage ?: 'N/A')" -ForegroundColor White
    }
} else {
    Write-Host "[INFO] No deployments found or could not fetch" -ForegroundColor Yellow
}

Write-Host ""

# Trigger new deployment if requested
if ($Trigger -or $true) {
    Write-Host "[2/3] Deployment Options:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Trigger via GitHub (Recommended)" -ForegroundColor White
    Write-Host "     - Push code to GitHub: git push origin main" -ForegroundColor Gray
    Write-Host "     - Vercel will auto-deploy" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Trigger via API (Manual)" -ForegroundColor White
    Write-Host "     - Run with -Trigger flag" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. View in Browser" -ForegroundColor White
    Write-Host "     - https://vercel.com/$RepoOwner/$ProjectName/deployments" -ForegroundColor Gray
    Write-Host ""
}

# Create deployment payload
Write-Host "[3/3] Deployment Info:" -ForegroundColor Cyan
Write-Host ""

$deployUrl = "https://vercel.com/$RepoOwner/$ProjectName/deployments"
Write-Host "Dashboard: $deployUrl" -ForegroundColor White
Write-Host ""

# Show GitHub link
$ghCommitUrl = "https://github.com/$RepoOwner/$RepoName/commit/$(git rev-parse HEAD 2>$null)"
Write-Host "Latest Commit: $ghCommitUrl" -ForegroundColor White
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  To trigger a new deployment:" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Option 1 - Push to GitHub:" -ForegroundColor White
Write-Host "    git add ." -ForegroundColor Gray
Write-Host "    git commit -m 'Your message'" -ForegroundColor Gray
Write-Host "    git push origin main" -ForegroundColor Gray
Write-Host ""
Write-Host "  Option 2 - Manual API Trigger:" -ForegroundColor White
Write-Host "    .\vercel-deploy.ps1 -Token YOUR_TOKEN -Trigger" -ForegroundColor Gray
Write-Host ""
Write-Host "  Option 3 - Vercel Dashboard:" -ForegroundColor White
Write-Host "    $deployUrl" -ForegroundColor Gray
Write-Host ""

# Try to trigger if -Trigger flag is set
if ($Trigger) {
    Write-Host "[TRIGGER] Creating new deployment..." -ForegroundColor Cyan
    
    $body = @{
        name = $ProjectName
        gitSource = @{
            type = "github"
            repo = "$RepoOwner/$RepoName"
            branch = $Branch
        }
        target = "production"
        project = $ProjectName
    }
    
    $result = Invoke-VercelApi -Endpoint "/v13/deployments" -Method "POST" -Body $body
    
    if ($result) {
        Write-Host "[OK] Deployment triggered successfully!" -ForegroundColor Green
        Write-Host "  Deployment ID: $($result.id)" -ForegroundColor White
        Write-Host "  URL: $($result.url)" -ForegroundColor White
    }
}

Write-Host ""
