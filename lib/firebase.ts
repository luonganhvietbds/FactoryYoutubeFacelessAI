// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAxIa0d9vO6dzq1jNmsRhWKpqkVhZPYzSw",
    authDomain: "stylejsonscene.firebaseapp.com",
    databaseURL: "https://stylejsonscene-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "stylejsonscene",
    storageBucket: "stylejsonscene.firebasestorage.app",
    messagingSenderId: "443213265614",
    appId: "1:443213265614:web:764f04b0cf26a5f8666e9f",
    measurementId: "G-VJ85FPX95G"
};

// Initialize Firebase
// Use getApps() to prevent re-initialization error in Next.js hot-reload
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Services
const db = getFirestore(app);
const auth = getAuth(app);

// Analytics (Client-side only)
let analytics = null;
if (typeof window !== "undefined") {
    isSupported().then((yes) => {
        if (yes) {
            analytics = getAnalytics(app);
        }
    });
}

export { app, db, auth, analytics };
