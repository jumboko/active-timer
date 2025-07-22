// ================================
// 活動記録タイマー
// ================================
// main.js

// firebase-init.js を読み込む
import { mergeCheck } from "./firebase-init.js";
// Firestore 関連の操作関数を個別に import
import { getQueryData, addQueryData, deleteQueryData } from './dataMerge.js';

let currentPageId = "homePage"; // 現在表示されているページID
let currentActivity = null;     // 現在選択されている活動
let currentOrder = "asc";       // 現在選択されている活動の並び順
let startTime;                  // タイマーの開始時刻
let elapsedTime = 0;            // 経過時間（ms）
let timerInterval;              // リアルタイム表示用 setInterval の識別子
let wakeLock = null;            // Wake Lock スリープ防止用

// -----------------------------
// 認証状態に変更があった場合の初期化処理(firebase-init.jsから呼び出し)
// -----------------------------
window.addEventListener("auth-ready", async () => {
  await loadActivities(); // 活動一覧の読み込み
  updateTimerDisplay(0); // タイマー初期表示を0で統一（0h00m00s<small>00</small>）
  console.log("画面初期化");
});

// -----------------------------
// 画面状態が表示または非表示に変更された場合に動作
// -----------------------------
document.addEventListener("visibilitychange", () => {
  // 画面状態がvisible(画面再アクティブ)に変わり、startTimeがnullでない(タイマー動作中)場合
  if (document.visibilityState === "visible" && startTime) {
    disableWakeLock(); // 念のため既存のスリープ防止を解除
    enableWakeLock();  // スリープ防止を再設定
  }
});

// -----------------------------
// ページ切り替え
// -----------------------------
function showPage(id) {
  // 現画面がtimerPageで別画面に遷移する場合
  if (currentPageId === 'timerPage' && id !== 'timerPage') {
    resetTimer();       // 測定キャンセル
    disableWakeLock();  // スリープ防止を解除
  }

  // 全ページを非表示にし、指定ページのみ表示
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentPageId = id; // 現在の画面idを記録
}

// ============================== データ取得 ==============================
// -----------------------------
// 画面初期化
// -----------------------------
async function loadActivities() {
  // 2種の活動名リスト要素にアクセス、初期化
  const list = document.getElementById('activityList');
  const allList = document.getElementById('allActivityList');
  list.innerHTML = '';
  allList.innerHTML = '';

  // ユーザの活動名データ一覧を取得
  const snapshot = await getQueryData("activities", {userId: auth.currentUser.uid});

  // 活動名データ一覧をループ
  snapshot.forEach(docSnap => {
    const activity = docSnap.actName;

    // 活動リストに追加し、クリックでタイマー画面へ遷移
    if (list) {
      const li = document.createElement('li');
      li.classList.add('activityName');
      li.textContent = activity; // 表示名
      li.onclick = () => showTopTimes(activity); // 上位タイムを表示
      list.appendChild(li);
    }

    // 記録表示画面用（allActivityList）、クリックで活動毎の記録一覧へ遷移
    if (allList) {
      const li = document.createElement('li');

      // 活動名表示
      const span = document.createElement('span');
      span.classList.add('activityName');
      span.textContent = activity; // 表示名
      span.onclick = () => showActivityRecords(activity); //押下時の挙動設定
      li.appendChild(span);

      // 削除ボタン表示
      const delBtn = document.createElement('button');
      delBtn.classList.add('btn-del');
      delBtn.textContent = '削除'; // 表示名
    delBtn.onclick = async () => {  // 活動を削除するボタン追加
      await deleteActivity(activity); // async/awaitで非同期処理の削除完了を待つ
      };
      li.appendChild(delBtn);

      allList.appendChild(li);
    }
  });
}

