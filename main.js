// ================================
// 活動記録タイマー
// ================================

// firebase-init.js を読み込む
import "./firebase-init.js";
// Firestore 関連の操作関数を個別に import
import {
  collection, getDocs, addDoc, deleteDoc, doc, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

const db = window.firebaseDB;
const auth = window.firebaseAuth;

let startTime; // タイマーの開始時刻
let elapsedTime = 0; // 経過時間（ms）
let resumedTime = 0; // 再開時の累積時間
let timerInterval; // リアルタイム表示用 setInterval の識別子
let currentActivity = null; // 現在選択されている活動
let currentPageId = "homePage"; // 現在表示されているページID

// 認証状態に変更があった場合の初期化処理
window.addEventListener("auth-ready", async () => {
  await loadActivities(); // 活動一覧の読み込み
  updateTimerDisplay(0); // タイマー初期表示を0で統一（0h00m00s<small>00</small>）
});

// ========== ページ切り替え ==========
function showPage(id) {
  // もし今の画面が timerPage で、離れようとしているならリセット
  if (currentPageId === 'timerPage' && id !== 'timerPage') {
    resetTimer(); // 測定キャンセルとみなす
  }

  // すべてのページを非表示にし、指定ページのみ表示
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentPageId = id; // 現在の画面idを記録
}

// ========== データ取得(活動名を取得し2画面の表示設定) ==========
async function loadActivities() {
  // 活動リストとセレクトボックスを再描画
  const list = document.getElementById('activityList');
  const allList = document.getElementById('allActivityList');
  const snapshot = await getDocs(
    query(collection(db, "activities"), where("userId", "==", auth.currentUser.uid))
  );

  if (list) list.innerHTML = '';
  if (allList) allList.innerHTML = '';

  snapshot.forEach(docSnap => {
    const activity = docSnap.data().name;

    // 活動リストに追加し、クリックでタイマー画面へ遷移
    if (list) {
      const li = document.createElement('li');
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
      delBtn.classList.add('deleteBtn');
      delBtn.textContent = '削除'; // 表示名
      delBtn.onclick = async () => {  //押下時の挙動設定
        await deleteActivity(activity);
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
  const snapshot = await getDocs(
    query(collection(db, "records"), where("userId", "==", auth.currentUser.uid))
  );
  const records = snapshot.docs
    .map(doc => doc.data())
    .filter(r => r.activity === activity)
    .sort((a, b) => parseFloat(a.time) - parseFloat(b.time))
    .slice(0, 3);

  records.forEach(record => {
    const li = document.createElement('li');
    const formatted = formatTime(parseFloat(record.time) * 1000); // 秒 → ms → 表示形式に変換
    li.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${record.date}）`;
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
  const snapshot = await getDocs(
    query(collection(db, "records"), where("userId", "==", auth.currentUser.uid))
  );
  const allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(r => r.activity === activity);

  // レコード登録時の場合、最新の日付を取得
  let newestTime = 0;
  if (highlightLast) {
    newestTime = Math.max(...allRecords.map(r => new Date(r.date).getTime()));
  }

  allRecords.sort((a, b) => parseFloat(a.time) - parseFloat(b.time)).forEach(record => {
    const li = document.createElement('li');

    // タイムを表示
    const span = document.createElement('span');
    span.classList.add('recordText');
    const formatted = formatTime(parseFloat(record.time) * 1000); // 秒→ms→フォーマット
    span.innerHTML = `${formatted.text}<small>${formatted.small}</small>（${record.date}）`; // 表示名
    li.appendChild(span);

    // 削除ボタン表示
    const delBtn = document.createElement('button');
    delBtn.classList.add('deleteBtn');
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
console.log("現在のUID:", auth.currentUser?.uid);
  if (!auth.currentUser) {
    alert("まだ認証が完了していません。少し待ってからもう一度試してください。");
    return;
  }
  // 新規活動を登録
  const input = document.getElementById('newActivity');
  const name = input.value.trim();
  if (!name) return;

  const snapshot = await getDocs(collection(db, "activities"));
  const exists = snapshot.docs.some(doc => doc.data().name === name);
  if (!exists) {

console.log("追加直前の userId:", auth.currentUser.uid);

    await addDoc(collection(db, "activities"), { 
      name,
      userId: auth.currentUser.uid
    });
    await loadActivities();
  }
  input.value = '';
}

// ========== タイマー ==========
// 経過時間（ms）を "0h00m00s00" 形式にフォーマット
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10); // 小数点以下2桁
  return {
    text: `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`,
    small: String(hundredths).padStart(2, '0')
  };
}

// タイマー表示を更新する（HTMLに反映）
function updateTimerDisplay(ms) {
  const time = formatTime(ms);
  document.getElementById('timeDisplay').innerHTML = `${time.text}<small>${time.small}</small>`;
}

// タイマー開始（リアルタイムで表示）
function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    updateTimerDisplay(elapsedTime + (Date.now() - startTime));
  }, 10); // 10msごとに更新

    // ボタン表示制御
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'inline-block';
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('resetBtn').style.display = 'none';
}

// タイマー停止（時間を加算し、リアルタイム更新停止）
function stopTimer() {
  if (!startTime) return;
  clearInterval(timerInterval);
  elapsedTime += Date.now() - startTime;
  startTime = null;

  updateTimerDisplay(elapsedTime);

    // ボタン表示制御
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('resumeBtn').style.display = 'inline-block';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('resetBtn').style.display = 'inline-block';
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
}

async function saveTimer() {
  // 記録を保存
  const date = new Date().toLocaleString();
  const seconds = elapsedTime / 1000;

  await addDoc(collection(db, "records"), {
    activity: currentActivity,
    time: seconds,
    date: date,
    userId: auth.currentUser.uid
  });

  // タイマーリセット
  resetTimer();

  showActivityRecords(currentActivity, true); // 保存後に記録表示ページへ
}

// タイマーリセット処理
function resetTimer() {
  clearInterval(timerInterval); // インターバル停止
  startTime = null;
  elapsedTime = 0;
  updateTimerDisplay(0); // 表示を0にリセット

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

  // activities コレクションから活動を削除
  const snapshot = await getDocs(
    query(collection(db, "activities"), where("userId", "==", auth.currentUser.uid))
  );
  const actDoc = snapshot.docs.find(doc => doc.data().name === name);
  if (actDoc) {
    await deleteDoc(doc(db, "activities", actDoc.id));
  }

  // records コレクションからその活動に属する記録を削除
  const recSnap = await getDocs(collection(db, "records"));
  const deletePromises = recSnap.docs
    .filter(doc => doc.data().activity === name)
    .map(doc => deleteDoc(doc.ref));

  await Promise.all(deletePromises);

  // 表示更新
  await loadActivities();
}

// タイム削除
async function deleteRecord(activity, target) {
  if (!confirm("この記録を削除すると復元できません。実行しますか？")) return;

  // 活動名＋日時が一致する記録だけ除外して保存し直す
  const snapshot = await getDocs(
    query(collection(db, "records"), where("userId", "==", auth.currentUser.uid))
  );
  const targetDoc = snapshot.docs.find(doc => {
    const data = doc.data();
    return data.activity === activity && data.time === target.time && data.date === target.date;
  });

  if (targetDoc) {
    await deleteDoc(doc(db, "records", targetDoc.id));
    showActivityRecords(activity); // 再描画
  }
}

// HTMLから呼び出す関数を明示的に登録
const globalFunctions = {
  showPage, addActivity, startTimer, stopTimer, resumeTimer, saveTimer, resetTimer, backTodetailPage, backToTimer
};
Object.assign(window, globalFunctions);