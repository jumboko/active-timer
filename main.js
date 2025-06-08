// ================================
// 活動記録タイマー - ロジック編（改良版）
// ================================

// タイマー用変数
let startTime;             // 計測開始時刻（ミリ秒）
let elapsedTime = 0;       // 経過時間（ミリ秒）

// ページが読み込まれたときの初期化処理
window.onload = () => {
  loadActivities();  // 活動リストを表示
  loadRecords();     // 記録一覧を表示
};

console.log("JS読み込まれてるよ");

// ========== ユーティリティ関数 ==========

// localStorageから安全にrecords配列を取得
function getRecordArray() {
  const raw = localStorage.getItem('records');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// ========== 活動リストの管理 ==========

// 登録済みの活動をプルダウンに表示
function loadActivities() {
  const select = document.getElementById('activitySelect');
  const activities = JSON.parse(localStorage.getItem('activities')) || [];

  select.innerHTML = ''; // 一旦リセット

  // 活動名ごとに<option>を追加
  activities.forEach(activity => {
    const option = document.createElement('option');
    option.value = activity;
    option.textContent = activity;
    select.appendChild(option);
  });
}

// 新しい活動を追加（重複チェックあり）
function addActivity() {
  const input = document.getElementById('newActivity');
  const name = input.value.trim();
  if (!name) return;

  const activities = JSON.parse(localStorage.getItem('activities')) || [];

  if (!activities.includes(name)) {
    activities.push(name);
    localStorage.setItem('activities', JSON.stringify(activities));
    loadActivities(); // 画面更新
  }

  input.value = ''; // 入力欄クリア
}

// ========== タイマー関連 ==========

// タイマースタート（開始時刻を記録）
function startTimer() {
  startTime = Date.now();  // 現在時刻を記録
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('timeDisplay').textContent = '計測中...';
}

// タイマーストップ（終了時刻と経過時間を表示）
function stopTimer() {
  if (!startTime) return;

  const endTime = Date.now();
  elapsedTime = endTime - startTime;

  const seconds = (elapsedTime / 1000).toFixed(1);
  document.getElementById('timeDisplay').textContent = `記録時間：${seconds} 秒`;

  document.getElementById('saveBtn').disabled = false;
}

// ========== 記録の保存と表示 ==========

// 保存前に確認ダイアログを出す
function confirmSave() {
  const confirmResult = confirm("この記録を保存しますか？");
  if (confirmResult) {
    saveRecord();
  }
}

// 記録を保存（localStorageに追記）
function saveRecord() {
  const activity = document.getElementById('activitySelect').value;
  const date = new Date().toLocaleString();  // 日付・時刻
  const seconds = (elapsedTime / 1000).toFixed(1); // 秒に変換

  const records = getRecordArray(); // 安全に配列取得
  records.push({ activity, time: seconds, date }); // 新しい記録を追加
  localStorage.setItem('records', JSON.stringify(records)); // 保存

  loadRecords(); // 表示更新

  // タイマーリセット
  document.getElementById('saveBtn').disabled = true;
  document.getElementById('timeDisplay').textContent = '';
  startTime = null;
}

// 記録の一覧を画面に表示
function loadRecords() {
  const list = document.getElementById('recordList');
  list.innerHTML = ''; // 一旦リセット

  const records = getRecordArray(); // 配列取得

  // 新しい記録が上に来るように逆順で表示
  records.slice().reverse().forEach((record, index) => {
    const li = document.createElement('li');
    li.textContent = `[${record.date}] ${record.activity}：${record.time}秒`;

    // 削除ボタン追加
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.onclick = () => deleteRecord(records.length - 1 - index); // 元のインデックス指定
    li.appendChild(delBtn);

    list.appendChild(li);
  });
}

// 指定した記録を削除
function deleteRecord(index) {
  const records = getRecordArray();
  if (index >= 0 && index < records.length) {
    records.splice(index, 1); // 1件削除
    localStorage.setItem('records', JSON.stringify(records)); // 保存
    loadRecords(); // 再表示
  }
}