// ========== 記録表示 ==========
async function showTopTimes(activity) {
  // 上位3タイムを表示
  const list = document.getElementById('topTimes');
  list.innerHTML = '';

  // 活動データから並び順（recOrder）を取得
  const activitySnap = await getQueryData("activities", {userId: auth.currentUser.uid, actName: activity});
  const order = activitySnap[0]?.recOrder || "asc";// デフォルトは「昇順」

  // 記録の取得・フィルタリング
  const records = await getQueryData("records", {userId: auth.currentUser.uid, actName: activity});

  const top3 = records
  .sort((a, b) => order === "asc" ? a.time - b.time : b.time - a.time)
  .slice(0, 3); // ソートし上位3件取得
  
  // 表示処理
  top3.forEach((record, index) => {
    const li = document.createElement('li');

    // 順位表示
    const rankSpan = document.createElement('span');
    rankSpan.classList.add('rank');
    rankSpan.textContent = `${index + 1}位`;
    li.appendChild(rankSpan);

    // タイムを表示
    const recordSpan = document.createElement('span');
    recordSpan.classList.add('recordText');
    const formatted = formatTime(parseFloat(record.time) * 1000); // 秒→ms→フォーマット
    const shortDate = record.date.replace(/^20/, ''); // 2025-01-01 → 25-01-01
    recordSpan.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${shortDate}）`; // 表示名
    li.appendChild(recordSpan);

    list.appendChild(li);
  });
  currentActivity = activity;
  document.getElementById('timerTitle').textContent = `${activity}のタイマー`; // ← 活動名を表示！
  showPage('timerPage');
}

async function showActivityRecords(activity, highlightLast = false) {
  // 特定の活動の全記録を表示（必要なら最後の記録をハイライト）
  const list = document.getElementById('activityRecordList');
  list.innerHTML = '';

  // 活動データから並び順（recOrder）を取得
  const activitySnap = await getQueryData("activities", {userId: auth.currentUser.uid, actName: activity});
  const order = activitySnap[0]?.recOrder || "asc";// デフォルトは「昇順」

  // 記録取得
  const allRecords = await getQueryData("records", {userId: auth.currentUser.uid, actName: activity});

  // レコード登録時の場合、最新の日付を取得（ハイライト用）
  let newestTime = 0;
  if (highlightLast) {
    newestTime = Math.max(...allRecords.map(r => new Date(r.date).getTime()));
  }

  // 並び替えて表示
  allRecords.sort((a, b) => order === "asc" ? a.time - b.time : b.time - a.time);

  // 表示処理
  allRecords.forEach((record, index) => {
    const li = document.createElement('li');

    // 削除や照合用に日付・タイムを埋め込む
    li.dataset.date = record.date;
    li.dataset.time = record.time;

    // 順位表示
    const rankSpan = document.createElement('span');
    rankSpan.classList.add('rank');
    rankSpan.textContent = `${index + 1}位`;
    li.appendChild(rankSpan);

    // タイムを表示
    const recordSpan = document.createElement('span');
    recordSpan.classList.add('recordText');
    const formatted = formatTime(parseFloat(record.time) * 1000); // 秒→ms→フォーマット
    const shortDate = record.date.replace(/^20/, ''); // 2025-01-01 → 25-01-01
    recordSpan.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${shortDate}）`; // 表示名
    li.appendChild(recordSpan);

    // 削除ボタン表示
    const delBtn = document.createElement('button');
    delBtn.classList.add('btn-del');
    delBtn.textContent = '削除'; // 表示名
    delBtn.onclick = async () => {//押下時の挙動設定
      await deleteRecord(activity, record);
    };
    li.appendChild(delBtn);

    // レコード登録時で最新の日付の場合
    if (highlightLast && new Date(record.date).getTime() === newestTime) {
      li.style.color = 'red'; // 直近の記録を赤色で表示
    }

    list.appendChild(li);
  });
  currentActivity = activity;
  document.getElementById('detailTitle').innerHTML = `${activity}の<ruby>記録<rt>きろく</rt></ruby>`; // ← 活動名を表示！
  showPage('detailPage');
}

// ========== 活動管理 ==========
async function addActivity() {
  // テキストボックスへの入力内容を取得
  const input = document.getElementById('newActivity');
  const name = input.value.trim();
  if (!name) return; // 空欄の場合何もしない

  // 活動名を既に登録済みか確認
  const existing = await getQueryData("activities", {userId: auth.currentUser.uid, actName: name});
  if (existing.length === 0) {
    // 新たな活動名を登録
    await addQueryData("activities", {
      actName: name,
      userId: auth.currentUser.uid,
      recOrder: document.getElementById("recordOrder").value //昇順、降順を取得
    });
    await loadActivities(); // 画面を更新
  } else {
    alert('同名の活動を登録済みです');
  }
  input.value = ''; // テキストボックスを空欄に戻す
}

// ============================== タイマー ==============================
// -----------------------------
// 経過時間（ms）を "0h00m00s00" 形式にフォーマット
// -----------------------------
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);         // ミリ秒から総秒数を計算(小数点切り捨てでミリ秒以下を除外)
  const h = Math.floor(totalSec / 3600);          // 総秒数から「時間」を計算(小数点切り捨てで分以下を除外)
  const min = Math.floor((totalSec % 3600) / 60); // 総秒数と時間(3600s)の余剰秒数から「分」を計算(小数点切り捨てで秒以下を除外)
  const sec = totalSec % 60;                      // 総秒数と分(60s)の余剰秒数から「秒」を計算
  const mSec = Math.floor((ms % 1000) / 10);      // 総ミリ秒と秒(1000ms)の余剰ミリ秒から2桁を算出(1/10の小数点切り捨てで1/1000秒を除外)
  return {
    text: `${h}h${String(min).padStart(2, '0')}m${String(sec).padStart(2, '0')}s`, // h00m00s 形式
    small: String(mSec).padStart(2, '0')  // 2桁で返す（1桁なら先頭に0を追加）
  };
}

