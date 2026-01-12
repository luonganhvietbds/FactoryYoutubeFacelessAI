/**
 * Migration Script: Create User Documents for Existing Firebase Auth Users
 *
 * This script creates Firestore user documents for existing Firebase Auth users
 * who don't have documents in the 'users' collection yet.
 *
 * Usage:
 *   1. Set up Firebase Admin SDK credentials
 *   2. Run: node scripts/migrate-existing-users.js
 *
 * Prerequisites:
 *   - Firebase Admin SDK installed: npm install firebase-admin
 *   - Service account key file (download from Firebase Console)
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// ========== CONFIGURATION ==========

// Path to your service account key file (download from Firebase Console)
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service-account.json';

// Default permissions for migrated users
const DEFAULT_MEMBER_PERMISSIONS = {
    allowedPackIds: ['*'],      // Grant access to all packs by default for migration
    batchModeEnabled: true,      // Enable batch mode by default for migration
    maxConcurrent: 3,            // Max 3 concurrent jobs
};

const DEFAULT_ADMIN_PERMISSIONS = {
    allowedPackIds: ['*'],
    batchModeEnabled: true,
    maxConcurrent: 5,
};

// ========== INITIALIZATION ==========

let serviceAccount;
if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} else {
    console.error('❌ Service account file not found!');
    console.log('Please either:');
    console.log('  1. Place your service-account.json file in the project root, or');
    console.log('  2. Set SERVICE_ACCOUNT_PATH environment variable');
    console.log('   3. Download from Firebase Console: Project Settings > Service Accounts > Generate New Private Key');
    process.exit(1);
}

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

// ========== MIGRATION FUNCTIONS ==========

async function listAllUsers(pageToken) {
    const result = await auth.listUsers(1000, pageToken);
    return result;
}

async function migrateUser(user) {
    const userRef = db.collection('users').doc(user.uid);

    // Check if user document already exists
    const doc = await userRef.get();
    if (doc.exists) {
        console.log(`  ⏭️  Skipping ${user.email} - document already exists`);
        return { status: 'skipped', email: user.email };
    }

    // Determine role and permissions
    // Check if this is the default admin account
    const isDefaultAdmin = user.email === 'admin@system.local' ||
                          user.uid === 'admin_default' ||
                          user.email === process.env.DEFAULT_ADMIN_EMAIL;

    const role = isDefaultAdmin ? 'admin' : 'member';
    const permissions = isDefaultAdmin ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_MEMBER_PERMISSIONS;

    // Create user document
    const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        role: role,
        credits: isDefaultAdmin ? 9999 : 100,
        permissions: permissions,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        migratedAt: new Date().toISOString(),  // Mark as migrated
        metadata: {
            emailVerified: user.emailVerified,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
        }
    };

    await userRef.set(userData);

    const status = isDefaultAdmin ? 'admin' : 'member';
    console.log(`  ✅ Migrated ${user.email} as ${status}`);

    return { status, email: user.email, role };
}

async function migrateAllUsers() {
    console.log('🚀 Starting User Migration...\n');
    console.log(`📋 Service Account: ${serviceAccount.project_id}`);
    console.log('');

    let pageToken = null;
    let totalUsers = 0;
    let migrated = 0;
    let skipped = 0;
    let admins = 0;
    let members = 0;
    const results = [];

    do {
        const result = await listAllUsers(pageToken);
        const users = result.users;

        console.log(`📦 Processing batch of ${users.length} users...`);

        for (const user of users) {
            totalUsers++;

            try {
                const result = await migrateUser(user);

                if (result.status === 'skipped') {
                    skipped++;
                } else {
                    migrated++;
                    if (result.role === 'admin') {
                        admins++;
                    } else {
                        members++;
                    }
                }

                results.push({
                    uid: user.uid,
                    email: user.email,
                    ...result
                });
            } catch (error) {
                console.error(`  ❌ Error migrating ${user.email}:`, error.message);
                results.push({
                    uid: user.uid,
                    email: user.email,
                    status: 'error',
                    error: error.message
                });
            }
        }

        pageToken = result.pageToken;
    } while (pageToken);

    // ========== SUMMARY ==========

    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Firebase Auth Users:  ${totalUsers}`);
    console.log(`Migrated to Firestore:       ${migrated}`);
    console.log(`Already existed (skipped):   ${skipped}`);
    console.log(`  - Admins:                   ${admins}`);
    console.log(`  - Members:                  ${members}`);
    console.log(`Errors:                      ${totalUsers - migrated - skipped}`);
    console.log('='.repeat(60));

    // ========== CREATE DEFAULT ADMIN ==========

    console.log('\n👑 Checking for default admin...');

    const defaultAdminUid = process.env.DEFAULT_ADMIN_UID || 'admin_default';
    const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@system.local';

    try {
        const adminRef = db.collection('users').doc(defaultAdminUid);
        const adminDoc = await adminRef.get();

        if (!adminDoc.exists) {
            console.log('  Creating default admin document...');

            // First, try to get the user from Auth
            try {
                const adminUser = await auth.getUser(defaultAdminUid);

                await adminRef.set({
                    uid: defaultAdminUid,
                    email: adminUser.email || defaultAdminEmail,
                    displayName: 'System Administrator',
                    role: 'admin',
                    credits: 9999,
                    permissions: DEFAULT_ADMIN_PERMISSIONS,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    migratedAt: new Date().toISOString(),
                    isDefaultAdmin: true
                });

                console.log(`  ✅ Created default admin: ${defaultAdminEmail} (UID: ${defaultAdminUid})`);
            } catch (error) {
                // User doesn't exist in Auth, create document anyway
                await adminRef.set({
                    uid: defaultAdminUid,
                    email: defaultAdminEmail,
                    displayName: 'System Administrator',
                    role: 'admin',
                    credits: 9999,
                    permissions: DEFAULT_ADMIN_PERMISSIONS,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isDefaultAdmin: true,
                    note: 'Created manually - no corresponding Firebase Auth user'
                });

                console.log(`  ⚠️  Created default admin document (no Auth user): ${defaultAdminEmail}`);
            }
        } else {
            console.log(`  ⏭️  Default admin document already exists`);
        }
    } catch (error) {
        console.error(`  ❌ Error creating default admin:`, error.message);
    }

    // ========== SAVE REPORT ==========

    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            totalUsers,
            migrated,
            skipped,
            admins,
            members,
            errors: totalUsers - migrated - skipped
        },
        results
    };

    const reportPath = './migration-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Migration report saved to: ${reportPath}`);

    console.log('\n✅ Migration complete!');

    return report;
}

// ========== RUN MIGRATION ==========

migrateAllUsers()
    .then(() => {
        console.log('\n🎉 All done! You can now deploy your application.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration failed:', error);
        process.exit(1);
    });
