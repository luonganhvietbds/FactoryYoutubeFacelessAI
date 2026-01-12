# Firebase Console Setup Guide

## 🚀 Quick Setup Steps

### 1. Access Firebase Console

1. Go to: https://console.firebase.google.com/
2. Sign in with Google account
3. Select project: **stylejsonscene**

---

### 2. Authentication Setup

#### Enable Sign-in Methods

1. **Authentication** → **Sign-in method**
2. Enable these providers:

| Provider | Status | Notes |
|----------|--------|-------|
| Email/Password | ✅ Enabled | Required for login/register |
| Email Link (Optional) | ⬜ Disabled | Can enable later |
| Google | ⬜ Disabled | Optional |
| Anonymous | ⬜ Disabled | Not needed |

3. **Important Settings:**
   - ✅ Email enumeration protection: **OFF** (for better error messages)

---

### 3. Email Templates Configuration

#### A. Password Reset Email

1. **Authentication** → **Templates** → **Password reset**
2. Customize:

```
Subject: Đặt lại mật khẩu - AI Script Factory

Body:
Xin chào,

Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản AI Script Factory.

Nhấp vào liên kết bên dưới để đặt lại mật khẩu:

{{code}}

Liên kết này sẽ hết hạn sau 24 giờ.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

AI Script Factory Team
```

3. **Settings:**
   - URL: `https://your-domain.com/login`
   - Handle code in app: ✅ ON

#### B. Email Verification

1. **Authentication** → **Templates** → **Email verification**
2. Customize:

```
Subject: Xác thực email - AI Script Factory

Body:
Xin chào,

Cảm ơn bạn đã đăng ký AI Script Factory!

Nhấp vào liên kết bên dưới để xác thực email:

{{code}}

Sau khi xác thực, bạn có thể đăng nhập và sử dụng đầy đủ tính năng.

AI Script Factory Team
```

3. **Settings:**
   - URL: `https://your-domain.com/login`
   - Handle code in app: ✅ ON

---

### 4. Authorized Domains

1. **Authentication** → **Settings**
2. **Authorized domains** section:
   - Add: `localhost` (for development)
   - Add: `your-production-domain.com`
   - Add: `your-domain.vercel.app` (if using Vercel)
   - Add: `*.cloudflareapps.com` (if using Cloudflare)

---

### 5. Firestore Database Setup

1. **Firestore Database** → **Create database**
2. Choose location: **asia-southeast1** (Singapore - closest to Vietnam)
3. Start in **Production mode**
4. Security rules (for development):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Note:** Secure with proper rules before production!

---

### 6. Firebase Storage Setup

1. **Storage** → **Get started**
2. Choose location: **asia-southeast1**
3. Rules (for development):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

**Note:** Secure with proper rules before production!

---

### 7. Project Settings

#### General Info

1. **Project Settings** → **General**
2. Your web app: `1:443213265614:web:764f04b0cf26a5f8666e9f`
3. SDK setup info (already configured):

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAxIa0d9vO6dzq1jNmsRhWKpqkVhZPYzSw",
  authDomain: "stylejsonscene.firebaseapp.com",
  projectId: "stylejsonscene",
  storageBucket: "stylejsonscene.firebasestorage.app",
  messagingSenderId: "443213265614",
  appId: "1:443213265614:web:764f04b0cf26a5f8666e9f"
};
```

---

### 8. Environment Variables (Recommended)

Create `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAxIa0d9vO6dzq1jNmsRhWKpqkVhZPYzSw
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=stylejsonscene.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=stylejsonscene
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=stylejsonscene.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=443213265614
NEXT_PUBLIC_FIREBASE_APP_ID=1:443213265614:web:764f04b0cf26a5f8666e9f
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-VJ85FPX95G
```

---

### 9. Google Analytics (Optional)

1. **Analytics** → **Dashboard**
2. If not enabled, click **Enable Analytics**
3. Configure for your needs

---

### 10. Deploy to Vercel (If using)

1. **Project Settings** → **Domains**
2. Add your Vercel domain
3. Go back to Firebase Console
4. Add domain to **Authorized domains**

---

## 🔒 Security Checklist Before Production

### Authentication Rules
- [ ] Email enumeration protection: OFF (for dev) → ON (for prod)
- [ ] Set up reCAPTCHA Enterprise (optional but recommended)
- [ ] Configure MFA (Multi-Factor Authentication)

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // Public data
    match /public/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 📋 Configuration Summary

| Service | Status | Location |
|---------|--------|----------|
| Authentication | ✅ Ready | asia-southeast1 |
| Firestore | ✅ Ready | asia-southeast1 |
| Storage | ✅ Ready | asia-southeast1 |
| Analytics | ⚠️ Optional | - |

---

## 🧪 Testing Checklist

- [ ] Test user registration
- [ ] Verify email received
- [ ] Test email verification flow
- [ ] Test login with verified email
- [ ] Test password reset
- [ ] Test logout
- [ ] Test protected routes
- [ ] Test on mobile devices

---

## ❓ Troubleshooting

### "Email already in use"
- Check if user already exists
- Try login instead

### "No verification email received"
- Check spam folder
- Check email address correctness
- Resend verification email

### "User not found"
- Check email spelling
- User may have been deleted

### "Network error"
- Check internet connection
- Check Firebase status page

---

## 📞 Support

- Firebase Docs: https://firebase.google.com/docs
- Auth Docs: https://firebase.google.com/docs/auth
- Support: https://firebase.google.com/support