// -----------------------------
// タイマー表示を更新する（HTMLに反映）
// -----------------------------
function updateTimerDisplay(ms) {
  const time = formatTime(ms);
  document.getElementById('timeDisplay').innerHTML = `${time.text}<small>${time.small}</small>`;
}

// -----------------------------
// タイマー開始（リアルタイムで表示）※タイマー再開と共通
// -----------------------------
function startTimer() {
  startTime = Date.now();  // 現在時刻(ミリ秒) 
  timerInterval = setInterval(() => {
     // 現在時刻からスタート時の時刻を引き経過時間を算出
     // 再開に備え過去の累積時間(elapsedTime※初回は0)と合算
    updateTimerDisplay(elapsedTime + (Date.now() - startTime));
  }, 10); // 10msごとに更新(setIntervalで指定した間隔で関数を繰り返す)

    // ボタン表示制御
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';

  disableWakeLockCrossPlatform(); // ← 念のため既存の Wake Lock を解除
  enableWakeLockCrossPlatform(); // ← スリープ防止ON
}

// -----------------------------
// タイマー停止（時間を加算し、リアルタイム更新停止）
// -----------------------------
function stopTimer() {
  // startTimeがnull時(停止中)の実行で記録破損回避のため
  if (!startTime) return;

  // setIntervalのループ停止で画面表示の更新を停止
  clearInterval(timerInterval);
  // リスタートに備えelapsedTimeに累積時間を記録(過去累積時間と現測定時間の合算)
  elapsedTime += Date.now() - startTime;
  startTime = null; // 初期化と停止フラグの役割

  updateTimerDisplay(elapsedTime); // 最終的な記録を画面表示

    // ボタン表示制御
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('resumeBtn').style.display = 'inline-block';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('resetBtn').style.display = 'inline-block';

  disableWakeLockCrossPlatform(); // ← スリープ防止OFF
}

// タイマー再開（前回までの時間を継続）
function resumeTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    updateTimerDisplay(elapsedTime + (Date.now() - startTime));
  }, 10);

  // ボタン表示制御
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';

  enableWakeLockCrossPlatform(); // ← スリープ防止ON
}

// タイマー保存
async function saveTimer() {
  // 記録を保存
  await addQueryData("records", {
    actName: currentActivity,
    time: elapsedTime / 1000, // 秒で登録
    date: new Date().toLocaleString(),
    userId: auth.currentUser.uid
  });

  resetTimer(); // タイマーリセット
  showActivityRecords(true); // 保存後に記録表示ページへ
}

// -----------------------------
// タイマーリセット処理
// -----------------------------
function resetTimer() {
  // setIntervalのループ停止で画面表示の更新を停止
  clearInterval(timerInterval);
  startTime = null;      // 初期化と停止フラグの役割
  elapsedTime = 0;       // 累積時間を初期化
  updateTimerDisplay(0); // 画面表示を0にリセット

  // ボタン表示制御：初期状態に戻す
  document.getElementById('startBtn').style.display = 'inline-block';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';
}

// タイマー画面から活動毎の記録一覧へ
function backTodetailPage() {
  showActivityRecords(currentActivity); // 活動毎の記録一覧へ
}

// 活動毎の記録一覧へからタイマー画面へ
function backToTimer() {
  showTopTimes(currentActivity); // タイマー画面へ
}

// 活動削除
async function deleteActivity(name) {
  if (!confirm(`活動「${name}」と、その記録を削除すると復元できません。実行しますか？`)) return;

  // activities コレクションから活動のdocIdを取得
  const actDoc = await getQueryData("activities", {userId: auth.currentUser.uid, actName: name});

  if (actDoc[0]) {
     // ユーザで活動は重複しない為、1件削除
    await deleteQueryData("activities", actDoc[0].id);
  }

  // records コレクションからその活動に属する記録を削除???????????????????????????????????????????????????こっちはifいらんの？
  const recSnaps = await getQueryData("records", {userId: auth.currentUser.uid, actName: name});
  const deletePromises = recSnaps.map(r => deleteQueryData("records", r.id));
  await Promise.all(deletePromises); // 削除終了まで待機

  // 表示更新
  await loadActivities();
}

