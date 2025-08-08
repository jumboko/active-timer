// ================================
// モーダル画面表示用
// ================================
// modalHandler.js

import { formatTime } from './timer.js';

// -----------------------------
// モーダル画面を開く関数
// -----------------------------
export function openModal({ title = "", body = "", buttons = [] }) {
  // モーダル画面にタイトルとボディ設定
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
 
  const footer = document.getElementById("modalFooter");
  footer.innerHTML = "";  // 既存ボタン削除

  // 設定されたボタンの数分作成
  buttons.forEach(btn => {
    const button = document.createElement("button");
    button.textContent = btn.text; // 表示名
    button.onclick = btn.onClick || closeModal; // btn.onClick定義がなければcloseModal関数を設定
    footer.appendChild(button); 
  });
  document.getElementById("modal").style.display = "block"; // モーダル画面表示
}

// -----------------------------
// モーダル画面を閉じる関数
// -----------------------------
export function closeModal() {
  document.getElementById("modal").style.display = "none"; // モーダル画面非表示
}

// -----------------------------
// HTMLから使うためにグローバル登録
// -----------------------------
window.closeModal = closeModal;