// ================================
// タイマー処理用関数をまとめたモジュール
// ================================
// timer.js

// インポート
import { auth } from "./firebaseCore.js";
import { currentActivity } from "./main.js";
import { addQueryData } from './dbUtils.js';
import { funcLock } from "./functionLock.js";

let startTime;                  // タイマーの開始時刻
let elapsedTime = 0;            // 経過時間（ms）
let timerInterval;              // リアルタイム表示用 setInterval の識別子
let wakeLock = null;            // Wake Lock スリープ防止用

// -----------------------------
// タイマー動作中に画面を再表示した場合にスリープ防止を再設定  ※タイマー画面遷移時に監視イベント設定
// -----------------------------
export function slpBlockTimerAct() {
  // 画面状態がvisible(画面再アクティブ)に変わり、startTimeがnullでない(タイマー動作中)場合
  if (document.visibilityState === "visible" && startTime) {
    disableWakeLock(); // 念のため既存のスリープ防止を解除
    enableWakeLock();  // スリープ防止を再設定
  }
}

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

  updateProgress(ms);  // 進捗バーを更新
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
  }, 33); // 33ms約30fpsごとに更新(setIntervalで指定した間隔で関数を繰り返す)

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
  setTimerBtn({resumeBtn:'inline-block', saveBtn:'inline-block', resetBtn:'inline-block', timerMemo:'inline-block'});

  disableWakeLock(); // スリープ防止を解除
//  console.log("進捗バー状況:", { perimeter, progress, dasharray: rect.style.strokeDasharray, dashoffset: rect.style.strokeDashoffset});
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
    userId: auth.currentUser.uid,
    memo: document.getElementById("timerMemo").value || ""
  });

  resetTimer(); // タイマーリセット
  showRecordListPage(true); // 保存後に記録表示ページへ(連打制御不要)
}

