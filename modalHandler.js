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

// ============================== 各モーダルの設定 ==============================
// -----------------------------
// メモマージ通知モーダル
// -----------------------------
export function showMergeModal(warnings) {
  //bodyを作成(差分メモ一覧を表示し修正を促す)
  const warningHtml = `
    <p>以下の記録でメモに差分がありマージしました。</p>
    <ul>
      ${warnings.map(w => {
        const t = formatTime(w.time * 1000); // w.time * 1000 = 秒→ms→フォーマット
        return `<li>活動名：${w.actName}<br>記録名：${t.text}<small>${t.small}</small> (${w.date})</li>`;
      }).join("")}
    </ul>
    <p>※ 手動でメモを修正し、「ここからマージメモ」の記載を削除してください。</p>
    <p>※ 未修正の場合、次回インポート時にメモのマージは行われません。</p>
  `; 

  openModal({
    title: "⚠️ メモマージ通知",
    body: warningHtml ,
    buttons: [{ text: "OK" }]
  });
}

// -----------------------------
// HTMLから使うためにグローバル登録
// -----------------------------
window.closeModal = closeModal;