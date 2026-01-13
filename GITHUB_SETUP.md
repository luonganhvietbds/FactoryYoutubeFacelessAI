# GitHub + Vercel Setup Guide for AI Script Factory

## Installed Tools

### Git
- **Version:** 2.47.1.windows.2
- **Location:** `C:\Program Files\Git\bin\git.exe`
- **Status:** ✅ Installed & Configured

### GitHub CLI
- **Version:** 2.0.0
- **Location:** `C:\Tools\GitHubCLI\gh.exe`
- **Status:** ✅ Installed

---

## GitHub Configuration

### Quick Commands (Git)
```bash
cd C:\Users\ADMIN\Downloads\VIET\Tool\ Youtube\ 6\ bước\Tool\ Youtube\ 6\ bước\ai-script-factory

# Check status
git status

# Add and commit changes
git add .
git commit -m "Your message"
git push origin main

# Pull latest changes
git pull
```

### Repository Info
- **URL:** https://github.com/luonganhvietbds/Vi-t-k-ch-b-n-5-b-c.git
- **Branch:** main
- **Status:** ✅ Synced

---

## Vercel Deployment

### Files Created
- `vercel.json` - Vercel configuration
- `vercel-deploy.bat` - Windows deployment helper
- `vercel-deploy.ps1` - PowerShell deployment script

### Deployment Options

#### Option 1: GitHub Auto-Deploy (Recommended)
```bash
# Push code to GitHub - Vercel will auto-deploy
git add .
git commit -m "Your message"
git push origin main
```

#### Option 2: Vercel Dashboard Manual Deploy
1. Go to: https://vercel.com/dashboard
2. Select project "ai-script-factory"
3. Click **Redeploy**

#### Option 3: Using Deployment Scripts
```powershell
# Set token and trigger deployment
$env:VERCEL_TOKEN = "your_token_here"
.\vercel-deploy.ps1 -Trigger
```

### Vercel Setup Checklist

If deployment is not working:

1. **Link Project to GitHub**
   - Go to: https://vercel.com/dashboard
   - Click "Add New Project"
   - Import from: `luonganhvietbds/Vi-t-k-ch-b-n-5-b-c`

2. **Configure Git Settings**
   - Project Settings → Git
   - Deploy Branch: `main`
   - Enable "Automatic Git Deployments"

3. **Framework Settings**
   - Project Settings → Framework Preset
   - Select: **Next.js**

4. **Environment Variables**
   - Project Settings → Environment Variables
   - Add:
     - `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
     - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
     - Other Firebase config variables

### Dashboard Links
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Project Deployments:** https://vercel.com/luonganhvietbds/ai-script-factory/deployments
- **GitHub Repository:** https://github.com/luonganhvietbds/Vi-t-k-ch-b-n-5-b-c

---

## Troubleshooting

### Git Issues

**"gh not recognized"**
```bash
# Run with full path
C:\Tools\GitHubCLI\gh.exe auth status
```

**Authentication Issues**
```bash
# Re-authenticate
C:\Tools\GitHubCLI\gh.exe auth logout
C:\Tools\GitHubCLI\gh.exe auth login
```

### Vercel Issues

**Vercel not auto-deploying**
1. Check: Project Settings → Git → Deploy Branch = main
2. Check: GitHub repo is connected in Vercel
3. Check: vercel.json exists in project root

**Build failures**
- Check: https://vercel.com/luonganhvietbds/ai-script-factory/deployments
- Review build logs in Vercel dashboard

**Environment variables missing**
1. Go to Project Settings → Environment Variables
2. Add all Firebase config variables
3. Redeploy project

