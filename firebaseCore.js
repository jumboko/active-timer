// ================================
// firebase初期ロード
// ================================
// firebaseCore.js

// Firebase SDKの読み込み
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";

// Firebaseの設定
const firebaseConfig = {
  apiKey: "AIzaSyDpG7dqCaUB8A9jd-EfdVbemN8HVOsUjSM",
  authDomain: "activity-timer-52a85.firebaseapp.com",
  projectId: "activity-timer-52a85",
  storageBucket: "activity-timer-52a85.appspot.com", // ← 修正
  messagingSenderId: "68281906785",
  appId: "1:68281906785:web:4508221d36146eb9475c20"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);

// DB・認証を初期化してエクスポート
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };