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
  signInWithCredential,
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

// -----------------------------
// 匿名ログイン後の認証状態を監視して、main.js に通知する（初回画面表示含む）
// -----------------------------
onAuthStateChanged(auth, (user) => {
console.log("onAuthStateChanged 認証変更キャッチ", user);
  updateUIForUser(user);
});

// -----------------------------
// 認証状態に応じて画面表示の更新
// -----------------------------
function updateUIForUser(user) {
  if (user) {
    console.log("UID取得:", user.uid);

    if (user.isAnonymous) {
      // 匿名ユーザーは未ログイン扱い（ログインボタンだけ表示）
      setAuthBtn(user, false);

    } else {
      // Googleログイン等の場合はログイン状態として表示
      setAuthBtn(user, true);
    }
    // 初期化のためカスタムイベントを dispatch（main.js）※userがnullの場合、匿名ログイン処理の後画面が初期化
    window.dispatchEvent(new Event("auth-ready"));
  } else {
    console.log("ログアウトまたは初回アクセスでuidがnull");
    // 未ログイン（ログインボタンだけ表示）
    setAuthBtn(user, false);

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
  showPage("homePage"); // ログインまたはログアウト後はホーム画面に戻る
}

// -----------------------------
// ヘッダーボタン表示制御
// -----------------------------
function setAuthBtn(user, loginFlg) {
  const loginBtn = document.querySelector("#authStatus button[onclick='loginWithGoogle()']");
  const logoutBtn = document.querySelector("#authStatus button[onclick='logout()']");
  const userInfo = document.getElementById("userInfo");
  const emailSpan = document.querySelector('.emailText');
  const tooltipSpan = document.querySelector('.tooltip');

  // ログイン済の場合
  if (loginFlg) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    userInfo.style.display = "inline-block";
    // ユーザ情報表示
    const userEmail = user.email || "不明なユーザー";
    emailSpan.textContent = userEmail;
    tooltipSpan.textContent = userEmail;

  // 未ログインの場合
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userInfo.style.display = "none";
    emailSpan.textContent = "";
    tooltipSpan.textContent = "";
  }
}

// -----------------------------
// Googleログイン（ポップアップ）
// -----------------------------
export async function loginWithGoogle() {
  if (!auth.currentUser) {
    alert("ユーザー情報の取得に失敗しました。もう一度お試しください。");
    return;
  }
  // Googleプロバイダオブジェクトのインスタンス作成
  const provider = new GoogleAuthProvider();

  document.getElementById("overlay").style.display = "block"; // ← ポップアップ時に画面オーバーレイ
  try {
    const result = await linkWithPopup(auth.currentUser, provider); // 現UIDをgoogleアカウントUIDに昇格させる
    console.log("✅ 匿名→Googleに昇格成功:", result.user);
    // 手動でUI更新
    updateUIForUser(result.user);
  } catch (error) {
    // すでにGoogleアカウントで作られていた場合は signInWithPopup でUIDを切り替える
    if (error.code === 'auth/credential-already-in-use') {
      console.warn("⚠️ 既にそのGoogleアカウントは使われています。通常のログインに切り替えます。");

      //エラー内容からGoogle資格情報を取得
      const credential = GoogleAuthProvider.credentialFromError(error);
      if (credential) {
        try {
          let wasAnonDataFlg = false; // 匿名ユーザでデータ有の場合はtureになる
          let anonActivities = [], anonRecords = [];
          // 匿名アカウントの場合は、googleに再ログイン後データマージのためデータ取得  ※匿名ログイン以外はアカウント切り替えでマージは不要
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

          const result = await signInWithCredential(auth, credential); //googleアカウントUIDに切り替え
          console.log("✅ Google再ログイン成功:", result.user);// 再ログイン成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる

          // マージで失敗した場合、ログイン済みだったらどうする？ログアウトしても匿名データは戻らないよね。？？？？？？？？？？？？？？？？
          // エクスポート機能でリスクヘッジ


		      // 🔽 匿名ユーザーでデータ保持の場合、マージの意思確認を行いマージ処理を実施
		      if (wasAnonDataFlg) {
            mergeCheck(anonActivities, anonRecords, "google");
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

// -----------------------------
// インポートまたは匿名→Google昇格時のデータマージ確認処理
// - 活動名の重複確認・分離対応
// - 完了後は auth-ready イベントを発火して UI を再初期化
/** ----------------------------
 * @param {Array} inputActivities - マージ対象のアクティビティ一覧
 * @param {Array} inputRecords - マージ対象の記録一覧
 * @param {string} mode - "google"（昇格）または "import"（インポート）
 * @returns {boolean} - マージが行われたかどうか（キャンセル時は false）
 */
export async function mergeCheck(inputActivities, inputRecords, mode ) {
  try {
    // 呼び出し元に応じてメッセージ変更
    let message = "";
    if (mode === "google") {
      message = "匿名ユーザーの活動記録があります。\nGoogleアカウントに引き継ぎますか？\n\nキャンセルすると匿名データは削除されます。";
    } else if (mode === "import") {
      message = "現在のアカウントにインポートします。\n\nキャンセルするとインポートは中止されます。";
    }
    
    // メッセージポップアップでユーザがマージをキャンセルした場合
    const doMerge = confirm(message); 
    if (!doMerge) {
      console.log("🛑 ユーザーがマージをキャンセルしました");
      return false; // インポート時のアラート設定のため
    }

    // 現行ユーザの活動データ一覧を取得
    const currentActivities = await getQueryData("activities", { userId: auth.currentUser.uid });
    // 現行ユーザのアクティビティ名一覧を取得（重複チェック用）
    const currentActNames = currentActivities.map(act => act.actName);

    // inputユーザと現行ユーザで重複している活動名の一覧を取得
    let dupActNames = inputActivities.map(act => act.actName).filter(name => currentActNames.includes(name));
    // 重複がある場合
    if (dupActNames.length > 0) {
      const sepFlg = !confirm(
        "活動名が重複している可能性があります。\n統合して保存しますか？\n\nキャンセルすると活動を分けて保存します。"
      );
      // 分けて保存する場合、重複活動名リストは空にする（すべて登録対象にする）
      if (sepFlg) {dupActNames = [];}
    }
    //マージ処理
    await mergeUserData(inputActivities, inputRecords, currentActNames, dupActNames);
    console.log("✅ 匿名データをGoogleアカウントにマージしました");
    
    // 初期化のためカスタムイベントを dispatch（main.js がこれを待つ）
    window.dispatchEvent(new Event("auth-ready"));
    return true; // インポート時のアラート設定のため

  } catch (error) {
    console.error("❌ データマージに失敗:", error);
    alert("データマージに失敗しました。");
    return false; // インポート時のアラート設定のため
  }
}

// -----------------------------
// ログアウト
// -----------------------------
export async function logout() {
  try {
    await signOut(auth);
    console.log("🚪 ログアウト成功");// ログアウト成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる
  } catch (error) {
    console.error("❌ ログアウト失敗:", error);
    alert("ログアウトに失敗しました");
  }
}

// -----------------------------
// HTMLから使うためにグローバル登録
// -----------------------------
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;