# User Migration Script

## Purpose

This script creates Firestore user documents for existing Firebase Auth users who don't have documents in the `users` collection yet.

## Why This Is Needed

After implementing the Admin Authentication & User Permission System:
1. New users get documents created automatically during registration (via AuthContext)
2. **Existing users** who registered before the update **don't have documents**
3. This script migrates those existing users to have proper Firestore documents

## Prerequisites

### 1. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### 2. Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **stylejsonscene**
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Save the file as `service-account.json` in the project root

## Usage

### Basic Usage

```bash
# Set service account path (optional if file is named service-account.json)
export SERVICE_ACCOUNT_PATH=./service-account.json

# Run migration
node scripts/migrate-existing-users.js
```

### With Custom Default Admin

```bash
export DEFAULT_ADMIN_UID=admin_default
export DEFAULT_ADMIN_EMAIL=admin@system.local
node scripts/migrate-existing-users.js
```

## What It Does

1. **Lists all Firebase Auth users** (paginated, handles 1000+ users)
2. **Checks each user** for existing Firestore document
3. **Creates missing documents** with:
   - `uid`, `email`, `displayName`
   - `role`: 'member' (or 'admin' if default admin)
   - `credits`: 100 (9999 for admin)
   - `permissions`: Default member/admin permissions
   - `createdAt`, `migratedAt` timestamps
4. **Creates default admin** if not exists
5. **Generates report** in `migration-report.json`

## Output Example

```
🚀 Starting User Migration...

📋 Service Account: stylejsonscene

📦 Processing batch of 10 users...
  ✅ Migrated user1@example.com as member
  ⏭️  Skipping user2@example.com - document already exists
  ✅ Migrated admin@system.local as admin

...

📊 MIGRATION SUMMARY
============================================================
Total Firebase Auth Users:  10
Migrated to Firestore:       8
Already existed (skipped):   2
  - Admins:                   1
  - Members:                  7
Errors:                      0
============================================================

👑 Checking for default admin...
  ⏭️  Default admin document already exists

📄 Migration report saved to: ./migration-report.json

✅ Migration complete!
```

## Rollback (If Needed)

To remove migrated user documents:

```javascript
// In Firebase Console or using Admin SDK
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

// Delete all user documents (keep default admin)
const users = await db.collection('users').get();
for (const doc of users.docs) {
    if (doc.id !== 'admin_default') {
        await doc.ref.delete();
    }
}
```

## Important Notes

- **Safe to run multiple times** - Already migrated users are skipped
- **Idempotent** - Same result each time
- **No data loss** - Only creates new documents, never overwrites
- **Default admin** is protected and always preserved

## After Migration

1. ✅ All existing users now have Firestore documents
2. ✅ Default admin has full access
3. ✅ Regular members can use the app
4. ✅ Admin can manage permissions via User Management panel

## Troubleshooting

### "Service account file not found"

Make sure `service-account.json` is in the project root, or set:
```bash
export SERVICE_ACCOUNT_PATH=/path/to/your/service-account.json
```

### Permission denied errors

Ensure your service account has these permissions:
- `firebaseauth.users.get`
- `firebaseauth.users.list`
- `firestore.users.create`
- `firestore.users.get`
- `firestore.users.list`
