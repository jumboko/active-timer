// ================================
// 活動毎の記録一覧のレコードをソート
// ================================
// sortRecords.js

// -----------------------------
// ソートオプションを定義
// -----------------------------
const sortOptions = [
  { value: "time-asc", label: "最短記録順" },
  { value: "time-desc", label: "最長記録順" },
  { value: "date-asc", label: "古い日付順" },
  { value: "date-desc", label: "最新日付順" }
];

// -----------------------------
// ソートプルダウン作成
// -----------------------------
export function createSortOptions() {
  // sortSelector: DOM上のソート用<select>要素を取得
  const sortSelector = document.getElementById("sortSelector");
  sortSelector.innerHTML = "";  // 既存の<option>をすべて削除して初期化

  // sortOptions配列に定義されたソート項目をループし、<option>を作成して追加
  sortOptions.forEach(opt => {
    const option = document.createElement("option"); // 新しい<option>要素
    option.value = opt.value;         // value属性にソートキーを設定（例: "time-asc"）
    option.textContent = opt.label;   // ユーザーに表示する文字列
    sortSelector.appendChild(option); // <select> に追加
  });
}

// -----------------------------
// ソートプルダウンの指定を活動に応じた内容に変更
// -----------------------------
export function setSortSelector(currentOrder) {
  // sortSelector: DOM上のソート用<select>要素を取得
  const sortSelector = document.getElementById("sortSelector");

  // currentOrder に合わせて選択 ※currentOrder は "asc" or "desc" で保存されている前提
  if (currentOrder === "asc") {
    sortSelector.value = "time-asc";  // 最短記録順を初期選択
  } else if (currentOrder === "desc") {
    sortSelector.value = "time-desc"; // 最長記録順を初期選択
  }
}

// -----------------------------
// ソート関数（「ソート」ボタン押下時に実行）
// -----------------------------
function sortRecords() {
  // 現在選択されているソート条件を取得
  const criteria = document.getElementById("sortSelector").value;
  // recordList: 記録一覧の<ul>要素を取得
  const list = document.getElementById("recordList");
  // <li> 要素を配列に変換（NodeList → Array）
  const items = Array.from(list.querySelectorAll("li"));

  // 各<li>の data-* 属性（data-time, data-date）を使ってソートする
  items.sort((a, b) => {
    let valA, valB; // 比較用の値を格納する

    // 選択したソート条件に対応する処理を実行
    switch (criteria) {
      case "time-asc": // 記録時間の昇順（小さい順）でソート
        valA = Number(a.dataset.time); // 秒単位などの数値
        valB = Number(b.dataset.time);
        return valA - valB;

      case "time-desc": // 記録時間の降順（大きい順）でソート
        valA = Number(a.dataset.time);
        valB = Number(b.dataset.time);
        return valB - valA;

      case "date-asc": // 日付の昇順（古い順）でソート
        valA = new Date(a.dataset.date).getTime(); // 日付文字列 → タイムスタンプ
        valB = new Date(b.dataset.date).getTime();
        return valA - valB;

      case "date-desc": // 日付の降順（新しい順）でソート
        valA = new Date(a.dataset.date).getTime();
        valB = new Date(b.dataset.date).getTime();
        return valB - valA;
    }
  });

  // 並べ替えた要素をDOMに反映
  items.forEach(item => list.appendChild(item));
}

// -----------------------------
// HTMLから使うためにグローバル登録
// -----------------------------
window.sortRecords = sortRecords;