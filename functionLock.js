// ================================
// 関数ロック機能
// ================================
// functionLock.js

let lockFlg = false; // ボタンの連打回避のためのフラグ

// -----------------------------
// ボタンの連打等の関数連続実行を防止し非同期関数を安全に実行するラッパー
/** ----------------------------
 * @param {function} fn - 実行したい非同期関数
 * @returns {function} - 実行したい非同期関数に関数ロックをラッパーした関数
 */
export function funcLock(fn) {
  // 実際に呼ばれた際に処理を実施するためfunctionをreturn
  return async function (...args) { // (...args)で引数がある場合にも対応
    if (lockFlg) {
      console.log("ボタン連打を検知、制御しました");
      return; // tureの場合処理中断
    }
    lockFlg = true; // 連打防止フラグON

    try {
      await fn(...args);  // ここで渡された本来の関数を実行
    } finally {
      lockFlg = false;         // ロック解除
    }
  };
}