// タイム記録削除
async function deleteRecord(activity, target) {
  if (!confirm("この記録を削除すると復元できません。実行しますか？")) return;

  // 活動名＋日時が一致する記録だけ除外して保存し直す
  const recSnaps = await getQueryData("records", {userId: auth.currentUser.uid, actName: activity});
  const targetDoc = recSnaps.find(data =>data.time === target.time && data.date === target.date);

  if (targetDoc) {
    await deleteQueryData("records", targetDoc.id);
    // DOM から該当 li を削除（innerHTML='' を使わない）
    const list = document.getElementById('activityRecordList');
    const allLis = Array.from(list.children);

    // 行を削除
    const liToRemove = Array.from(list.children).find(li =>
      li.dataset.date === target.date && parseFloat(li.dataset.time) === target.time
    );

    // htmlの表示のリストから削除した記録を除く
    if (liToRemove) liToRemove.remove();

    // 順位を再設定
    const remainingLis = document.querySelectorAll('#activityRecordList li');
    remainingLis.forEach((li, index) => {
      const rankSpan = li.querySelector('.rank');
      if (rankSpan) {
        rankSpan.textContent = `${index + 1}位`;
      }
    });
  }
}



let wakeLock = null; // Wake Lock オブジェクトを保持（Android用）

// iPhone/iPad/iPodか？
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
// Safariか？（Chrome for iOS は除外）
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// タイマー開始時などに呼び出す
async function enableWakeLockCrossPlatform() {
  // ✅ Wake Lock API が使えるブラウザ
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('✅ Wake Lock（API）開始：スリープ防止');
    } catch (e) {
      console.warn('❌ Wake Lock取得失敗:', e);
    }
  // Wake Lock が使えない環境
  } else {
    console.log('🟡 Wake Lock 非対応の環境です');
  }
}

// -----------------------------
// タイマー測定時のスリープ防止解除
// -----------------------------
async function disableWakeLock() {
  // Wake Lock API を解除
  if (wakeLock) {
    try {
      await wakeLock.release();
      console.log('✅ Wake Lock（API）解除：スリープ解除');
    } catch (e) {
      console.warn('❌ Wake Lock解除失敗:', e);
    }
    wakeLock = null;
  }
}





// バックアップ機能：activities + records を1つのJSONで保存
async function downloadBackup() {
  if (!auth.currentUser?.uid) { // 基本起こりえない
    alert("ユーザー情報の取得に失敗しました。もう一度お試しください。");
    return;
  }
  const userId = auth.currentUser.uid;

  // メッセージポップアップ
  if (!confirm("データをバックアップしますか？")) return; //キャンセルの場合は何もしない

  // Firestoreからデータ取得
  const [activities, records] = await Promise.all([
    getQueryData("activities", { userId }),
    getQueryData("records", { userId }),
  ]);

  // バックアップデータ生成
  const data = {
    activities,
    records,
    exportedAt: new Date().toISOString(),
  };

  // JSON化してダウンロード
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activityTimer_backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------
// インポート処理：JSONファイル読み込み＆登録
// -----------------------------
async function handleImportFile(event) {
  if (!auth.currentUser?.uid) { // 基本起こりえない
    alert("ユーザー情報の取得に失敗しました。もう一度お試しください。");
    return;
  }
  
  const input = document.getElementById("importFile"); // input 要素の参照
  const file = input.files[0];
  if (!file) return;

  try {
    const text = await file.text();      // 文字列で取得 
    const backupData = JSON.parse(text); // オブジェクト形式に変換

    // インポート対象のデータを取得（存在しない場合は空配列に）
    const importedActivities = backupData.activities || [];
    const importedRecords = backupData.records || [];

    // インポート内容を確認（マージ処理へ）
    const success = await mergeCheck(importedActivities, importedRecords, "import");
    if (success) {
      alert("データのインポートが完了しました");
    } else {
      alert("インポートはキャンセルされました");
    }
    
  } catch (err) {
    console.error("❌ インポート中にエラーが発生しました:", err);
    alert("ファイルの読み込みに失敗しました。形式が正しいか確認してください。");
  } finally {
    // 最後に input をクリアして、同じファイルでも再選択可能にする
    input.value = "";
  }
}

// ============================== グローバルセット ==============================
// -----------------------------
// HTMLから呼び出す関数を明示的に登録
// -----------------------------
const globalFunctions = {
  showPage, addActivity, startTimer, stopTimer, resumeTimer, saveTimer, resetTimer, 
  backTodetailPage, backToTimer, downloadBackup, handleImportFile 
};
Object.assign(window, globalFunctions);