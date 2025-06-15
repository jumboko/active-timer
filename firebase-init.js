// ================================
// firebase初期ロード、DB、認証
// ================================

// firebase-init.js

// Firebase SDKの読み込み
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";

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
const db = getFirestore(app);
const auth = getAuth(app);

// 他のJSファイルで使えるようにグローバル変数として渡す
window.firebaseDB = db;
window.firebaseAuth = auth;

// 匿名ログイン後の認証状態を監視して、main.js に通知する
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("🔓 認証完了（UID）:", user.uid);
    // 認証完了を知らせるカスタムイベントを dispatch（main.js がこれを待つ）
    window.dispatchEvent(new Event("auth-ready"));
  } else {
    // 匿名でログイン処理を実行
    signInAnonymously(auth)
      .then(() => {
        console.log("✅ 匿名ログイン成功");
      })
      .catch((error) => {
        console.error("❌ 匿名ログイン失敗:", error);
        alert("ログインに失敗しました。時間をおいて再度アクセスしてください。");
      });
  }
});
