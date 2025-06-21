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
import { getQueryData, mergeUserData, reserveDelUser } from './dataMerge.js';

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

    if (user.isAnonymous) {
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

      //エラー内容からGoogle資格情報を取得
      const credential = GoogleAuthProvider.credentialFromError(error);
      if (credential) {
        try {
          let wasAnonDataFlg = false; // 匿名ユーザでデータ有の場合はtureになる
          let anonActivities = [], anonRecords = [];
          // 匿名アカウントの場合は、googleに再ログイン後データマージのためデータ取得
          if (auth.currentUser && auth.currentUser.isAnonymous) {
            const anonUid = auth.currentUser.uid;
            anonActivities = await getQueryData("activities", { userId: anonUid });
            anonRecords = await getQueryData("records", { userId: anonUid });

            // 匿名データが存在するか確認
            wasAnonDataFlg = anonActivities.length > 0 || anonRecords.length > 0 ;

            // 匿名ユーザ、データは削除予約する  ??????????????????????????????????????google再ログインに失敗した場合は削除予約取り消しが必要
		        await reserveDelUser(anonUid);
		        console.log("🕒 匿名ユーザーデータを削除予約に登録しました");
          }

          const result = await signInWithCredential(auth, credential);
          console.log("✅ Google再ログイン成功:", result.user);// 再ログイン成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる

          // マージで失敗した場合、ログイン済みだったらどうする？ログアウトしても匿名データは戻らないよね。？？？？？？？？？？？？？？？？
          // エクスポート機能でリスクヘッジ


		      // 🔽 匿名ユーザーでデータ保持の場合、マージの意思確認を行う
		      if (wasAnonDataFlg) {
		        const doMerge = confirm(
		          "匿名ユーザーの活動記録があります。\nGoogleアカウントに引き継ぎますか？\n\nキャンセルすると匿名データは削除されます。"
		        );
           
            // マージする場合に活動名が重複した場合、活動を分けるか統合するかを確認
		        if (doMerge) {
              // googleユーザの活動データ一覧を取得
              const googleActivities = await getQueryData("activities", { userId: result.user.uid });
              // Googleアクティビティ名一覧を取得（重複チェック用）
              const googleActNames = googleActivities.map(act => act.name);

              // 匿名ユーザとgoogleユーザで重複している活動名の一覧を取得
              let dupActNames = anonActivities.map(act => act.name).filter(name => googleActNames.includes(name));
              // 重複がある場合
              if (dupActNames.length > 0) {
                const sepFlg = !confirm(
		              "活動名が重複している可能性があります。\n統合して保存しますか？\n\nキャンセルすると活動を分けて保存します。"
                );
                // 分けて保存する場合、重複活動名リストは空にする（すべて登録対象にする）
                if (sepFlg) {
                  dupActNames = [];
                }
              }
              //マージ処理
              await mergeUserData(anonActivities, anonRecords, googleActNames, dupActNames);
		          console.log("✅ 匿名データをGoogleアカウントにマージしました");
		        } else {
		          console.log("🛑 匿名データのマージをユーザーがキャンセルしました");
		        }
            
            // 初期化のためカスタムイベントを dispatch（main.js がこれを待つ）
            window.dispatchEvent(new Event("auth-ready"));
		      }

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