# GitHub Setup Guide for AI Script Factory

## Installed Tools

### Git
- **Version:** 2.47.1.windows.2
- **Location:** `C:\Program Files\Git\bin\git.exe`
- **Status:** ✅ Installed & Configured

### GitHub CLI
- **Version:** 2.0.0
- **Location:** `C:\Tools\GitHubCLI\gh.exe`
- **Status:** ✅ Installed

## Quick Commands

### Using Git (Command Line)
```bash
# Navigate to project
cd C:\Users\ADMIN\Downloads\VIET\Tool\ Youtube\ 6\ bước\Tool\ Youtube\ 6\ bước\ai-script-factory

# Check status
git status

# Add changes
git add .
git commit -m "Your message"
git push origin main

# Pull latest changes
git pull
```

### Using GitHub CLI
```bash
# Check authentication
gh auth status

# Login (interactive)
gh auth login

# View repository in browser
gh repo view --web

# Sync repository
gh repo sync

# Create pull request
gh pr create
```

## Authentication

### Option 1: GitHub CLI Login
1. Run: `C:\Tools\GitHubCLI\gh.exe auth login`
2. Choose "Login with web browser"
3. Copy the one-time code
4. Press Enter to open browser
5. Paste code and authorize

### Option 2: GitHub Token (Non-interactive)
1. Create token at: https://github.com/settings/tokens
2. Permissions needed: `repo`, `workflow`
3. Run: `gh auth login --with-token <your-token>`

### Option 3: Git Credential Manager
Git is configured to use Credential Manager automatically.
- First push will prompt for GitHub login
- Credentials saved in Windows Credential Manager

## Repository Info
- **URL:** https://github.com/luonganhvietbds/Vi-t-k-ch-b-n-5-b-c.git
- **Branch:** main
- **Status:** Clean (no uncommitted changes)

## Workflow for Updates

### Daily Development
```bash
# Before starting work
git pull

# After making changes
git add .
git commit -m "Description of changes"
git push
```

### Using Batch Helper
```bash
# Run the helper script
gh-run status  # Check auth status
gh-run push    # Sync to GitHub
gh-run repo    # Open in browser
```

## Troubleshooting

### "gh not recognized"
- Run with full path: `C:\Tools\GitHubCLI\gh.exe`
- Or restart Command Prompt/PowerShell

### Authentication Issues
```bash
# Re-authenticate
C:\Tools\GitHubCLI\gh.exe auth logout
C:\Tools\GitHubCLI\gh.exe auth login
```

### Git Permission Denied
```bash
# Check remote URL
git remote -v

# Update credentials
git credential-manager erase
# Then push again to re-authenticate
```
