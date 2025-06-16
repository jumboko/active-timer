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
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential ,
  linkWithPopup,
  signOut 
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

// Firebase 初期化、グローバル変数として渡す  ??????????????????????????????????????????????????????????????
const app = initializeApp(firebaseConfig);
window.db = getFirestore(app);
window.auth = getAuth(app);

// 匿名ログイン後の認証状態を監視して、main.js に通知する（初回画面表示含む）
onAuthStateChanged(auth, (user) => {
console.log("onAuthStateChanged 認証変更キャッチ", user);
  updateUIForUser(user);
});

// 認証状態に応じて画面表示の更新
function updateUIForUser(user) {
  const loginBtn = document.querySelector("#authStatus button[onclick='loginWithGoogle()']");
  const logoutBtn = document.querySelector("#authStatus button[onclick='logout()']");
  const userInfo = document.getElementById("userInfo");

  if (user) {
    console.log("UID取得:", user.uid);

    const isAnonymous = user.isAnonymous;
    if (isAnonymous) {
      // 匿名ユーザーは未ログイン扱い（ログインボタンだけ表示）
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      userInfo.style.display = "none";
      userInfo.textContent = "";
    } else {
      // Googleログインなどの場合はログイン状態として表示
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      userInfo.style.display = "inline-block";
      userInfo.textContent = `ログイン中: ${user.email || "不明なユーザー"}`;
    }
    // 認証完了を知らせるカスタムイベントを dispatch（main.js がこれを待つ）
    window.dispatchEvent(new Event("auth-ready"));
  } else {
    console.log("ログアウトまたは初回アクセスでuidがnull");
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userInfo.style.display = "none";
    userInfo.textContent = "";
    // 匿名でログイン処理を実行
    signInAnonymously(auth)
      .then(() => {
        console.log("✅ 匿名ログイン成功"); // 匿名認証成功後、uid変更でonAuthStateChanged再発火、その後.thenに結果が返るためログ順が変わる
      })
      .catch((error) => {
        console.error("❌ 匿名ログイン失敗:", error);
        alert("ログインに失敗しました。時間をおいて再度アクセスしてください。");
      });
  }
}

// Googleログイン（ポップアップ）
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();

  if (!auth.currentUser) {
    alert("ユーザー情報の取得に失敗しました。もう一度お試しください。");
    return;
  }

  document.getElementById("overlay").style.display = "block"; // ← ポップアップ時に画面オーバーレイ
  try {
    const result = await linkWithPopup(auth.currentUser, provider);
    console.log("✅ 匿名→Googleに昇格成功:", result.user);
    // 手動でUI更新
    updateUIForUser(result.user);
  } catch (error) {
    // すでにGoogleアカウントで作られていた場合は signInWithPopup を使う
    if (error.code === 'auth/credential-already-in-use') {
      console.warn("⚠️ 既にそのGoogleアカウントは使われています。通常のログインに切り替えます。");

      //エラー内容からGoogle 資格情報を取得
      const credential = GoogleAuthProvider.credentialFromError(error);
      if (credential) {
        try {
          const result = await signInWithCredential(auth, credential);
          console.log("✅ Google再ログイン成功:", result.user);// 再ログイン成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる
        } catch (err) {
          console.error("❌ Google再ログイン 失敗:", err);
          alert("Googleログインに失敗しました。");
        }
      } else {
        console.error("❌ Googleの資格情報の取得に失敗しました");
        alert("Googleログインに失敗しました。");
      }
    } else {
      console.error("❌ Googleログイン失敗:", error);
      alert("Googleログインに失敗しました。");
    }
  } finally {
    document.getElementById("overlay").style.display = "none"; // ← オーバーレイ解除
  }
}

// ログアウト
export async function logout() {
  try {
    await signOut(auth);
    console.log("🚪 ログアウト成功");// ログアウト成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる
  } catch (error) {
    console.error("❌ ログアウト失敗:", error);
    alert("ログアウトに失敗しました");
  }
}

// HTMLから使うためにグローバル登録
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;