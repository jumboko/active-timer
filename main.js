// ================================
// 活動記録タイマー
// ================================
// main.js

// インポート
import { auth } from "./firebaseCore.js";
import { getQueryData, addQueryData, deleteQueryData } from './dbUtils.js';
import { formatTime, updateTimerDisplay, resetTimer } from './timer.js';
import { mergeCheck } from './dataMerge.js';
import { funcLock } from "./functionLock.js";


let currentPageId = "homePage"; // 現在表示されているページID
export let currentActivity = null;     // 現在選択されている活動
let currentOrder = "asc";       // 現在選択されている活動の並び順

// -----------------------------
// 認証状態に変更があった場合の初期化処理(authHandler.jsから呼び出し)
// -----------------------------
window.addEventListener("auth-ready", async () => {
  await loadActivities(); // 活動一覧の読み込み
  updateTimerDisplay(0); // タイマー初期表示を0で統一（0h00m00s<small>00</small>）
  console.log("画面初期化");
});

// -----------------------------
// ページ切り替え
// -----------------------------
function showPage(id) {
  // 現画面がtimerPageで別画面に遷移する場合
  if (currentPageId === 'timerPage' && id !== 'timerPage') {
    resetTimer();  // 測定キャンセル
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
    const activity = docSnap.actName; // 活動名データから活動名取得
    const order = docSnap.recOrder || "asc";// 活動名データから並び順取得 ※デフォルトは「昇順」

    // 活動選択画面用（activityList）のエレメントを構築
    list.appendChild(makeCommonActList(activity, order, true));

    // 活動記録選択画面用（allActivityList）のエレメントを構築
    const li = document.createElement('li');
    li.appendChild(makeCommonActList(activity, order, false));

    // 削除ボタン表示
    const delBtn = document.createElement('button');
    delBtn.classList.add('btn-del');
    delBtn.textContent = '削除'; // 表示名
    delBtn.onclick = async () => {  // 活動を削除するボタン追加
      await deleteActivity(activity); // async/awaitで非同期処理の削除完了を待つ
    };
    li.appendChild(delBtn);

    allList.appendChild(li);
  });
}

// -----------------------------
// 共通の活動名エレメント作成
// -----------------------------
function makeCommonActList(activity, order, isTopTimes = true) {
  // 対象リストで設定するエレメントが異なる
  const element = document.createElement(isTopTimes ? 'li' : 'span');

  // 共通のエレメントを構築
  element.classList.add('activityName');
  element.textContent = activity; // 表示名
  element.onclick = () => {
    // グローバル変数に設定
    currentActivity = activity; 
    currentOrder = order;
    //フラグに応じて上位タイムまたは記録一覧を表示するボタン追加
    isTopTimes ? showTopTimesBL() : showActivityRecordsBL();
  };
  return element;
}

// -----------------------------
// 対象の活動の上位タイムを表示する
// -----------------------------
async function showTopTimes() {
  // 上位3タイムリスト要素にアクセス、初期化
  const list = document.getElementById('topTimes');
  list.innerHTML = '';

  // 対象活動の記録取得
  const records = await getQueryData("records", {userId: auth.currentUser.uid, actName: currentActivity});
  // ソートし上位3件取得
  const top3 = records
  .sort((a, b) => currentOrder === "asc" ? a.time - b.time : b.time - a.time)
  .slice(0, 3);
  
  // 上位3タイムリストをループ(第一引数：トップタイムデータ、第二引数:インデックス番号)
  top3.forEach((record, index) => {
    // 上位3タイムリスト表示のエレメントを構築
    list.appendChild(makeCommonRecList(record, index));
  });
  document.getElementById('timerTitle').textContent = `${currentActivity}のタイマー`; // 活動名を表示
  showPage('timerPage');
}

// -----------------------------
// 対象の活動の記録一覧を表示する（登録直後の記録をハイライト）
// -----------------------------
async function showActivityRecords(highlightLast = false) {
  // 対象活動の全記録リスト要素にアクセス、初期化
  const list = document.getElementById('activityRecordList');
  list.innerHTML = '';

  // 対象活動の記録取得
  const records = await getQueryData("records", {userId: auth.currentUser.uid, actName: currentActivity});

  // レコード登録時の場合、最新の日付を取得（ハイライト用）
  let newestTime = 0;
  if (highlightLast) {
    newestTime = Math.max(...records.map(r => new Date(r.date).getTime()));
  }

  // 記録の並び替え
  records.sort((a, b) => currentOrder === "asc" ? a.time - b.time : b.time - a.time);

  // 記録一覧リストをループ(第一引数：記録データ、第二引数:インデックス番号)
  records.forEach((record, index) => {
    // 記録一覧リストのエレメントを構築
    const li = makeCommonRecList(record, index);

    // 削除や照合用に日付・タイムを埋め込む
    li.dataset.date = record.date;
    li.dataset.time = record.time;

    // 削除ボタン表示
    const delBtn = document.createElement('button');
    delBtn.classList.add('btn-del');
    delBtn.textContent = '削除'; // 表示名
    delBtn.onclick = async () => {   //押下時の挙動設定
      await deleteRecord(currentActivity, record);
    };
    li.appendChild(delBtn);

    // レコード登録時で最新の日付の場合
    if (highlightLast && new Date(record.date).getTime() === newestTime) {
      li.style.color = 'red'; // 直近の記録を赤色で表示
    }

    list.appendChild(li);
  });
  document.getElementById('detailTitle').innerHTML = `${currentActivity}の<ruby>記録<rt>きろく</rt></ruby>`; // 活動名を表示
  showPage('detailPage');
}

