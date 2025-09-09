// ================================
// 活動記録タイマー
// ================================
// main.js

// インポート
import { auth } from "./firebaseCore.js";
import { getQueryData, addQueryData, updateQueryData, deleteQueryData } from './dbUtils.js';
import { formatTime, resetTimer, slpBlockTimerAct, setProgressBar, initProgressBar } from './timer.js';
import { mergeCheck } from './dataMerge.js';
import { funcLock } from "./functionLock.js";


let currentPageId = "homePage";    // 現在表示されているページID
export let currentActivity = null; // 現在選択されている活動
let currentOrder = "asc";          // 現在選択されている活動の並び順
let currentRecord = null;          // 現在選択されている記録

// -----------------------------
// 認証状態に変更があった場合の初期化処理(authHandler.jsから呼び出し)
// -----------------------------
window.addEventListener("auth-ready", async () => {
  await loadActivities(); // 活動一覧の読み込み
  console.log("画面初期化");
});

// -----------------------------
// ページ切り替え
// -----------------------------
function showPage(id) {
  // タイマー画面に遷移
  if (id === 'timerPage') {
    window.addEventListener("resize", initProgressBar); // resize監視(タイマー画面進捗バー用)
    document.addEventListener("visibilitychange", slpBlockTimerAct); // スリープ防止監視(タイマー画面測定中)

  // 現画面がtimerPageで別画面に遷移する場合
  } else if (currentPageId === 'timerPage' && id !== 'timerPage') {
    window.removeEventListener("resize", initProgressBar); // resize監視(タイマー画面進捗バー用)を解除
    document.removeEventListener("visibilitychange", slpBlockTimerAct); // スリープ防止監視(タイマー画面測定中)を解除
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
  const actSelList = document.getElementById('actSelectList');
  const actHisList = document.getElementById('actHistoryList');
  actSelList.innerHTML = '';
  actHisList.innerHTML = '';

  // ユーザの活動名データ一覧を取得
  const snapshot = await getQueryData("activities", {userId: auth.currentUser.uid});

  // 活動名データ一覧をループ
  snapshot.forEach(docSnap => {
    const activity = docSnap.actName; // 活動名データから活動名取得
    const order = docSnap.recOrder || "asc";// 活動名データから並び順取得 ※デフォルトは「昇順」

    // 活動選択画面用（actSelectList）のエレメントを構築
    actSelList.appendChild(makeCommonActList(activity, order, true));

    // 活動記録選択画面用（actHistoryList）のエレメントを構築
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

    actHisList.appendChild(li);
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
    isTopTimes ? showTimerPageBL() : showRecordListPageBL();
  };
  return element;
}

// -----------------------------
// 対象の活動の上位タイムを表示する
// -----------------------------
async function showTimerPage() {
  // 上位3タイムリスト要素にアクセス、初期化
  const list = document.getElementById('topTimesList');
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
  resetTimer(); // 測定キャンセル ※タイマー画面以外の時は基本リセット済だが念のため初期化

  document.getElementById('timerTitle').textContent = `${currentActivity}のタイマー`; // 活動名を表示
  showPage('timerPage');

  setProgressBar(records[0]?.time); // 進捗バーの設定のため1位の記録を渡す(記録なし=undefined)※showPageの後に書く
}

// -----------------------------
// 対象の活動の記録一覧を表示する（登録直後の記録をハイライト）
// -----------------------------
async function showRecordListPage(highlightLast = false) {
  // 対象活動の全記録リスト要素にアクセス、初期化
  const list = document.getElementById('recordList');
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
    const li = makeCommonRecList(record, index, true);

    // 削除や照合、切替用に日付・タイム・メモを埋め込む
    li.dataset.date = record.date;
    li.dataset.time = record.time;
    li.dataset.memo = record.memo || ""; // ※falseな値(null、undefined)の場合、空文字を設定

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
      li.querySelector(".recordText").classList.add("highlightRec"); // 直近の記録を赤色で表示(CSSで対応)
    }

    list.appendChild(li);
  });

  // タイム・メモ切替ボタンも初期化  
  const btn = document.getElementById("chngRecViwBtn");
  // メモモードにした時のCSS設定用クラス名が残っている場合に備え削除処理
  list.classList.remove("memo-mode");
  // 記録の有無でボタン表示・非表示を設定
  if (records.length === 0) {
    btn.style.display = "none"; // 非表示
  } else {
    btn.style.display = "inline-block"; // 表示
    btn.dataset.mode = "time";   // タイムモードが初期表示
    btn.textContent = "メモ表示";
  }

  document.getElementById('recordListTitle').innerHTML = `${currentActivity}の<ruby>記録<rt>きろく</rt></ruby>`; // 活動名を表示
  showPage('recordListPage');
}