// -----------------------------
// タイマーリセット処理
// -----------------------------
export function resetTimer() {
  // setIntervalのループ停止で画面表示の更新を停止
  clearInterval(timerInterval);
  startTime = null;      // 初期化と停止フラグの役割
  elapsedTime = 0;       // 累積時間を初期化
  progStopFlg = false;   // 進捗バーの更新停止解除
  updateTimerDisplay(0); // 画面表示を0にリセット
  
  if (timerMsg) timerMsg.textContent = "";         // タイマーメッセージをクリア
  document.getElementById("timerMemo").value = ""; // メモをクリア

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
    timerMemo: 'none',
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

// 進捗バー制御用の変数 
let rect = null;          // 進捗バーのSVGパス要素
let perimeter = 0;        // 周囲長（px）
let topRecordTime = 0;    // 全体の制限時間（秒）
let progress = 0;         // 進捗割合（0～1）
let progStopFlg = false;  // 進捗1でバーを赤にした後停止させるフラグ
let isAsc = true;         // 記録の並び順が昇順かのフラグ
let timerMsg = null;      // トップタイム更新時のメッセージ

// -----------------------------
// 進捗バーと変数を初期化
/**-----------------------------
 * @param {number} sec - 完走にかける時間（秒）
 * @param {string} order - 並び順
 */
export function setProgressBar(sec, order) {
  initProgressBar();       // 進捗バーの初期化
  topRecordTime = sec;     // 制限時間を保存
  progress = 0;            // 初期化
  isAsc = order === 'asc'; // 昇順か確認
  if (!timerMsg) timerMsg = document.getElementById('timerMessage'); // メッセージ要素取得

//console.log("✅ setTopRecordTime 実行:", {topRecordTime});
}

// -----------------------------
// 進捗バーの再描画(初期化も含む)
// - 進捗バー初期化及び、画面リサイズ時に呼び出す
// -----------------------------
export function initProgressBar() {
  // 進捗バーのSVGパス要素取得
  if (!rect) rect = document.getElementById("progressFrame");
  // 実際の画面上でのパス長を近似
  perimeter = getScreenPerimeter(rect, 500);

  rect.style.strokeDasharray = perimeter; // 線の全長を指定
  rect.style.strokeDashoffset = perimeter * (1 - progress); // 進捗に応じた描画設定（最初は全て隠す※進捗0）

  console.log("進捗バー設定:", { perimeter, progress, dasharray: rect.style.strokeDasharray, dashoffset: rect.style.strokeDashoffset});
}

// -----------------------------
// SVG図形の画面上の周囲を近似的に計算する関数(vector-effect="non-scaling-stroke"による差異を修正)
// - サンプリングしてスクリーン座標に変換し、距離を算出
/**-----------------------------
 * @param {SVGPathElement} path - 計算対象のパス要素
 * @param {number} samples - サンプリング数（大きいほど精度↑、負荷↑）
 * @returns {number} - スクリーン座標の近似周囲長(px)
 */
function getScreenPerimeter(path, samples = 200) {
  const total = path.getTotalLength();     // SVG内部座標での周囲
  const svg = path.ownerSVGElement;        // 所属する親の<svg>要素を取得(getElementByIdで直接取得と同じ)
  const pt = svg.createSVGPoint();         // 一時的に座標を保持するオブジェクト
  const ctm = path.getScreenCTM();         // SVG内部座標をスクリーン座標に変換する計算式を持つ行列関数

  let prev = null;     // 一つ前のループで変換したスクリーン座標
  let screenLen = 0;   // スクリーン座標の累積距離

  // SVG内部座標の周囲を分割し各々の座標をスクリーン座標に変換し合算する
  for (let i = 0; i <= samples; i++) {
    // サンプリング位置（SVG内部座標での周囲をサンプル数で分割して取得）
    const len = (i / samples) * total;
    // パス上の座標（分割した周囲の位置をSVG内部座標で取得）
    const p = path.getPointAtLength(len);

    // 変換したいSVG内部座標x,yをptオブジェクトに設定
    pt.x = p.x;
    pt.y = p.y;
    // SVG内部座標→スクリーン座標変換式を用いて指定したx,y座標を変換
    const sp = pt.matrixTransform(ctm);

    // 一つ前のループの座標との距離を合算　※三平方の定理(二乗和の平方根「Math.hypot」)で前の座標と今の座標の距離を計算
    if (prev) {screenLen += Math.hypot(sp.x - prev.x, sp.y - prev.y);} // 初回は始点の位置設定のみのためスキップ
    prev = sp; // 変換したスクリーン座標を保持    
  }
  return screenLen; // スクリーン座標の周囲を返す
}

// -----------------------------
// 進捗バーを時間経過に応じて更新する
/**-----------------------------
 * @param {number} ms - 経過時間（ミリ秒）※elapsedTimeは測定中は更新されないため引数で取得
 */
function updateProgress(ms) {
  // 既存タイムがない場合は進捗はないのでスキップ、進捗が1を超えバーを赤くした後もスキップ
  if (!topRecordTime || progStopFlg) return; 

  // 経過時間（秒）
  const elapsedSec = ms / 1000;
  // 経過時間をトップ記録で割り進捗割合を計算
  progress = Math.min(elapsedSec / topRecordTime, 1);

  // dashoffset を更新して線を描画
  rect.style.strokeDashoffset = perimeter * (1 - progress);

  //制限時間内の場合
  if (progress < 1) {
    rect.style.stroke = "#4caf50"; // 緑色で進捗バー更新
  // 制限時間を超えた場合
  } else {
    const color = isAsc ? 'red' : 'aqua';               // 色を指定
    const text  = isAsc ? 'TIME UP!!' : 'NEW RECORD!!'; // メッセージ指定
    
    rect.style.stroke = color;    // 進捗バーを指定色で更新
    timerMsg.style.color = color; // タイマーメッセージを指定色で更新
    timerMsg.textContent = text;  // タイマーメッセージの内容を更新

    progStopFlg = true;   // フラグを立てて更新停止
  }

//console.log("⏱ updateProgress:", {elapsedSec,topRecordTime,progress, dashoffset: rect.style.strokeDashoffset});
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