// -----------------------------
// 共通の記録エレメント作成
// -----------------------------
function makeCommonRecList(record, index) {
  // エレメントを構築
  const li = document.createElement('li');

  // 順位表示
  const rankSpan = document.createElement('span');
  rankSpan.classList.add('rank');
  rankSpan.textContent = `${index + 1}位`; // 表示名
  li.appendChild(rankSpan);

  // タイムを表示
  const recordSpan = document.createElement('span');
  recordSpan.classList.add('recordText');
  const formatted = formatTime(parseFloat(record.time) * 1000); // 秒→ms→フォーマット
  const shortDate = record.date.replace(/^20/, ''); // 2025-01-01 → 25-01-01
  recordSpan.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${shortDate}）`; // 表示名
  li.appendChild(recordSpan);

  return li;
}

// ============================== 活動管理 ==============================
// -----------------------------
  // 新規活動を登録
// -----------------------------
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

// ============================== 画面遷移 ==============================
// -----------------------------
// タイマー画面から活動毎の記録一覧へ
// -----------------------------
function backTodetailPage() {
  showActivityRecordsBL(); // 活動毎の記録一覧へ
}

// -----------------------------
// 活動毎の記録一覧へからタイマー画面へ
// -----------------------------
function backToTimer() {
  showTopTimesBL(); // タイマー画面へ
}

// ============================== 削除処理 ==============================
// -----------------------------
// 活動削除（紐づく記録も同時に）
// -----------------------------
async function deleteActivity(name) {
  if (!confirm(`活動「${name}」と、その記録を削除すると復元できません。実行しますか？`)) return;

  // activitiesコレクションから活動のdocIdを取得
  const actDoc = await getQueryData("activities", {userId: auth.currentUser.uid, actName: name});

  // ユーザ内で活動は重複しない為、1件削除
  if (actDoc[0]) {
    await deleteQueryData("activities", actDoc[0].id);
  }

  // records コレクションからその活動に属する記録を削除
  const recSnaps = await getQueryData("records", {userId: auth.currentUser.uid, actName: name});
  const deletePromises = recSnaps.map(r => deleteQueryData("records", r.id)); // 0件の場合は何もしない
  await Promise.all(deletePromises); // 削除終了まで待機

  // 表示更新
  await loadActivities();
}

// -----------------------------
// 記録削除
// -----------------------------
async function deleteRecord(activity, target) {
  if (!confirm("この記録を削除すると復元できません。実行しますか？")) return;

  // 活動名＋日時が一致する記録情報を取得
  const recSnaps = await getQueryData("records", {userId: auth.currentUser.uid, actName: activity});
  const targetDoc = recSnaps.find(data =>data.time === target.time && data.date === target.date);

    // データがなければ終了
  if (!targetDoc) {
    console.warn("削除対象の記録が見つかりませんでした。", target);
    await loadActivities(); // 別画面からのDBの更新を想定し画面を更新
    return; 
  }

  await deleteQueryData("records", targetDoc.id); // 対象の記録をDB削除

  // DOMから記録一覧リストを取得し削除する行を特定
  const list = document.getElementById('activityRecordList');
  const targetLi = Array.from(list.children).find(li =>
    li.dataset.date === target.date && parseFloat(li.dataset.time) === target.time
  );

  // htmlのDOMの表示リストからDB削除した記録を取り除く
  if (targetLi) targetLi.remove();

  // DOMの残りのリストで順位を再計算して更新
  const remainingLis = list.querySelectorAll('li');
  // 記録一覧リストの中身をループ
  remainingLis.forEach((li, index) => {
    const rankSpan = li.querySelector('.rank'); // 中身から順位のエレメント取得
    rankSpan.textContent = `${index + 1}位`;    // 順位を再設定
  });
}

// ============================== バックアップ ==============================
// -----------------------------
// バックアップ機能：activities + records を1つのJSONで保存
// -----------------------------
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

// ============================== 連打防止機能設定 ==============================
const addActivityBL = funcLock(addActivity);
const showTopTimesBL = funcLock(showTopTimes);
const showActivityRecordsBL = funcLock(showActivityRecords);

// ============================== グローバルセット ==============================
// -----------------------------
// HTMLから呼び出す関数を明示的に登録
// -----------------------------
const globalFunctions = {
  showPage, addActivityBL, backTodetailPage, backToTimer, downloadBackup, handleImportFile, 
  showActivityRecords //timer.jsから呼ぶため
};
Object.assign(window, globalFunctions);