// -----------------------------
// 共通の記録エレメント作成
// -----------------------------
function makeCommonRecList(record, index,  enableClick = false) {
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
  const shortDate = record.date.slice(2); // 2025-01-01 → 25-01-01
  recordSpan.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${shortDate}）`; // 表示名
  // 活動毎の記録一覧に遷移する場合、クリックで記録詳細画面に遷移
  if (enableClick) {
    recordSpan.onclick = () => {
      showRecordDetailPage(record, index); // クリックで記録詳細へ
    };
  }
  li.appendChild(recordSpan);

  return li;
}

// ============================== 活動毎の記録一覧 ==============================
// -----------------------------
// 記録一覧の表示モード切替（タイム ⇔ メモ）
// -----------------------------
function changeRecViewBtn() {
  // タイム・メモ切替ボタンと対象活動の全記録リスト要素にアクセス
  const btn = document.getElementById("chngRecViwBtn");
  const list = document.getElementById("recordList");
  // タイムモードか確認
  const isTimeMode = btn.dataset.mode !== "memo"; 

  // モード切り替え
  btn.dataset.mode = isTimeMode ? "memo" : "time";         // 元がタイムモードならメモモードに
  btn.textContent = isTimeMode ? "タイム表示" : "メモ表示";  // 元がタイムモードならメモモードになるため切替ボタンは「タイム表示」に

  // chngRecViwBtnがメモモードの場合、recordListにclass名memo-modeを付与(CSSでメモモードの時だけ省略表示にするため)
  list.classList.toggle("memo-mode", btn.dataset.mode === "memo");

  // リスト内容を更新するためループ
  list.querySelectorAll("li").forEach(li => {
    // タイムモードの場合
    if (btn.dataset.mode === "time") {
      // タイム表示
      const formatted = formatTime(parseFloat(li.dataset.time) * 1000); // 秒→ms→フォーマット
      const shortDate = li.dataset.date.slice(2); // 2025-01-01 → 25-01-01
      li.querySelector(".recordText").innerHTML = `${formatted.text}<small>${formatted.small}</small>（${shortDate}）`;

    // メモモードの場合
    } else {
      // メモ表示
      li.querySelector(".recordText").textContent = li.dataset.memo?.trim() || "メモなし";
    }
  });
}

// ============================== 記録詳細画面 ==============================
// -----------------------------
// 対象の記録詳細を表示する
// -----------------------------
function showRecordDetailPage(record, rank) {
  currentRecord = record; // 対象記録をグローバル変数に設定
  const formatted = formatTime(parseFloat(record.time) * 1000); // 秒→ms→フォーマット

  // 各種フィールドに値を設定
  document.getElementById("detailRank").textContent = `${rank + 1}位`; //rank=indexのため0スタート
  document.getElementById("detailTime").innerHTML = `${formatted.text}<small>${formatted.small}</small>`;
  document.getElementById("detailDate").textContent = record.date;
  document.getElementById("detailMemo").value = record.memo || '';

  // 編集モードを初期状態に戻す（非編集状態）
  setMemoEditMode(false);

  document.getElementById("recordDetailTitle").innerHTML = `${currentActivity}の<ruby>記録詳細<rt>きろくしょうさい</rt></ruby>`;
  showPage("recordDetailPage");
}

// -----------------------------
// 記録詳細のメモ編集モードに変更(htmlから呼ぶため関数化)
// -----------------------------
function editMemo() {
  setMemoEditMode(true); // 編集モード
}

// -----------------------------
// 記録詳細のメモ編集モードを解除
// -----------------------------
function cancelEditedMemo() {
  setMemoEditMode(false); // 編集モード解除
  document.getElementById("detailMemo").value = currentRecord.memo || ""; // メモを初期化
}

// -----------------------------
// 記録詳細のメモ編集モード制御
// -----------------------------
function setMemoEditMode(isEditing) {
  document.getElementById("detailMemo").readOnly = !isEditing; // 編集モードの場合readOnlyをfalseへ
  document.getElementById("editMemoBtn").style.display = isEditing ? "none" : "block";
  document.getElementById("saveMemoBtn").style.display = isEditing ? "block" : "none";
  document.getElementById("cancelMemoBtn").style.display = isEditing ? "block" : "none";
}

// -----------------------------
// 記録詳細のメモを更新する
// -----------------------------
async function saveEditedMemo() {
  // テキストボックスへの入力内容を取得
  const newMemo = document.getElementById("detailMemo").value.trim();

  // 文字数制限を超えた場合
  if (newMemo.length > 100) {
    alert("メモは最大100文字までです");
    return;
  }
  // メモに変更がなければ何もしない
  if ((currentRecord.memo || '') === newMemo) {
    alert("変更がありません");
    return;
  }

  // 現在のレコードと同一の Firestore ドキュメントを検索
  const recSnaps = await getQueryData("records", {
    userId: auth.currentUser.uid,
    actName: currentActivity,
    time: currentRecord.time,
    date: currentRecord.date
  });

  // 上記条件に一致するのは1件のみ
  if (!recSnaps[0]) {
    alert("対象の記録が見つかりませんでした");
    return;
  }

  // Firestoreのmemoを更新（他のフィールドは変更しない）
  await updateQueryData("records", recSnaps[0].id, { memo: newMemo });

  // DOMから対象活動の全記録リスト要素を取得
  const list = document.getElementById("recordList");

  // DOMから更新する要素を特定
  const targetLi = Array.from(list.children).find(li =>
    li.dataset.date === currentRecord.date && parseFloat(li.dataset.time) === currentRecord.time
  );

  // メモを更新
  if (targetLi) {
    targetLi.dataset.memo =  newMemo;  // メモのデータセットを更新
    
    // タイム・メモ切替ボタンにアクセス
    const btn = document.getElementById("chngRecViwBtn");
    // メモモードだった場合は表示も更新
    const isMemoMode = btn.dataset.mode == "memo"; 
    if (isMemoMode) targetLi.querySelector(".recordText").textContent = newMemo;
  }

  setMemoEditMode(false); // 編集モード解除
  currentRecord.memo = newMemo; // UI上も更新
  alert("メモを保存しました");
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
function backToRecordListPage() {
  showRecordListPageBL(); // 活動毎の記録一覧へ
}

// -----------------------------
// 活動毎の記録一覧へからタイマー画面へ
// -----------------------------
function backToTimerPage() {
  showTimerPageBL(); // タイマー画面へ
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
  const list = document.getElementById('recordList');
  const targetLi = Array.from(list.children).find(li =>
    li.dataset.date === target.date && parseFloat(li.dataset.time) === target.time
  );

  // htmlのDOMの表示リストからDB削除した記録を取り除く
  if (targetLi) targetLi.remove();

  // 記録一覧リストの中身をループし、DOMの残りのリストで順位を再計算して更新
  list.querySelectorAll('li').forEach((li, index) => {
    li.querySelector('.rank').textContent = `${index + 1}位`;    // 順位を再設定
  });

  // 残り件数0の場合、タイム・メモ切替ボタンを非表示
  const chngBtn = document.getElementById("chngRecViwBtn");
  if (list.children.length === 0) {
    chngBtn.style.display = "none"; // 非表示
  }
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
const showTimerPageBL = funcLock(showTimerPage);
const showRecordListPageBL = funcLock(showRecordListPage);
const saveEditedMemoBL = funcLock(saveEditedMemo);

// ============================== グローバルセット ==============================
// -----------------------------
// HTMLから呼び出す関数を明示的に登録
// -----------------------------
const globalFunctions = {
  showPage, addActivityBL, backToRecordListPage, backToTimerPage, downloadBackup, handleImportFile, 
  changeRecViewBtn, editMemo, cancelEditedMemo, saveEditedMemoBL, 
  showRecordListPage //timer.jsから呼ぶため
};
Object.assign(window, globalFunctions);