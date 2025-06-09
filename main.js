// ================================
// 活動記録タイマー - ロジック編（仕様変更対応版）
// ================================

let startTime; // タイマーの開始時刻
let elapsedTime = 0; // 経過時間（ms）
let resumedTime = 0; // 再開時の累積時間
let currentActivity = null; // 現在選択されている活動
let currentPageId = "homePage"; // 現在表示されているページID

// ページ読み込み時の初期化処理
window.onload = () => {
  loadActivities(); // 活動一覧の読み込み
};

// ========== ページ切り替え ==========
function showPage(id) {
  // すべてのページを非表示にし、指定ページのみ表示
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentPageId = id;
}

// ========== ユーティリティ ==========
function getRecordArray() {
  // localStorageから記録データを取得し、配列として返す
  const raw = localStorage.getItem('records');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// ========== 活動管理 ==========
function loadActivities() {
  // 活動リストとセレクトボックスを再描画
  const list = document.getElementById('activityList');
  const select = document.getElementById('activitySelect');
  const activities = JSON.parse(localStorage.getItem('activities')) || [];

  if (list) list.innerHTML = '';
  if (select) select.innerHTML = '';

  activities.forEach(activity => {
    // セレクトボックスに追加
    const option = document.createElement('option');
    option.value = activity;
    option.textContent = activity;
    if (select) select.appendChild(option);

    // 活動リストに追加し、クリックでタイマー画面へ遷移
    if (list) {
      const li = document.createElement('li');
      li.textContent = activity;
      li.onclick = () => {
        currentActivity = activity;
        showPage('timerPage');
        showTopTimes(activity); // 上位タイムを表示
      };
      list.appendChild(li);
    }
  });
}

function addActivity() {
  // 新規活動を登録
  const input = document.getElementById('newActivity');
  const name = input.value.trim();
  if (!name) return;

  const activities = JSON.parse(localStorage.getItem('activities')) || [];
  if (!activities.includes(name)) {
    activities.push(name);
    localStorage.setItem('activities', JSON.stringify(activities));
    loadActivities();
  }
  input.value = '';
}

// ========== タイマー ==========
function startTimer() {
  // タイマー開始
  startTime = Date.now();
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('resumeBtn').disabled = true;
  document.getElementById('timeDisplay').textContent = '計測中...';
}

function stopTimer() {
  // タイマー停止、経過時間を計算
  if (!startTime) return;
  elapsedTime += Date.now() - startTime;
  startTime = null;
  const seconds = (elapsedTime / 1000).toFixed(1);
  document.getElementById('timeDisplay').textContent = `記録時間：${seconds} 秒`;
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('resumeBtn').disabled = false;
}

function resumeTimer() {
  // タイマー再開
  startTime = Date.now();
  document.getElementById('timeDisplay').textContent = '再開中...';
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('resumeBtn').disabled = true;
}

function confirmSave() {
  // 保存確認ダイアログ
  const confirmResult = confirm("この記録を保存しますか？");
  if (confirmResult) {
    saveRecord();
  }
}

function saveRecord() {
  // 記録を保存
  const date = new Date().toLocaleString();
  const seconds = (elapsedTime / 1000).toFixed(1);

  const records = getRecordArray();
  records.push({ activity: currentActivity, time: seconds, date });
  localStorage.setItem('records', JSON.stringify(records));

  // タイマーリセット
  elapsedTime = 0;
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('resumeBtn').disabled = true;
  document.getElementById('timeDisplay').textContent = '';

  showActivityRecords(currentActivity, true); // 保存後に記録表示ページへ
}

// ========== 記録表示 ==========
function showTopTimes(activity) {
  // 上位3タイムを表示
  const list = document.getElementById('topTimes');
  list.innerHTML = '';
  const records = getRecordArray().filter(r => r.activity === activity);
  const top = records.sort((a, b) => parseFloat(a.time) - parseFloat(b.time)).slice(0, 3);

  top.forEach(record => {
    const li = document.createElement('li');
    li.textContent = `${record.time}秒（${record.date}）`;
    list.appendChild(li);
  });
}

function showActivitiesPage() {
  // 活動記録ページ表示
  showPage('activityPage');
  loadActivities();
}

function showActivityRecords(activity, highlightLast = false) {
  // 特定の活動の全記録を表示（必要なら最後の記録をハイライト）
  const list = document.getElementById('activityRecordList');
  list.innerHTML = '';
  const records = getRecordArray().filter(r => r.activity === activity);

  const lastTime = highlightLast ? records[records.length - 1]?.time : null;

  records.sort((a, b) => parseFloat(a.time) - parseFloat(b.time)).forEach(record => {
    const li = document.createElement('li');
    li.textContent = `${record.time}秒（${record.date}）`;
    if (highlightLast && record.time === lastTime) {
      li.style.color = 'red'; // 直近の記録を赤色で表示
    }
    list.appendChild(li);
  });
  showPage('detailPage');
}

function showAllRecordsPage() {
  // 全活動の一覧ページを表示
  const list = document.getElementById('allActivityList');
  list.innerHTML = '';
  const activities = JSON.parse(localStorage.getItem('activities')) || [];

  activities.forEach(activity => {
    const li = document.createElement('li');
    li.textContent = activity;
    li.onclick = () => showActivityRecords(activity); // 活動クリックでその記録へ
    list.appendChild(li);
  });
  
}
