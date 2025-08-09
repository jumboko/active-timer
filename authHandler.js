// ================================
// Firebase 認証管理 + UI更新処理
// ================================
//authHandler.js

import {
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithPopup,
  signOut 
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { auth } from './firebaseCore.js';
import { getQueryData, addQueryData } from './dbUtils.js';
import { mergeCheck } from './dataMerge.js';

// Googleプロバイダオブジェクトのインスタンス作成
const provider = new GoogleAuthProvider();

// -----------------------------
// 匿名ログイン後の認証状態を監視して、main.js に通知する（初回画面表示含む）
// -----------------------------
onAuthStateChanged(auth, async (user) => {
  console.log("onAuthStateChanged 認証変更キャッチ", user);
  // 画面表示の更新
  await updateUIForUser(user);
  // オーバーレイ解除 ※画面オーバーレイ表示は初期表示時とログアウト時、ログイン後解除
  document.getElementById("overlay").style.display = "none";
});

// -----------------------------
// 認証状態に応じて画面表示の更新
// -----------------------------
async function updateUIForUser(user) {
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

    try {
      // 匿名でログイン処理を実行
      await signInAnonymously(auth);
      console.log("✅ 匿名ログイン成功"); // 匿名認証成功後、uid変更でonAuthStateChanged再発火、その後.thenに結果が返るためログ順が変わる
    } catch (error) {
      console.error("❌ 匿名ログイン失敗:", error);
      alert("ログインに失敗しました。時間をおいて再度アクセスしてください。");
    }
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

   // ポップアップ時に画面オーバーレイ
  const overlay = document.getElementById("overlay");
  overlay.style.display = "block";
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
          let wasAnonDataFlg = false; // 匿名ユーザでデータ有の場合はtureになるflg
          let anonActivities = [], anonRecords = [];
          // 匿名アカウントの場合は、googleに再ログイン後データマージのためデータ取得  ※匿名ログイン以外はアカウント切り替えでマージは不要
          if (auth.currentUser && auth.currentUser.isAnonymous) {
            const anonUid = auth.currentUser.uid;
            anonActivities = await getQueryData("activities", { userId: anonUid });
            anonRecords = await getQueryData("records", { userId: anonUid });

            // 匿名データが存在するか確認????????????????????????????????????????????????activityがないならrecordもないロジックでは？
            wasAnonDataFlg = anonActivities.length > 0 || anonRecords.length > 0 ;

            // 匿名ユーザ、データは削除予約する  ??????????????????????????????????????google再ログインに失敗した場合は削除予約取り消しが必要
		        await reserveDelUser(anonUid);
		        console.log("🕒 匿名ユーザーデータを削除予約に登録しました");
          }

          const result = await signInWithCredential(auth, credential); //googleアカウントUIDに切り替え
          console.log("✅ Google再ログイン成功:", result.user);// 再ログイン成功後、uid変更でonAuthStateChanged再発火、その後結果が返るためログ順が変わる

          // マージで失敗した場合、ログイン済みだったらどうする？ログアウトしても匿名データは戻らないよね。？？？？？？？？？？？？？？？？


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
    overlay.style.display = "none"; // オーバーレイ解除
  }
}

// -----------------------------
// 匿名ユーザーの削除予約を deleteQueue に登録する。
// 実際の削除は後日バッチ処理などで行う。
/** ----------------------------
 * @param {string} anonUid - 匿名ユーザーのUID
 */
export async function reserveDelUser(anonUid) {
  try {
    await addQueryData("reserveDeleteUser", {
      userId: anonUid,
      date: new Date().toLocaleString(), // 現在時刻（タイムスタンプ）
      status: "delete"      // 状態管理フラグ（任意）
    });
    console.log(`🕒 匿名UID (${anonUid}) の削除予約を登録しました`);
  } catch (err) {
    console.error("❌ 匿名UIDの削除予約登録に失敗:", err);
    throw err;
  }
}

// -----------------------------
// ログアウト
// -----------------------------
export async function logout() {
  document.getElementById("overlay").style.display = "block"; // 画面オーバーレイ表示
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