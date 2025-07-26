// ================================
// タイマー処理用関数をまとめたモジュール
// ================================
// timer.js

// インポート
import { addQueryData } from './dataMerge.js';
import { funcLock } from "./functionLock.js";

let startTime;                  // タイマーの開始時刻
let elapsedTime = 0;            // 経過時間（ms）
let timerInterval;              // リアルタイム表示用 setInterval の識別子
let wakeLock = null;            // Wake Lock スリープ防止用

// main.jsから引き継ぐ変数
let currentActivity = null;     // 現在選択されている活動

// -----------------------------
// 呼び出し元（main.js）から currentActivity をセットする
// -----------------------------
export function getActName(activityName) {
  currentActivity = activityName;
}

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
// 経過時間（ms）を "0h00m00s00" 形式にフォーマット
// -----------------------------
export function formatTime(ms) {
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
export function updateTimerDisplay(ms) {
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
  setTimerBtn({stopBtn: 'inline-block'});

  disableWakeLock(); // 念のため既存のスリープ防止を解除
  enableWakeLock();  // スリープ防止を設定
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
  setTimerBtn({resumeBtn:'inline-block', saveBtn:'inline-block', resetBtn:'inline-block'});

  disableWakeLock(); // スリープ防止を解除
}

// -----------------------------
// タイマー保存
// -----------------------------
async function saveTimer() {
  // 記録を保存
  await addQueryData("records", {
    actName: currentActivity,
    time: elapsedTime / 1000, // 秒で登録
    date: new Date().toLocaleString(),
    userId: auth.currentUser.uid
  });

  resetTimer(); // タイマーリセット
  showActivityRecords(true); // 保存後に記録表示ページへ(連打制御不要)
}

// -----------------------------
// タイマーリセット処理
// -----------------------------
export function resetTimer() {
  // setIntervalのループ停止で画面表示の更新を停止
  clearInterval(timerInterval);
  startTime = null;      // 初期化と停止フラグの役割
  elapsedTime = 0;       // 累積時間を初期化
  updateTimerDisplay(0); // 画面表示を0にリセット

  // ボタン表示制御：初期状態に戻す
  setTimerBtn({startBtn: 'inline-block'});
  // スリープ防止を解除
  disableWakeLock();
}

// -----------------------------
// タイマーボタン表示制御
// -----------------------------
function setTimerBtn(config) {
  // ボタンidと状態のオブジェクト作成、引数で上書き
  const buttons = {
    startBtn: 'none',
    stopBtn: 'none',
    resumeBtn: 'none',
    saveBtn: 'none',
    resetBtn: 'none',
    ...config // 引数のオブジェクトを展開し表示するボタンを上書き
  };

  // オブジェクトを配列化しループ、ステータスを画面に反映しボタン表示制御
  for (const [id, status] of Object.entries(buttons)) {
    document.getElementById(id).style.display = status;
  }
}

// -----------------------------
// タイマー測定時のスリープ防止設定
// -----------------------------
async function enableWakeLock() {
  // Wake Lock API が使えるブラウザ
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('✅ Wake Lock（API）開始：スリープ防止起動');
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
      console.log('✅ Wake Lock（API）解除：スリープ防止解除');
    } catch (e) {
      console.warn('❌ Wake Lock解除失敗:', e);
    }
    wakeLock = null;
  }
}

// ============================== 連打防止機能設定 ==============================
const startTimerBL = funcLock(startTimer);
const stopTimerBL = funcLock(stopTimer);
const saveTimerBL = funcLock(saveTimer);

// ============================== グローバルセット ==============================
// -----------------------------
// HTMLから呼び出す関数を明示的に登録
// -----------------------------
const globalFunctions = {
  startTimerBL, stopTimerBL, saveTimerBL, resetTimer
};
Object.assign(window, globalFunctions);
